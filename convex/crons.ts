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
 * DAILY 02:30 UTC - Sync Fixtures with FDR
 *
 * Updates:
 * - Fixture difficulty ratings (1-5)
 * - Kickoff times (for postponements)
 * - Match results (scores)
 * - Fixture status (finished/postponed)
 *
 * Runs 30 minutes after player sync to ensure team data is fresh.
 * Critical for FDR-adjusted predictions.
 */
crons.daily(
  "daily-fixture-sync",
  { hourUTC: 2, minuteUTC: 30 },
  internal.scheduledActions.dailyFixtureSync
);

/**
 * SATURDAY 06:00 UTC - 14-Week Prediction Regeneration
 *
 * Generates xMins predictions for ALL 725 players for the NEXT 14 gameweeks.
 *
 * Why Saturday morning:
 * - Friday's gameweek has finished (all matches played)
 * - FPL data is finalized (data_checked: true)
 * - Injury news from Friday matches is available
 * - 2+ days before next Friday deadline (users have time to plan)
 *
 * Features:
 * - Predicts GW+1 through GW+14 (full planning horizon)
 * - Parses injury return dates from news text
 * - Applies gradual recovery curves (60 mins first game back → 90 by game 4)
 * - Confidence decay (95% for GW+1 → 60% for GW+14)
 *
 * This is the MAIN weekly automation - processes all players.
 * Takes ~20-25 minutes to complete (725 players × 14 weeks = 10,150 predictions).
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

/**
 * TODO: ML MODEL RETRAINING (Future Enhancement)
 *
 * Ideal schedule: SATURDAY 04:00 UTC (before prediction generation at 06:00 UTC)
 *
 * Current approach:
 * - ML models are trained locally and deployed to Render.com
 * - Manual retraining required when performance degrades
 *
 * Future automation options:
 * 1. GitHub Actions workflow (runs training script weekly, deploys updated models)
 * 2. Separate worker service on Render.com (trains models, updates artifacts)
 * 3. Convex action that triggers ML service to retrain (requires persistent storage)
 *
 * To manually retrain:
 * 1. cd ml-service
 * 2. python scripts/ingest_historical_data.py (fetch latest data)
 * 3. python scripts/feature_engineering.py (engineer features)
 * 4. python scripts/train_models.py (train models)
 * 5. git add models/*.pkl && git commit -m "Update trained models" && git push
 * 6. Render.com will auto-redeploy with new models
 *
 * Retraining frequency: Weekly (or when accuracy drops below 80%)
 */

export default crons;
