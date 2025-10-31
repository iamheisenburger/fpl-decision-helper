/**
 * ML Prediction Engine
 *
 * Calls external ML service (FastAPI) to predict player minutes using trained models.
 * Two-stage model: P(start) × E[minutes | start] = xMins
 *
 * Fallback: If ML service is unavailable, falls back to heuristic engine.
 */

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";

// ML Service URL (set via environment variable)
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";

interface MLPrediction {
  playerId: string;
  gameweek: number;
  startProb: number;
  xMinsStart: number;
  xMins: number;
  p90: number;
  uncertaintyLo?: number;
  uncertaintyHi?: number;
  source: string;
  modelVersion: string;
  flags: {
    sparse_data?: boolean;
    role_lock?: boolean;
  };
}

interface HeuristicPrediction {
  playerId: string;
  gameweek: number;
  startProb: number;
  xMinsStart: number;
  p90: number;
  source: string;
  flags: {
    sparseFallback?: boolean;
    roleLock?: boolean;
    recentWeightApplied?: boolean;
  };
}

/**
 * Predict player minutes using ML model
 */
export const predictWithML = action({
  args: {
    playerId: v.id("players"),
    gameweek: v.number(),
    recencyWindow: v.optional(v.number()), // Number of recent games to use (default: 8)
  },
  handler: async (ctx, args): Promise<HeuristicPrediction | null> => {
    try {
      // Get player data
      const player = await ctx.runQuery(api.players.getPlayer, {
        id: args.playerId,
      });

      if (!player) {
        console.warn(`[ML] Player not found: ${args.playerId}`);
        return null;
      }

      // Get recent appearances (last 8 games)
      const recencyWindow = args.recencyWindow || 8;
      const appearances = await ctx.runQuery(api.appearances.getPlayerAppearances, {
        playerId: args.playerId,
        limit: recencyWindow,
      });

      // If no appearances, fall back to heuristic (which handles sparse data)
      if (!appearances || appearances.length === 0) {
        console.log(`[ML] No appearances for ${player.name}, falling back to heuristic`);
        return await ctx.runQuery(api.engines.xMinsHeuristic.predictWithHeuristic, {
          playerId: args.playerId,
          gameweek: args.gameweek,
          recencyWindow,
        });
      }

      // Get home/away for the target gameweek (requires fixture data)
      let isHome = true; // Default assumption
      if (player.fplId) {
        try {
          const bootstrapResponse = await fetch(
            "https://fantasy.premierleague.com/api/bootstrap-static/"
          );
          const bootstrapData = await bootstrapResponse.json();
          const fplPlayer = bootstrapData.elements.find((p: any) => p.id === player.fplId);

          if (fplPlayer) {
            const playerTeamId = fplPlayer.team;
            const fixtureDifficulty = await ctx.runQuery(
              api.fixtures.getTeamFixtureDifficulty,
              {
                teamId: playerTeamId,
                gameweek: args.gameweek,
              }
            );

            if (fixtureDifficulty) {
              isHome = fixtureDifficulty.isHome;
            }
          }
        } catch (error) {
          console.warn(`[ML] Failed to determine home/away, using default (home):`, error);
        }
      }

      // Format appearances for ML service
      const formattedAppearances = appearances.map((app: any) => ({
        gameweek: app.gameweek,
        season: app.season || "2024-25",
        started: app.started,
        minutes: app.minutes,
        injExit: app.injExit || false,
        redCard: app.redCard || false,
        date: app.date,
        homeAway: app.homeAway,
      }));

      // Call ML service
      const requestBody = {
        playerId: args.playerId,
        playerName: player.name,
        position: player.position,
        team: player.team,
        price: player.price,
        gameweek: args.gameweek,
        isHome,
        appearances: formattedAppearances,
      };

      console.log(`[ML] Calling ML service for ${player.name} (GW${args.gameweek})...`);

      const mlResponse = await fetch(`${ML_SERVICE_URL}/predict`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!mlResponse.ok) {
        console.warn(`[ML] Service returned ${mlResponse.status}, falling back to heuristic`);
        return await ctx.runQuery(api.engines.xMinsHeuristic.predictWithHeuristic, {
          playerId: args.playerId,
          gameweek: args.gameweek,
          recencyWindow,
        });
      }

      const mlPrediction: MLPrediction = await mlResponse.json();

      console.log(
        `[ML] ✅ ${player.name}: startProb=${mlPrediction.startProb.toFixed(2)}, xMinsStart=${mlPrediction.xMinsStart.toFixed(1)}`
      );

      // Convert ML response to heuristic format (for compatibility)
      return {
        playerId: args.playerId,
        gameweek: args.gameweek,
        startProb: mlPrediction.startProb,
        xMinsStart: mlPrediction.xMinsStart,
        p90: mlPrediction.p90,
        source: "model", // Mark as ML prediction
        flags: {
          sparseFallback: mlPrediction.flags.sparse_data,
          roleLock: mlPrediction.flags.role_lock,
          recentWeightApplied: true,
        },
      };
    } catch (error) {
      // Log error and fall back to heuristic
      console.error(
        `[ML] Error calling ML service (${error instanceof Error ? error.message : String(error)}), falling back to heuristic`
      );

      // Fall back to heuristic
      return await ctx.runQuery(api.engines.xMinsHeuristic.predictWithHeuristic, {
        playerId: args.playerId,
        gameweek: args.gameweek,
        recencyWindow: args.recencyWindow || 8,
      });
    }
  },
});

/**
 * Check if ML service is available
 */
export const checkMLHealth = action({
  args: {},
  handler: async (): Promise<{
    available: boolean;
    modelVersion?: string;
    trainedAt?: string;
  }> => {
    try {
      const response = await fetch(`${ML_SERVICE_URL}/health`, {
        method: "GET",
      });

      if (!response.ok) {
        return { available: false };
      }

      const health = await response.json();

      return {
        available: true,
        modelVersion: health.modelVersion,
        trainedAt: health.trainedAt,
      };
    } catch (error) {
      console.error(`[ML] Health check failed:`, error);
      return { available: false };
    }
  },
});

/**
 * Hybrid prediction: Blend ML and heuristic based on gameweek distance
 *
 * GW+1 to GW+4: 100% ML
 * GW+5 to GW+8: 70% ML + 30% heuristic
 * GW+9 to GW+14: 100% heuristic
 */
export const predictHybrid = action({
  args: {
    playerId: v.id("players"),
    gameweek: v.number(),
    currentGameweek: v.number(),
    recencyWindow: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<HeuristicPrediction | null> => {
    const weekDistance = args.gameweek - args.currentGameweek;

    // GW+1 to GW+4: 100% ML
    if (weekDistance >= 1 && weekDistance <= 4) {
      console.log(`[HYBRID] GW+${weekDistance}: Using 100% ML`);
      return await ctx.runAction(api.engines.mlPredictor.predictWithML, {
        playerId: args.playerId,
        gameweek: args.gameweek,
        recencyWindow: args.recencyWindow,
      });
    }

    // GW+5 to GW+8: 70% ML + 30% heuristic
    if (weekDistance >= 5 && weekDistance <= 8) {
      console.log(`[HYBRID] GW+${weekDistance}: Blending 70% ML + 30% heuristic`);

      try {
        // Get both predictions
        const [mlPred, heuristicPred] = await Promise.all([
          ctx.runAction(api.engines.mlPredictor.predictWithML, {
            playerId: args.playerId,
            gameweek: args.gameweek,
            recencyWindow: args.recencyWindow,
          }),
          ctx.runQuery(api.engines.xMinsHeuristic.predictWithHeuristic, {
            playerId: args.playerId,
            gameweek: args.gameweek,
            recencyWindow: args.recencyWindow || 8,
          }),
        ]);

        // If ML failed, use heuristic
        if (!mlPred || mlPred.source !== "model") {
          return heuristicPred;
        }

        // If heuristic failed, use ML
        if (!heuristicPred) {
          return mlPred;
        }

        // Blend: 70% ML + 30% heuristic
        const blendedPrediction: HeuristicPrediction = {
          playerId: args.playerId,
          gameweek: args.gameweek,
          startProb: 0.7 * mlPred.startProb + 0.3 * heuristicPred.startProb,
          xMinsStart: 0.7 * mlPred.xMinsStart + 0.3 * heuristicPred.xMinsStart,
          p90: 0.7 * mlPred.p90 + 0.3 * heuristicPred.p90,
          source: "hybrid", // Mark as blended
          flags: {
            ...mlPred.flags,
            ...heuristicPred.flags,
          },
        };

        return blendedPrediction;
      } catch (error) {
        console.error(`[HYBRID] Blending failed, falling back to heuristic:`, error);
        return await ctx.runQuery(api.engines.xMinsHeuristic.predictWithHeuristic, {
          playerId: args.playerId,
          gameweek: args.gameweek,
          recencyWindow: args.recencyWindow || 8,
        });
      }
    }

    // GW+9 to GW+14: 100% heuristic
    console.log(`[HYBRID] GW+${weekDistance}: Using 100% heuristic`);
    return await ctx.runQuery(api.engines.xMinsHeuristic.predictWithHeuristic, {
      playerId: args.playerId,
      gameweek: args.gameweek,
      recencyWindow: args.recencyWindow || 8,
    });
  },
});
