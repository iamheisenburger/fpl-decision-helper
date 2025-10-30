import { query } from "../_generated/server";
import { v } from "convex/values";
import {
  calculateP90,
  calculateTotalScore,
} from "./calculations";

/**
 * Captaincy Decision Engine
 *
 * Simple, predictable logic:
 * 1. Calculate Total Score for each player: EV + (EV95-EV)×P90×0.5 + eoShield - variancePenalty
 * 2. Decision: Pick player with highest Total Score (EO protection baked in)
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

    // Calculate Total Scores independently (includes EO shield at 0.1 EV per 10% EO)
    const highEOTotalScore = calculateTotalScore(
      {
        ev: highEO.gw.ev,
        ev95: highEO.gw.ev95,
        xMins: highEO.gw.xMins,
        eo: highEO.gw.eo,
      },
      settings.captaincyEoRate
    );

    const altTotalScore = calculateTotalScore(
      {
        ev: alt.gw.ev,
        ev95: alt.gw.ev95,
        xMins: alt.gw.xMins,
        eo: alt.gw.eo,
      },
      settings.captaincyEoRate
    );

    // Decision: Pick player with highest Total Score (EO protection already baked in)
    const recommendedPlayer = highEOTotalScore >= altTotalScore ? highEO : alt;
    const winningScore = Math.max(highEOTotalScore, altTotalScore);
    const losingScore = Math.min(highEOTotalScore, altTotalScore);
    const scoreGap = winningScore - losingScore;

    // Calculate P90 values for display
    const p90HighEO = calculateP90(highEO.gw.xMins);
    const p90Alt = calculateP90(alt.gw.xMins);

    // Calculate ceiling bonuses for display
    const highEOCeilingBonus = (highEO.gw.ev95 - highEO.gw.ev) * p90HighEO;
    const altCeilingBonus = (alt.gw.ev95 - alt.gw.ev) * p90Alt;

    // Calculate EO shields for display
    const highEOEoShield = (highEO.gw.eo / 10) * settings.captaincyEoRate;
    const altEoShield = (alt.gw.eo / 10) * settings.captaincyEoRate;

    // Calculate EO gap for display
    const eoGap = Math.abs(highEO.gw.eo - alt.gw.eo);

    // Generate reasoning
    const reasoning = `${recommendedPlayer.player.name} has the highest Total Score (${winningScore.toFixed(2)}) with EO protection baked in`;

    return {
      // Decision
      recommendedPlayerId: recommendedPlayer.id,
      recommendedPlayerName: recommendedPlayer.player.name,
      winningScore,
      losingScore,
      scoreGap,

      // Players comparison
      highEOPlayer: {
        id: highEO.id,
        name: highEO.player.name,
        ev: highEO.gw.ev,
        ev95: highEO.gw.ev95,
        xMins: highEO.gw.xMins,
        eo: highEO.gw.eo,
        p90: p90HighEO,
        totalScore: highEOTotalScore,
        ceilingBonus: highEOCeilingBonus,
        eoShield: highEOEoShield,
      },
      altPlayer: {
        id: alt.id,
        name: alt.player.name,
        ev: alt.gw.ev,
        ev95: alt.gw.ev95,
        xMins: alt.gw.xMins,
        eo: alt.gw.eo,
        p90: p90Alt,
        totalScore: altTotalScore,
        ceilingBonus: altCeilingBonus,
        eoShield: altEoShield,
      },

      // Calculation details
      eoGap,

      // Explanation
      reasoning,
    };
  },
});
