/**
 * Multi-Week Prediction Engine
 *
 * Generates xMins predictions for 14-week horizon (GW+1 through GW+14).
 * Incorporates:
 * - Injury return timelines
 * - Gradual recovery curves
 * - Confidence decay for long-term predictions
 */

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import {
  calculateReturnGameweek,
  getRecoveryMultiplier,
  getConfidenceDecay,
} from "../utils/injuryIntelligence";
import { calculateFdrAdjustment } from "../fixtures";

interface MultiWeekPrediction {
  gameweek: number;
  startProb: number;
  xMinsStart: number;
  p90: number;
  confidence: number; // 0.6-0.95
  injuryAdjusted: boolean;
  recoveryPhase: boolean; // True if in gradual recovery
  uncertaintyLo: number;
  uncertaintyHi: number;
}

/**
 * Generate 14-week predictions for a single player
 */
export const predictMultiWeek = action({
  args: {
    playerId: v.id("players"),
    currentGameweek: v.number(),
    horizonWeeks: v.optional(v.number()), // Default: 14
  },
  handler: async (ctx, args): Promise<MultiWeekPrediction[]> => {
    const horizonWeeks = args.horizonWeeks || 14;
    const predictions: MultiWeekPrediction[] = [];

    // Get player data
    const player = await ctx.runQuery(api.players.getPlayer, {
      id: args.playerId,
    });

    if (!player) {
      throw new Error(`Player not found: ${args.playerId}`);
    }

    // Calculate injury return timeline
    let expectedReturn: number | null = null;
    if (player.news && player.newsAdded) {
      expectedReturn = calculateReturnGameweek(
        player.news,
        player.newsAdded,
        args.currentGameweek
      );
    }

    // Fetch player's team ID once (avoid repeated API calls in loop)
    let playerTeamId: number | null = null;
    if (player.fplId) {
      try {
        const bootstrapResponse = await fetch(
          "https://fantasy.premierleague.com/api/bootstrap-static/"
        );
        const bootstrapData = await bootstrapResponse.json();
        const fplPlayer = bootstrapData.elements.find((p: any) => p.id === player.fplId);
        if (fplPlayer) {
          playerTeamId = fplPlayer.team;
        }
      } catch (error) {
        console.warn(`[FDR] Failed to fetch team ID for player ${player.name}:`, error);
      }
    }

    // Generate predictions for each week in horizon
    for (let week = 1; week <= horizonWeeks; week++) {
      const targetGW = args.currentGameweek + week;

      // Use hybrid predictor (ML for GW+1-4, blend for GW+5-8, heuristic for GW+9-14)
      const baselinePrediction = await ctx.runAction(
        api.engines.mlPredictor.predictHybrid,
        {
          playerId: args.playerId,
          gameweek: targetGW,
          currentGameweek: args.currentGameweek,
          recencyWindow: 8,
        }
      );

      // If no prediction, skip this week
      if (!baselinePrediction) {
        continue;
      }

      let prediction = { ...baselinePrediction };

      // Apply confidence decay
      const confidence = getConfidenceDecay(week);

      // Check injury status for this gameweek
      let injuryAdjusted = false;
      let recoveryPhase = false;

      if (expectedReturn !== null) {
        if (targetGW < expectedReturn) {
          // Still injured - zero xMins
          prediction.startProb = 0;
          prediction.xMinsStart = 0;
          prediction.p90 = 0;
          injuryAdjusted = true;
        } else {
          // Returned - apply gradual recovery
          const gamesSinceReturn = targetGW - expectedReturn;
          const recoveryMultiplier = getRecoveryMultiplier(gamesSinceReturn);

          if (recoveryMultiplier < 1.0) {
            prediction.startProb *= recoveryMultiplier;
            prediction.xMinsStart *= recoveryMultiplier;
            prediction.p90 *= recoveryMultiplier;
            injuryAdjusted = true;
            recoveryPhase = true;
          }
        }
      }

      // Check current injury status (for short-term)
      if (week === 1 && player.chanceOfPlayingNextRound !== undefined) {
        const chanceMultiplier = player.chanceOfPlayingNextRound / 100;
        prediction.startProb *= chanceMultiplier;
        prediction.xMinsStart *= chanceMultiplier;
        prediction.p90 *= chanceMultiplier;
        injuryAdjusted = true;
      }

      // Apply fixture difficulty adjustment using cached team ID
      if (playerTeamId !== null) {
        try {
          // Get fixture difficulty for this gameweek
          const fixtureDifficulty = await ctx.runQuery(
            api.fixtures.getTeamFixtureDifficulty,
            {
              teamId: playerTeamId,
              gameweek: targetGW,
            }
          );

          if (fixtureDifficulty && !fixtureDifficulty.postponed) {
            const fdrAdjustment = calculateFdrAdjustment(
              fixtureDifficulty.difficulty,
              player.position
            );

            prediction.xMinsStart *= fdrAdjustment;
            prediction.p90 *= fdrAdjustment;
          }
        } catch (error) {
          // Silently skip FDR adjustment if query fails
          console.warn(`[FDR] Failed to get fixture for GW${targetGW}:`, error);
        }
      }

      // Calculate uncertainty bounds (wider for longer horizons)
      const uncertaintyRange = 0.15 * (1 - confidence); // 0-6% range
      const uncertaintyLo = Math.max(0, prediction.xMinsStart * (1 - uncertaintyRange));
      const uncertaintyHi = Math.min(90, prediction.xMinsStart * (1 + uncertaintyRange));

      predictions.push({
        gameweek: targetGW,
        startProb: prediction.startProb,
        xMinsStart: prediction.xMinsStart,
        p90: prediction.p90,
        confidence,
        injuryAdjusted,
        recoveryPhase,
        uncertaintyLo,
        uncertaintyHi,
      });
    }

    return predictions;
  },
});

/**
 * Generate 14-week predictions for ALL players (batch processing)
 */
export const generateAllPlayersMultiWeek = action({
  args: {
    currentGameweek: v.number(),
    horizonWeeks: v.optional(v.number()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<any> => {
    const horizonWeeks = args.horizonWeeks || 14;
    const batchSize = args.batchSize || 10;

    console.log(
      `[MULTI-WEEK] Generating ${horizonWeeks}-week predictions for all players...`
    );

    // Get all players
    const allPlayers = await ctx.runQuery(api.players.getAllPlayers);

    const results = {
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
      totalPredictions: 0,
      errors: [] as { playerName: string; error: string }[],
    };

    // Process in batches
    for (let i = 0; i < allPlayers.length; i += batchSize) {
      const batch = allPlayers.slice(i, i + batchSize);

      console.log(
        `[MULTI-WEEK] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(allPlayers.length / batchSize)} (players ${i + 1}-${Math.min(i + batchSize, allPlayers.length)})`
      );

      await Promise.all(
        batch.map(async (player: any) => {
          try {
            // Skip players without FPL ID
            if (!player.fplId) {
              results.skippedCount++;
              return;
            }

            // Generate multi-week predictions
            const predictions = await ctx.runAction(
              api.engines.multiWeekPredictor.predictMultiWeek,
              {
                playerId: player._id,
                currentGameweek: args.currentGameweek,
                horizonWeeks,
              }
            );

            if (predictions.length === 0) {
              results.failedCount++;
              return;
            }

            // Store each week's prediction
            for (const pred of predictions) {
              // Determine source based on week distance
              const weekDistance = pred.gameweek - args.currentGameweek;
              let source: "model" | "override" | "heuristic" | "hybrid" = "heuristic";
              if (weekDistance >= 1 && weekDistance <= 4) {
                source = "model"; // ML
              } else if (weekDistance >= 5 && weekDistance <= 8) {
                source = "hybrid"; // Blend
              }

              await ctx.runMutation(api.xmins.upsertXMins, {
                playerId: player._id,
                gameweek: pred.gameweek,
                startProb: pred.startProb,
                xMinsStart: pred.xMinsStart,
                p90: pred.p90,
                source,
                uncertaintyLo: pred.uncertaintyLo,
                uncertaintyHi: pred.uncertaintyHi,
                flags: {
                  injExcluded: pred.injuryAdjusted && pred.xMinsStart === 0,
                  recentWeightApplied: true,
                },
              });
              results.totalPredictions++;
            }

            results.successCount++;
          } catch (error) {
            results.failedCount++;
            results.errors.push({
              playerName: player.name,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        })
      );

      // Rate limiting: 2 seconds between batches
      if (i + batchSize < allPlayers.length) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    console.log(
      `[MULTI-WEEK] Complete! Success: ${results.successCount}, Failed: ${results.failedCount}, Total predictions: ${results.totalPredictions}`
    );

    return {
      success: true,
      message: `Generated ${horizonWeeks}-week predictions for ${results.successCount} players`,
      generated: results.successCount,
      skipped: results.skippedCount,
      failed: results.failedCount,
      totalPredictions: results.totalPredictions,
      errors: results.errors.slice(0, 10), // Return first 10 errors
    };
  },
});

/**
 * Get player's 14-week outlook (for UI display)
 */
export const getPlayerOutlook = action({
  args: {
    playerId: v.id("players"),
    currentGameweek: v.number(),
  },
  handler: async (ctx, args): Promise<any> => {
    const predictions = await ctx.runAction(
      api.engines.multiWeekPredictor.predictMultiWeek,
      {
        playerId: args.playerId,
        currentGameweek: args.currentGameweek,
        horizonWeeks: 14,
      }
    );

    const player = await ctx.runQuery(api.players.getPlayer, {
      id: args.playerId,
    });

    return {
      player: {
        name: player?.name,
        position: player?.position,
        team: player?.team,
        status: player?.status,
        news: player?.news,
      },
      predictions,
      summary: {
        avgXMins: predictions.reduce((sum: number, p: any) => sum + p.xMinsStart, 0) / predictions.length,
        avgConfidence: predictions.reduce((sum: number, p: any) => sum + p.confidence, 0) / predictions.length,
        weeksUnavailable: predictions.filter((p: any) => p.xMinsStart === 0).length,
        weeksInRecovery: predictions.filter((p: any) => p.recoveryPhase).length,
      },
    };
  },
});
