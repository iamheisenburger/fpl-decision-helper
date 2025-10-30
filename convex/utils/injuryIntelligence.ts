/**
 * Injury Intelligence System
 *
 * Parses injury news text and predicts return timelines.
 * Provides gradual recovery curves for returning players.
 */

import { action } from "../_generated/server";
import { v } from "convex/values";

/**
 * Parse injury news text to extract expected absence duration
 *
 * Patterns recognized:
 * - "out for X weeks" / "out X weeks" / "X weeks out"
 * - "X-Y weeks" / "X to Y weeks"
 * - "out for a month" / "month"
 * - "out for the season" / "season-ending"
 * - "day-to-day" / "minor knock"
 * - "training" / "back in training"
 *
 * @returns Expected number of gameweeks out (null if unknown)
 */
export function parseInjuryDuration(newsText: string): {
  minWeeksOut: number;
  maxWeeksOut: number;
  confidence: "high" | "medium" | "low";
} | null {
  if (!newsText || newsText.length === 0) {
    return null;
  }

  const text = newsText.toLowerCase();

  // Season-ending injuries
  if (
    text.includes("season") ||
    text.includes("rest of the season") ||
    text.includes("out for the year")
  ) {
    return { minWeeksOut: 20, maxWeeksOut: 38, confidence: "high" };
  }

  // Long-term injuries (months)
  const monthMatch = text.match(/(\d+)\s*months?/);
  if (monthMatch) {
    const months = parseInt(monthMatch[1]);
    const weeksOut = months * 4; // Approximate
    return {
      minWeeksOut: weeksOut - 1,
      maxWeeksOut: weeksOut + 1,
      confidence: "medium",
    };
  }

  // "out for a month" / "a month"
  if (text.includes("a month") || text.includes("one month")) {
    return { minWeeksOut: 3, maxWeeksOut: 5, confidence: "medium" };
  }

  // Specific week ranges: "3-4 weeks", "2 to 3 weeks"
  const rangeMatch = text.match(/(\d+)\s*[-to]+\s*(\d+)\s*weeks?/);
  if (rangeMatch) {
    const min = parseInt(rangeMatch[1]);
    const max = parseInt(rangeMatch[2]);
    return { minWeeksOut: min, maxWeeksOut: max, confidence: "high" };
  }

  // Single week duration: "out for 3 weeks", "3 weeks out", "out 3 weeks"
  const weekMatch = text.match(/(?:out\s+(?:for\s+)?)?(\d+)\s*weeks?(?:\s+out)?/);
  if (weekMatch) {
    const weeks = parseInt(weekMatch[1]);
    return {
      minWeeksOut: weeks,
      maxWeeksOut: weeks,
      confidence: "high",
    };
  }

  // "few weeks"
  if (text.includes("few weeks")) {
    return { minWeeksOut: 2, maxWeeksOut: 4, confidence: "low" };
  }

  // "couple of weeks" / "couple weeks"
  if (text.includes("couple") && text.includes("week")) {
    return { minWeeksOut: 2, maxWeeksOut: 3, confidence: "medium" };
  }

  // Short-term issues
  if (
    text.includes("day-to-day") ||
    text.includes("minor knock") ||
    text.includes("slight knock")
  ) {
    return { minWeeksOut: 0, maxWeeksOut: 1, confidence: "low" };
  }

  // Positive signs (in training, close to return)
  if (
    text.includes("training") ||
    text.includes("back in training") ||
    text.includes("close to return") ||
    text.includes("nearing return")
  ) {
    return { minWeeksOut: 0, maxWeeksOut: 1, confidence: "low" };
  }

  // No clear duration found
  return null;
}

/**
 * Calculate expected return gameweek based on injury news
 *
 * @param newsText - Injury news text from FPL API
 * @param newsAddedTimestamp - When the news was added (epoch ms)
 * @param currentGameweek - Current gameweek number
 * @returns Expected return gameweek (null if unknown)
 */
export function calculateReturnGameweek(
  newsText: string,
  newsAddedTimestamp: number,
  currentGameweek: number
): number | null {
  const duration = parseInjuryDuration(newsText);

  if (!duration) {
    return null;
  }

  // Convert timestamp to weeks elapsed
  const now = Date.now();
  const weeksElapsed = Math.floor((now - newsAddedTimestamp) / (7 * 24 * 60 * 60 * 1000));

  // Use midpoint of range for estimate
  const estimatedWeeksOut = Math.round((duration.minWeeksOut + duration.maxWeeksOut) / 2);

  // Subtract elapsed time
  const remainingWeeks = Math.max(0, estimatedWeeksOut - weeksElapsed);

  return currentGameweek + remainingWeeks;
}

/**
 * Gradual Recovery Model
 *
 * Players don't return at 100% - they ramp up over 3-4 games.
 * This function returns a multiplier (0.0-1.0) based on games since return.
 *
 * @param gamesSinceReturn - Number of games since returning from injury (0 = first game back)
 * @returns Multiplier to apply to normal xMins prediction
 */
export function getRecoveryMultiplier(gamesSinceReturn: number): number {
  if (gamesSinceReturn < 0) return 0; // Still injured

  // Recovery curve (research-backed):
  // Game 0 (first back): 60% of normal (~60 mins for a 90-min player)
  // Game 1: 75%
  // Game 2: 85%
  // Game 3: 95%
  // Game 4+: 100%

  const curve = [0.6, 0.75, 0.85, 0.95, 1.0];

  if (gamesSinceReturn >= curve.length) {
    return 1.0;
  }

  return curve[gamesSinceReturn];
}

/**
 * Confidence decay for long-term predictions
 *
 * Predictions become less reliable further into the future.
 * Applies exponential decay.
 *
 * @param weeksAhead - How many weeks into the future (1 = next GW, 14 = GW+14)
 * @returns Confidence multiplier (0.6-0.95)
 */
export function getConfidenceDecay(weeksAhead: number): number {
  if (weeksAhead <= 0) return 0.95;
  if (weeksAhead >= 14) return 0.60;

  // Exponential decay from 95% (GW+1) to 60% (GW+14)
  const startConfidence = 0.95;
  const endConfidence = 0.60;
  const decayRate = Math.log(endConfidence / startConfidence) / 14;

  return startConfidence * Math.exp(decayRate * (weeksAhead - 1));
}

/**
 * Action: Get injury status for a player across 14-week horizon
 */
export const getInjuryOutlook = action({
  args: {
    playerId: v.id("players"),
    newsText: v.optional(v.string()),
    newsAddedTimestamp: v.optional(v.number()),
    currentGameweek: v.number(),
  },
  handler: async (ctx, args): Promise<any> => {
    if (!args.newsText || !args.newsAddedTimestamp) {
      return {
        isInjured: false,
        expectedReturn: null,
        outlook: Array(14).fill({ available: true, recoveryMultiplier: 1.0 }),
      };
    }

    const expectedReturn = calculateReturnGameweek(
      args.newsText,
      args.newsAddedTimestamp,
      args.currentGameweek
    );

    const outlook = [];

    for (let week = 1; week <= 14; week++) {
      const targetGW = args.currentGameweek + week;

      if (expectedReturn === null) {
        // Unknown injury timeline - assume unavailable with low confidence
        outlook.push({
          gameweek: targetGW,
          available: false,
          recoveryMultiplier: 0,
          confidence: "low",
        });
      } else if (targetGW < expectedReturn) {
        // Still injured
        outlook.push({
          gameweek: targetGW,
          available: false,
          recoveryMultiplier: 0,
          confidence: "medium",
        });
      } else {
        // Returned - apply gradual recovery
        const gamesSinceReturn = targetGW - expectedReturn;
        const recoveryMultiplier = getRecoveryMultiplier(gamesSinceReturn);

        outlook.push({
          gameweek: targetGW,
          available: true,
          recoveryMultiplier,
          confidence: gamesSinceReturn <= 3 ? "medium" : "high",
        });
      }
    }

    return {
      isInjured: true,
      expectedReturn,
      outlook,
    };
  },
});
