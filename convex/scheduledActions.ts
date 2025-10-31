import { internalAction } from "./_generated/server";
import { internal, api } from "./_generated/api";

/**
 * Scheduled Actions for Cron Jobs
 *
 * These are internal actions called by cron jobs.
 * They wrap existing actions with gameweek auto-detection.
 */

/**
 * Daily player sync (called by 2:00 AM cron)
 */
export const dailyPlayerSync = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    try {
      console.log("[CRON] Starting daily player sync...");

      const result = await ctx.runAction(api.dataIngestion.syncPlayers, {});

      if (result.success) {
        console.log(`[CRON] ✅ Player sync complete: ${result.synced}/${result.total} players`);

        // Log success
        await ctx.runMutation(api.syncLogs.logSync, {
          syncType: "players",
          status: "success",
          details: JSON.stringify({
            synced: result.synced,
            total: result.total,
            errors: result.errors,
          }),
        });
      } else {
        console.error("[CRON] ❌ Player sync failed:", result.error);

        // Log failure
        await ctx.runMutation(api.syncLogs.logSync, {
          syncType: "players",
          status: "failed",
          errorMessage: result.error,
        });
      }
    } catch (error) {
      console.error("[CRON] ❌ Fatal error in player sync:", error);

      // Log fatal error
      await ctx.runMutation(api.syncLogs.logSync, {
        syncType: "players",
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  },
});

/**
 * Daily context sync (called by 2:15 AM cron)
 */
export const dailyContextSync = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    try {
      console.log("[CRON] Starting daily context sync...");

      const result = await ctx.runAction(api.dataIngestion.syncGameweekContext, {});

      if (result.success) {
        console.log(`[CRON] ✅ Context sync complete: ${result.synced} gameweeks`);

        // Log success
        await ctx.runMutation(api.syncLogs.logSync, {
          syncType: "context",
          status: "success",
          details: JSON.stringify({
            synced: result.synced,
          }),
        });
      } else {
        console.error("[CRON] ❌ Context sync failed:", result.error);

        // Log failure
        await ctx.runMutation(api.syncLogs.logSync, {
          syncType: "context",
          status: "failed",
          errorMessage: result.error,
        });
      }
    } catch (error) {
      console.error("[CRON] ❌ Fatal error in context sync:", error);

      // Log fatal error
      await ctx.runMutation(api.syncLogs.logSync, {
        syncType: "context",
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  },
});

/**
 * Daily fixture sync (called by 2:30 AM cron)
 */
export const dailyFixtureSync = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    try {
      console.log("[CRON] Starting daily fixture sync...");

      const result = await ctx.runAction(api.fixtures.syncFixtures, {});

      if (result.success) {
        console.log(
          `[CRON] ✅ Fixture sync complete: ${result.synced} new, ${result.updated} updated`
        );

        // Log success
        await ctx.runMutation(api.syncLogs.logSync, {
          syncType: "fixtures",
          status: "success",
          details: JSON.stringify({
            synced: result.synced,
            updated: result.updated,
            total: result.total,
          }),
        });
      } else {
        console.error("[CRON] ❌ Fixture sync failed:", result.error);

        // Log failure
        await ctx.runMutation(api.syncLogs.logSync, {
          syncType: "fixtures",
          status: "failed",
          errorMessage: result.error,
        });
      }
    } catch (error) {
      console.error("[CRON] ❌ Fatal error in fixture sync:", error);

      // Log fatal error
      await ctx.runMutation(api.syncLogs.logSync, {
        syncType: "fixtures",
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  },
});

/**
 * Generate 14-week predictions for ALL players (called by Saturday cron)
 *
 * Automatically detects current gameweek and generates predictions for GW+1 through GW+14.
 * Includes injury return timelines, gradual recovery curves, and confidence decay.
 */
export const generatePredictionsForNextGameweek = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    try {
      // Get current gameweek
      const currentGW = await ctx.runAction(api.utils.gameweekDetection.getCurrentGameweek, {});

      console.log(`[CRON] Starting 14-week prediction generation from GW${currentGW + 1} to GW${currentGW + 14}...`);

      // Generate 14-week predictions for all players
      const result = await ctx.runAction(api.engines.multiWeekPredictor.generateAllPlayersMultiWeek, {
        currentGameweek: currentGW,
        horizonWeeks: 14,
        batchSize: 10,
      });

      if (result.success) {
        console.log(
          `[CRON] ✅ 14-week prediction generation complete:`,
          `Generated: ${result.generated} players × 14 weeks = ${result.totalPredictions} predictions`,
          `Skipped: ${result.skipped}, Failed: ${result.failed}`
        );

        // Log success
        await ctx.runMutation(api.syncLogs.logSync, {
          syncType: "predictions",
          status: "success",
          details: JSON.stringify({
            currentGameweek: currentGW,
            horizonWeeks: 14,
            generated: result.generated,
            totalPredictions: result.totalPredictions,
            skipped: result.skipped,
            failed: result.failed,
          }),
        });
      } else {
        console.error(`[CRON] ❌ 14-week prediction generation failed:`, result.error);

        // Log failure
        await ctx.runMutation(api.syncLogs.logSync, {
          syncType: "predictions",
          status: "failed",
          errorMessage: result.error,
        });
      }
    } catch (error) {
      console.error("[CRON] ❌ Fatal error in 14-week prediction generation:", error);

      // Log fatal error
      await ctx.runMutation(api.syncLogs.logSync, {
        syncType: "predictions",
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  },
});

/**
 * Pre-deadline refresh (called by Friday 12:00 cron)
 *
 * Quick sync of player data and context before deadline.
 * Does NOT regenerate predictions (too slow), just refreshes injury/price data.
 */
export const preDeadlineRefresh = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    try {
      console.log("[CRON] Starting pre-deadline refresh...");

      // Sync players (injuries, prices, news)
      const playerResult = await ctx.runAction(api.dataIngestion.syncPlayers, {});

      if (playerResult.success) {
        console.log(
          `[CRON] ✅ Player sync complete: ${playerResult.synced}/${playerResult.total} players`
        );
      } else {
        console.error("[CRON] ❌ Player sync failed:", playerResult.error);
      }

      // Sync gameweek context
      const contextResult = await ctx.runAction(api.dataIngestion.syncGameweekContext, {});

      if (contextResult.success) {
        console.log(`[CRON] ✅ Context sync complete: ${contextResult.synced} gameweeks`);
      } else {
        console.error("[CRON] ❌ Context sync failed:", contextResult.error);
      }

      console.log("[CRON] Pre-deadline refresh complete");

      // Log the refresh
      await ctx.runMutation(api.syncLogs.logSync, {
        syncType: "pre-deadline",
        status: playerResult.success && contextResult.success ? "success" : "failed",
        details: JSON.stringify({
          playersSynced: playerResult.synced,
          contextSynced: contextResult.synced,
        }),
        errorMessage: !playerResult.success ? playerResult.error : !contextResult.success ? contextResult.error : undefined,
      });
    } catch (error) {
      console.error("[CRON] ❌ Fatal error in pre-deadline refresh:", error);

      // Log fatal error
      await ctx.runMutation(api.syncLogs.logSync, {
        syncType: "pre-deadline",
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  },
});
