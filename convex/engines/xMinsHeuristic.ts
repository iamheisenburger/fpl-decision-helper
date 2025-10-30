/**
 * xMins Heuristic Engine
 *
 * Provides minute predictions using simple statistical methods
 * Used as fallback when ML models aren't available or data is sparse
 */

import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";

interface HealthyStart {
  minutes: number;
  date: number;
  started: boolean;
}

interface HeuristicPrediction {
  playerId: string;
  gameweek: number;
  startProb: number;
  xMinsStart: number;
  p90: number;
  source: "heuristic";
  flags: {
    sparseFallback?: boolean;
    roleLock?: boolean;
    recentWeightApplied?: boolean;
  };
}

/**
 * Calculate xMins using recency-weighted healthy starts
 */
export const predictWithHeuristic = query({
  args: {
    playerId: v.id("players"),
    gameweek: v.number(),
    recencyWindow: v.optional(v.number()), // How many recent GWs to consider
    minHealthyStarts: v.optional(v.number()), // Min starts needed for confidence
  },
  handler: async (ctx, args): Promise<HeuristicPrediction | null> => {
    const recencyWindow = args.recencyWindow || 8;
    const minHealthyStarts = args.minHealthyStarts || 5;

    // Get recent healthy starts
    const healthyStarts = await ctx.runQuery(api.appearances.getHealthyStarts, {
      playerId: args.playerId,
      limit: recencyWindow,
      excludeInjury: true,
      excludeRedCard: true,
    });

    if (healthyStarts.length === 0) {
      return null;
    }

    const flags: HeuristicPrediction["flags"] = {};

    // Check if sparse data
    if (healthyStarts.length < minHealthyStarts) {
      flags.sparseFallback = true;
    }

    // Calculate start probability
    const allAppearances = await ctx.runQuery(api.appearances.getPlayerAppearances, {
      playerId: args.playerId,
      limit: recencyWindow,
    });

    const startsInWindow = allAppearances.filter((a: any) => a.started).length;
    const startProb = allAppearances.length > 0
      ? startsInWindow / Math.min(allAppearances.length, recencyWindow)
      : 0.5;

    // Calculate recency-weighted minutes
    const weights = calculateRecencyWeights(healthyStarts.length);
    flags.recentWeightApplied = true;

    let weightedMinutes = 0;
    let totalWeight = 0;

    for (let i = 0; i < healthyStarts.length; i++) {
      weightedMinutes += healthyStarts[i].minutes * weights[i];
      totalWeight += weights[i];
    }

    const xMinsStart = totalWeight > 0 ? weightedMinutes / totalWeight : 0;

    // Detect role lock (3+ consecutive 85+ minute starts)
    const roleLock = detectRoleLock(healthyStarts);
    if (roleLock) {
      flags.roleLock = true;
    }

    // Calculate P90 using granular buckets
    const p90 = calculateP90FromXMins(xMinsStart, roleLock);

    return {
      playerId: args.playerId,
      gameweek: args.gameweek,
      startProb,
      xMinsStart,
      p90,
      source: "heuristic",
      flags,
    };
  },
});

/**
 * Batch predict for multiple players
 */
export const batchPredictHeuristic = query({
  args: {
    playerIds: v.array(v.id("players")),
    gameweek: v.number(),
    recencyWindow: v.optional(v.number()),
    minHealthyStarts: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<any> => {
    const predictions = await Promise.all(
      args.playerIds.map((playerId) =>
        ctx.runQuery(api.engines.xMinsHeuristic.predictWithHeuristic, {
          playerId,
          gameweek: args.gameweek,
          recencyWindow: args.recencyWindow,
          minHealthyStarts: args.minHealthyStarts,
        })
      )
    );

    return predictions.filter((p: any): p is HeuristicPrediction => p !== null);
  },
});

/**
 * Store heuristic predictions to xmins table
 */
export const storeHeuristicPredictions = mutation({
  args: {
    predictions: v.array(
      v.object({
        playerId: v.id("players"),
        gameweek: v.number(),
        startProb: v.number(),
        xMinsStart: v.number(),
        p90: v.number(),
        flags: v.optional(
          v.object({
            sparseFallback: v.optional(v.boolean()),
            roleLock: v.optional(v.boolean()),
            recentWeightApplied: v.optional(v.boolean()),
          })
        ),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    for (const pred of args.predictions) {
      await ctx.runMutation(api.xmins.upsertXMins, {
        playerId: pred.playerId,
        gameweek: pred.gameweek,
        startProb: pred.startProb,
        xMinsStart: pred.xMinsStart,
        p90: pred.p90,
        source: "heuristic",
        flags: pred.flags,
      });
    }

    return {
      stored: args.predictions.length,
    };
  },
});

// ===== Helper Functions =====

/**
 * Calculate recency weights (exponential decay)
 * Most recent appearance gets highest weight
 */
function calculateRecencyWeights(count: number): number[] {
  if (count === 0) return [];
  if (count === 1) return [1.0];

  // Default weights for up to 8 appearances
  const defaultWeights = [0.3, 0.25, 0.2, 0.1, 0.08, 0.04, 0.02, 0.01];

  if (count <= 8) {
    const weights = defaultWeights.slice(0, count);
    const sum = weights.reduce((a, b) => a + b, 0);
    return weights.map((w) => w / sum); // Normalize
  }

  // For more than 8, use exponential decay
  const weights: number[] = [];
  const alpha = 0.8; // Decay factor

  for (let i = 0; i < count; i++) {
    weights.push(Math.pow(alpha, i));
  }

  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => w / sum);
}

/**
 * Detect role lock: 3+ consecutive 85+ minute starts
 */
function detectRoleLock(healthyStarts: HealthyStart[], threshold = 3): boolean {
  if (healthyStarts.length < threshold) return false;

  let consecutive = 0;

  for (let i = 0; i < threshold; i++) {
    if (healthyStarts[i].minutes >= 85 && healthyStarts[i].started) {
      consecutive++;
    } else {
      break;
    }
  }

  return consecutive >= threshold;
}

/**
 * Calculate P90 from xMins using granular buckets
 * Matches the existing calculateP90 function in calculations.ts
 */
function calculateP90FromXMins(xMins: number, roleLock: boolean): number {
  // Role lock bonus: increase P90 slightly
  const roleLockBonus = roleLock ? 0.05 : 0;

  if (xMins >= 95) return Math.min(1.0 + roleLockBonus, 1.0);
  if (xMins >= 90) return Math.min(0.9 + roleLockBonus, 1.0);
  if (xMins >= 88) return Math.min(0.85 + roleLockBonus, 1.0);
  if (xMins >= 86) return Math.min(0.75 + roleLockBonus, 0.95);
  if (xMins >= 84) return Math.min(0.65 + roleLockBonus, 0.85);
  if (xMins >= 82) return Math.min(0.55 + roleLockBonus, 0.75);
  if (xMins >= 80) return Math.min(0.45 + roleLockBonus, 0.65);
  if (xMins >= 75) return Math.min(0.30 + roleLockBonus, 0.50);
  if (xMins >= 70) return Math.min(0.15 + roleLockBonus, 0.35);
  return 0.0;
}

/**
 * Apply team/position priors when data is very sparse
 */
export const calculatePositionPriors = query({
  args: {
    position: v.union(v.literal("GK"), v.literal("DEF"), v.literal("MID"), v.literal("FWD")),
    gameweek: v.number(),
  },
  handler: async (ctx, args): Promise<any> => {
    // Get all appearances for this position in recent gameweeks
    const recentGWs = [args.gameweek - 1, args.gameweek - 2, args.gameweek - 3].filter(
      (gw) => gw > 0
    );

    const allAppearances = [];

    for (const gw of recentGWs) {
      const gwAppearances = await ctx.runQuery(api.appearances.getGameweekAppearances, {
        gameweek: gw,
      });

      // Filter by position (need to join with players)
      for (const app of gwAppearances) {
        const player = await ctx.db.get(app.playerId);
        if (player?.position === args.position) {
          allAppearances.push(app);
        }
      }
    }

    if (allAppearances.length === 0) {
      // Fallback defaults by position
      const defaults: Record<string, { startProb: number; xMinsStart: number; p90: number }> = {
        GK: { startProb: 0.9, xMinsStart: 88, p90: 0.85 },
        DEF: { startProb: 0.7, xMinsStart: 80, p90: 0.5 },
        MID: { startProb: 0.6, xMinsStart: 75, p90: 0.35 },
        FWD: { startProb: 0.6, xMinsStart: 70, p90: 0.25 },
      };

      return defaults[args.position] || defaults.MID;
    }

    // Calculate average stats for starters
    const starters = allAppearances.filter((a) => a.started);
    const startProb = starters.length / allAppearances.length;

    const avgMinutes =
      starters.length > 0
        ? starters.reduce((sum, a) => sum + a.minutes, 0) / starters.length
        : 70;

    const p90 = calculateP90FromXMins(avgMinutes, false);

    return {
      startProb,
      xMinsStart: avgMinutes,
      p90,
    };
  },
});
