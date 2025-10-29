import { query } from "../_generated/server";
import { v } from "convex/values";
import { calculateRAEV, calculateP90 } from "./calculations";

/**
 * XI Optimizer - Smart Greedy + Local Search Algorithm
 *
 * Optimizes team selection (11 starters from 15 squad players) by maximizing
 * Risk-Adjusted EV (RAEV) while respecting formation constraints:
 * - 1 GK (always starts)
 * - 3-5 DEF
 * - 3-5 MID
 * - 1-3 FWD
 * - Total: 11 players
 *
 * Algorithm:
 * 1. Calculate RAEV for all 15 players
 * 2. Greedy selection: pick highest RAEV per position
 * 3. Local search: try swapping bench <-> starters to improve total RAEV
 * 4. Return best XI with formation and top pivot recommendations
 */

interface PlayerWithRAEV {
  playerId: string;
  name: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  ev: number;
  ev95: number;
  xMins: number;
  eo: number;
  raev: number;
  p90: number;
}

interface Formation {
  gk: number;
  def: number;
  mid: number;
  fwd: number;
}

function isValidFormation(formation: Formation): boolean {
  return (
    formation.gk === 1 &&
    formation.def >= 3 &&
    formation.def <= 5 &&
    formation.mid >= 3 &&
    formation.mid <= 5 &&
    formation.fwd >= 1 &&
    formation.fwd <= 3 &&
    formation.gk + formation.def + formation.mid + formation.fwd === 11
  );
}

export const optimizeXI = query({
  args: {
    gameweek: v.number(),
    preferredFormation: v.optional(
      v.union(
        v.literal("any"),
        v.literal("4-4-2"),
        v.literal("3-5-2"),
        v.literal("4-3-3"),
        v.literal("3-4-3"),
        v.literal("5-4-1"),
        v.literal("5-3-2")
      )
    ),
  },
  handler: async (ctx, args) => {
    // Get user settings
    const settings = await ctx.db.query("userSettings").first();
    if (!settings) {
      throw new Error("User settings not found. Please configure settings first.");
    }

    // Get user squad for this gameweek
    const squadEntries = await ctx.db
      .query("userSquad")
      .withIndex("by_gameweek", (q) => q.eq("gameweek", args.gameweek))
      .collect();

    if (squadEntries.length === 0) {
      throw new Error(`No squad found for gameweek ${args.gameweek}`);
    }

    // Get all player data with RAEV
    const playersWithRAEV: PlayerWithRAEV[] = [];

    for (const squadEntry of squadEntries) {
      const player = await ctx.db.get(squadEntry.playerId);
      if (!player) continue;

      const gwData = await ctx.db
        .query("gameweekInputs")
        .withIndex("by_player_gameweek", (q) =>
          q.eq("playerId", squadEntry.playerId).eq("gameweek", args.gameweek)
        )
        .first();

      if (!gwData) continue;

      // Get template for this position
      const template = await ctx.db
        .query("templates")
        .withIndex("by_position_gameweek", (q) =>
          q.eq("position", player.position).eq("gameweek", args.gameweek)
        )
        .first();

      const templateEo = template?.baselineEo ?? 50; // default to 50% if no template
      const templateEv95P90 = template?.baselineEv95P90 ?? 5.0; // default benchmark

      const raev = calculateRAEV(
        {
          ev: gwData.ev,
          ev95: gwData.ev95,
          xMins: gwData.xMins,
          eo: gwData.eo,
        },
        templateEo,
        templateEv95P90,
        {
          xiEoRate: settings.xiEoRate,
          xiEoCap: settings.xiEoCap,
          rminsWeight: settings.rminsWeight,
        }
      );

      playersWithRAEV.push({
        playerId: squadEntry.playerId,
        name: player.name,
        position: player.position,
        ev: gwData.ev,
        ev95: gwData.ev95,
        xMins: gwData.xMins,
        eo: gwData.eo,
        raev,
        p90: calculateP90(gwData.xMins),
      });
    }

    // Separate by position
    const gks = playersWithRAEV.filter((p) => p.position === "GK");
    const defs = playersWithRAEV.filter((p) => p.position === "DEF").sort((a, b) => b.raev - a.raev);
    const mids = playersWithRAEV.filter((p) => p.position === "MID").sort((a, b) => b.raev - a.raev);
    const fwds = playersWithRAEV.filter((p) => p.position === "FWD").sort((a, b) => b.raev - a.raev);

    // Phase 1: Greedy selection
    let bestXI: PlayerWithRAEV[] = [];
    let bestFormation: Formation = { gk: 1, def: 3, mid: 3, fwd: 1 };
    let bestTotalRAEV = -Infinity;

    // Try different formations
    const formationsToTry: Formation[] = [];

    if (args.preferredFormation) {
      // Parse preferred formation
      if (args.preferredFormation === "4-4-2") {
        formationsToTry.push({ gk: 1, def: 4, mid: 4, fwd: 2 });
      } else if (args.preferredFormation === "3-5-2") {
        formationsToTry.push({ gk: 1, def: 3, mid: 5, fwd: 2 });
      } else if (args.preferredFormation === "4-3-3") {
        formationsToTry.push({ gk: 1, def: 4, mid: 3, fwd: 3 });
      } else if (args.preferredFormation === "3-4-3") {
        formationsToTry.push({ gk: 1, def: 3, mid: 4, fwd: 3 });
      } else if (args.preferredFormation === "5-4-1") {
        formationsToTry.push({ gk: 1, def: 5, mid: 4, fwd: 1 });
      } else if (args.preferredFormation === "5-3-2") {
        formationsToTry.push({ gk: 1, def: 5, mid: 3, fwd: 2 });
      } else {
        // "any" - try all valid formations
        formationsToTry.push(
          { gk: 1, def: 3, mid: 5, fwd: 2 },
          { gk: 1, def: 3, mid: 4, fwd: 3 },
          { gk: 1, def: 4, mid: 4, fwd: 2 },
          { gk: 1, def: 4, mid: 3, fwd: 3 },
          { gk: 1, def: 5, mid: 4, fwd: 1 },
          { gk: 1, def: 5, mid: 3, fwd: 2 }
        );
      }
    } else {
      // Default: try all valid formations
      formationsToTry.push(
        { gk: 1, def: 3, mid: 5, fwd: 2 },
        { gk: 1, def: 3, mid: 4, fwd: 3 },
        { gk: 1, def: 4, mid: 4, fwd: 2 },
        { gk: 1, def: 4, mid: 3, fwd: 3 },
        { gk: 1, def: 5, mid: 4, fwd: 1 },
        { gk: 1, def: 5, mid: 3, fwd: 2 }
      );
    }

    for (const formation of formationsToTry) {
      if (!isValidFormation(formation)) continue;

      // Check if we have enough players for this formation
      if (
        gks.length < formation.gk ||
        defs.length < formation.def ||
        mids.length < formation.mid ||
        fwds.length < formation.fwd
      ) {
        continue;
      }

      const xi: PlayerWithRAEV[] = [
        ...gks.slice(0, formation.gk),
        ...defs.slice(0, formation.def),
        ...mids.slice(0, formation.mid),
        ...fwds.slice(0, formation.fwd),
      ];

      const totalRAEV = xi.reduce((sum, p) => sum + p.raev, 0);

      if (totalRAEV > bestTotalRAEV) {
        bestTotalRAEV = totalRAEV;
        bestXI = xi;
        bestFormation = formation;
      }
    }

    // Phase 2: Local search - try swapping bench <-> starters
    const bench = playersWithRAEV.filter((p) => !bestXI.some((starter) => starter.playerId === p.playerId));

    let improved = true;
    let iterations = 0;
    const maxIterations = 50;

    while (improved && iterations < maxIterations) {
      improved = false;
      iterations++;

      for (let i = 0; i < bestXI.length; i++) {
        for (let j = 0; j < bench.length; j++) {
          const starter = bestXI[i];
          const benched = bench[j];

          // Can only swap same position (except GK is locked)
          if (starter.position !== benched.position || starter.position === "GK") {
            continue;
          }

          // Try swap
          const raevDiff = benched.raev - starter.raev;
          if (raevDiff > 0.01) {
            // Beneficial swap found
            bestXI[i] = benched;
            bench[j] = starter;
            bestTotalRAEV += raevDiff;
            improved = true;
          }
        }
      }
    }

    // Calculate XI bleed (EV lost vs pure EV optimization)
    const pureEVXI = playersWithRAEV.sort((a, b) => b.ev - a.ev).slice(0, 11);
    const pureEVTotal = pureEVXI.reduce((sum, p) => sum + p.ev, 0);
    const actualEVTotal = bestXI.reduce((sum, p) => sum + p.ev, 0);
    const xiBleed = Math.max(0, pureEVTotal - actualEVTotal);

    // Find top 3 pivot options (bench players who could improve XI)
    const pivotOptions = bench
      .map((benchPlayer) => {
        // Find best starter to replace
        const startersInSamePos = bestXI.filter((s) => s.position === benchPlayer.position);
        if (startersInSamePos.length === 0) return null;

        const worstStarter = startersInSamePos.reduce((worst, current) =>
          current.raev < worst.raev ? current : worst
        );

        const margin = benchPlayer.raev - worstStarter.raev;

        return {
          benchPlayer: benchPlayer.name,
          starterToReplace: worstStarter.name,
          margin,
          evDiff: benchPlayer.ev - worstStarter.ev,
          eoDiff: benchPlayer.eo - worstStarter.eo,
          rminsBonus: (benchPlayer.ev95 * benchPlayer.p90) - (worstStarter.ev95 * worstStarter.p90),
        };
      })
      .filter((p) => p !== null)
      .sort((a, b) => b!.margin - a!.margin)
      .slice(0, 3);

    return {
      xi: bestXI.map((p) => ({
        playerId: p.playerId,
        name: p.name,
        position: p.position,
        ev: p.ev,
        eo: p.eo,
        raev: p.raev,
      })),
      bench: bench.map((p) => ({
        playerId: p.playerId,
        name: p.name,
        position: p.position,
        ev: p.ev,
        eo: p.eo,
        raev: p.raev,
      })),
      formation: `${bestFormation.def}-${bestFormation.mid}-${bestFormation.fwd}`,
      totalRAEV: bestTotalRAEV,
      totalEV: actualEVTotal,
      xiBleed,
      pivotOptions,
    };
  },
});
