import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Convex Cron Jobs for FPL xMins Automation
 *
 * These jobs run automatically to keep data fresh without manual intervention.
 *
 * TIMING STRATEGY:
 * - FPL deadlines are typically Friday 18:30 GMT (but can vary)
 * - Player prices change overnight around 01:30 GMT
 * - We sync AFTER price changes but BEFORE most users wake up
 * - We regenerate predictions AFTER the gameweek finishes (Saturday morning)
 * - We avoid syncing close to deadline (risk of API rate limits when traffic is high)
 */

const crons = cronJobs();

/**
 * DAILY 02:00 UTC - Sync Player Data
 *
 * Updates:
 * - Player prices (changes happen ~01:30 UTC)
 * - Injury status (from FPL API)
 * - Injury news (text descriptions)
 * - Chance of playing percentages
 * - Team changes (transfers in/out)
 *
 * Runs at 2 AM UTC to capture overnight price changes.
 * Safe time - no deadline conflicts, low API traffic.
 */
crons.daily(
  "daily-player-sync",
  { hourUTC: 2, minuteUTC: 0 },
  internal.scheduledActions.dailyPlayerSync
);

/**
 * DAILY 02:15 UTC - Sync Gameweek Context
 *
 * Updates:
 * - Fixture congestion flags
 * - International break detection
 * - Average days rest per team
 *
 * Runs 15 minutes after player sync to use fresh data.
 */
crons.daily(
  "daily-context-sync",
  { hourUTC: 2, minuteUTC: 15 },
  internal.scheduledActions.dailyContextSync
);

/**
 * SATURDAY 06:00 UTC - Weekly Prediction Regeneration
 *
 * Generates xMins predictions for ALL 725 players for the NEXT gameweek.
 *
 * Why Saturday morning:
 * - Friday's gameweek has finished (all matches played)
 * - FPL data is finalized (data_checked: true)
 * - Injury news from Friday matches is available
 * - 2+ days before next Friday deadline (users have time to plan)
 *
 * This is the MAIN weekly automation - processes all players.
 * Takes ~6 minutes to complete.
 */
crons.weekly(
  "weekly-prediction-generation",
  { dayOfWeek: "saturday", hourUTC: 6, minuteUTC: 0 },
  internal.scheduledActions.generatePredictionsForNextGameweek
);

/**
 * FRIDAY 12:00 UTC - Pre-Deadline Refresh
 *
 * Final update 6.5 hours before typical deadline (18:30 GMT).
 *
 * Captures:
 * - Late injury news from Thursday/Friday press conferences
 * - Last-minute team news
 * - Final price changes
 *
 * Gives users fresh data for deadline decisions.
 * Does NOT regenerate all predictions (too slow), just syncs data.
 */
crons.weekly(
  "pre-deadline-refresh",
  { dayOfWeek: "friday", hourUTC: 12, minuteUTC: 0 },
  internal.scheduledActions.preDeadlineRefresh
);

export default crons;
