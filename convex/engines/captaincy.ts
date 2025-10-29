import { query } from "../_generated/server";
import { v } from "convex/values";
import {
  calculateP90,
  calculateTolerance,
  calculateRMinsSurcharge,
  calculateEVGapEffective,
  calculateXMinsPenalty,
} from "./calculations";

/**
 * Captaincy Decision Engine
 *
 * Takes two player candidates and returns a recommendation based on:
 * 1. EO tolerance (0.1 EV per 10% EO gap, capped at 1.0 EV)
 * 2. Raw EV gap
 * 3. rMins surcharge (if high-EO player has less upside)
 * 4. xMins penalty (if candidate has risky minutes)
 *
 * Decision: Pick high-EO if effective_gap ≤ tolerance, else pick higher-EV
 */

export const analyzeCaptaincy = query({
  args: {
    gameweek: v.number(),
    player1Id: v.id("players"),
    player2Id: v.id("players"),
  },
  handler: async (ctx, args) => {
    // Get user settings
    const settings = await ctx.db.query("userSettings").first();
    if (!settings) {
      throw new Error("User settings not found. Please configure settings first.");
    }

    // Get player data
    const player1 = await ctx.db.get(args.player1Id);
    const player2 = await ctx.db.get(args.player2Id);

    if (!player1 || !player2) {
      throw new Error("One or both players not found");
    }

    // Get gameweek inputs for both players
    const gw1 = await ctx.db
      .query("gameweekInputs")
      .withIndex("by_player_gameweek", (q) =>
        q.eq("playerId", args.player1Id).eq("gameweek", args.gameweek)
      )
      .first();

    const gw2 = await ctx.db
      .query("gameweekInputs")
      .withIndex("by_player_gameweek", (q) =>
        q.eq("playerId", args.player2Id).eq("gameweek", args.gameweek)
      )
      .first();

    if (!gw1 || !gw2) {
      throw new Error(
        `Gameweek ${args.gameweek} data not found for one or both players`
      );
    }

    // Identify high-EO player and alternative
    const isPlayer1HighEO = gw1.eo >= gw2.eo;
    const highEO = isPlayer1HighEO
      ? { player: player1, gw: gw1, id: args.player1Id }
      : { player: player2, gw: gw2, id: args.player2Id };
    const alt = isPlayer1HighEO
      ? { player: player2, gw: gw2, id: args.player2Id }
      : { player: player1, gw: gw1, id: args.player1Id };

    // Calculate EO gap and tolerance
    const eoGap = highEO.gw.eo - alt.gw.eo;
    const tolerance = calculateTolerance(
      eoGap,
      settings.captaincyEoRate,
      settings.captaincyEoCap
    );

    // Calculate raw EV gap (alt - highEO, positive means alt is better)
    const evGapRaw = alt.gw.ev - highEO.gw.ev;

    // Calculate P90 values
    const p90HighEO = calculateP90(highEO.gw.xMins);
    const p90Alt = calculateP90(alt.gw.xMins);

    // Calculate rMins surcharge
    // This penalizes switching away from high-EO if they have more upside
    const rMinsSurcharge = calculateRMinsSurcharge(
      { ev95: highEO.gw.ev95, xMins: highEO.gw.xMins },
      { ev95: alt.gw.ev95, xMins: alt.gw.xMins },
      settings.rminsWeight
    );

    // Calculate xMins penalty for alt (if risky minutes)
    const xMinsPenalty = calculateXMinsPenalty(
      alt.gw.xMins,
      settings.xMinsThreshold,
      settings.xMinsPenalty
    );

    // Calculate effective EV gap
    const evGapEffective = calculateEVGapEffective(
      evGapRaw,
      rMinsSurcharge,
      xMinsPenalty
    );

    // Make decision
    const pickHighEO = evGapEffective <= tolerance;
    const recommendedId = pickHighEO ? highEO.id : alt.id;
    const recommendedPlayer = pickHighEO ? highEO.player : alt.player;
    const recommendedGw = pickHighEO ? highEO.gw : alt.gw;

    // Calculate captain bleed (EV lost by picking high-EO when alt is better)
    const captainBleed = pickHighEO ? Math.max(0, evGapEffective) : 0;

    // Generate reasoning
    let reasoning = "";
    if (pickHighEO) {
      reasoning = `EV gap effective (${evGapEffective.toFixed(
        2
      )}) ≤ tolerance (${tolerance.toFixed(
        2
      )}) → Shield ${recommendedPlayer.name} (${recommendedGw.eo.toFixed(1)}% EO)`;
    } else {
      reasoning = `EV gap effective (${evGapEffective.toFixed(
        2
      )}) > tolerance (${tolerance.toFixed(
        2
      )}) → Chase ${recommendedPlayer.name} (${recommendedGw.ev.toFixed(1)} EV)`;
    }

    // Additional context for reasoning
    if (rMinsSurcharge > 0.1) {
      reasoning += ` | rMins surcharge: ${rMinsSurcharge.toFixed(2)} EV`;
    }
    if (xMinsPenalty > 0) {
      reasoning += ` | xMins penalty: ${xMinsPenalty.toFixed(2)} EV`;
    }

    return {
      // Decision
      recommendedPlayerId: recommendedId,
      recommendedPlayerName: recommendedPlayer.name,
      pickHighEO,

      // Players comparison
      highEOPlayer: {
        id: highEO.id,
        name: highEO.player.name,
        ev: highEO.gw.ev,
        ev95: highEO.gw.ev95,
        xMins: highEO.gw.xMins,
        eo: highEO.gw.eo,
        p90: p90HighEO,
      },
      altPlayer: {
        id: alt.id,
        name: alt.player.name,
        ev: alt.gw.ev,
        ev95: alt.gw.ev95,
        xMins: alt.gw.xMins,
        eo: alt.gw.eo,
        p90: p90Alt,
      },

      // Calculation details
      eoGap,
      tolerance,
      evGapRaw,
      rMinsSurcharge,
      xMinsPenalty,
      evGapEffective,
      captainBleed,

      // Explanation
      reasoning,
    };
  },
});
