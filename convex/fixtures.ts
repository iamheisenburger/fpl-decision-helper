/**
 * Fixtures Module
 *
 * Handles fetching and storing Premier League fixtures from FPL API.
 * Includes fixture difficulty ratings (FDR) used for prediction adjustments.
 */

import { action, query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

/**
 * Sync fixtures from FPL API
 *
 * Fetches all fixtures and stores them with difficulty ratings.
 * Should be called daily to capture postponements and kickoff changes.
 */
export const syncFixtures = action({
  args: {},
  handler: async (ctx): Promise<any> => {
    try {
      console.log("[FIXTURES] Starting fixture sync from FPL API...");

      // Fetch fixtures from FPL API
      const fixturesResponse = await fetch(
        "https://fantasy.premierleague.com/api/fixtures/"
      );

      if (!fixturesResponse.ok) {
        return {
          success: false,
          error: `FPL API returned ${fixturesResponse.status}`,
        };
      }

      const fixtures = await fixturesResponse.json();

      // Fetch teams for name lookup
      const bootstrapResponse = await fetch(
        "https://fantasy.premierleague.com/api/bootstrap-static/"
      );
      const bootstrapData = await bootstrapResponse.json();
      const teams = bootstrapData.teams;

      // Create team ID -> name mapping
      const teamMap = new Map();
      teams.forEach((team: any) => {
        teamMap.set(team.id, team.name);
      });

      console.log(`[FIXTURES] Fetched ${fixtures.length} fixtures from FPL API`);

      let syncedCount = 0;
      let updatedCount = 0;

      // Process each fixture
      for (const fixture of fixtures) {
        // Skip fixtures without gameweek (not scheduled yet)
        if (!fixture.event) {
          continue;
        }

        const fixtureData = {
          fplId: fixture.id,
          gameweek: fixture.event,
          kickoffTime: new Date(fixture.kickoff_time).getTime(),
          homeTeam: teamMap.get(fixture.team_h) || "Unknown",
          awayTeam: teamMap.get(fixture.team_a) || "Unknown",
          homeTeamId: fixture.team_h,
          awayTeamId: fixture.team_a,
          homeTeamDifficulty: fixture.team_h_difficulty,
          awayTeamDifficulty: fixture.team_a_difficulty,
          finished: fixture.finished,
          postponed: fixture.finished_provisional,
          homeScore: fixture.team_h_score,
          awayScore: fixture.team_a_score,
        };

        // Check if fixture already exists
        const existing = await ctx.runQuery(api.fixtures.getFixtureByFplId, {
          fplId: fixture.id,
        });

        if (existing) {
          // Update existing fixture
          await ctx.runMutation(api.fixtures.updateFixture, {
            id: existing._id,
            ...fixtureData,
          });
          updatedCount++;
        } else {
          // Insert new fixture
          await ctx.runMutation(api.fixtures.insertFixture, fixtureData);
          syncedCount++;
        }
      }

      console.log(
        `[FIXTURES] ✅ Sync complete: ${syncedCount} new, ${updatedCount} updated`
      );

      return {
        success: true,
        synced: syncedCount,
        updated: updatedCount,
        total: syncedCount + updatedCount,
      };
    } catch (error) {
      console.error("[FIXTURES] ❌ Sync failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

/**
 * Get fixture by FPL ID
 */
export const getFixtureByFplId = query({
  args: { fplId: v.number() },
  handler: async (ctx, args) => {
    const fixture = await ctx.db
      .query("fixtures")
      .withIndex("by_fplId", (q) => q.eq("fplId", args.fplId))
      .first();

    return fixture;
  },
});

/**
 * Get all fixtures for a gameweek
 */
export const getGameweekFixtures = query({
  args: { gameweek: v.number() },
  handler: async (ctx, args) => {
    const fixtures = await ctx.db
      .query("fixtures")
      .withIndex("by_gameweek", (q) => q.eq("gameweek", args.gameweek))
      .collect();

    return fixtures.sort((a, b) => a.kickoffTime - b.kickoffTime);
  },
});

/**
 * Get fixture difficulty for a team in a specific gameweek
 *
 * Returns the difficulty rating (1-5) and opponent.
 */
export const getTeamFixtureDifficulty = query({
  args: {
    teamId: v.number(),
    gameweek: v.number(),
  },
  handler: async (ctx, args) => {
    // Find fixture where team is home or away
    const fixtures = await ctx.db
      .query("fixtures")
      .withIndex("by_gameweek", (q) => q.eq("gameweek", args.gameweek))
      .collect();

    const fixture = fixtures.find(
      (f) => f.homeTeamId === args.teamId || f.awayTeamId === args.teamId
    );

    if (!fixture) {
      return null;
    }

    const isHome = fixture.homeTeamId === args.teamId;

    return {
      difficulty: isHome ? fixture.homeTeamDifficulty : fixture.awayTeamDifficulty,
      opponent: isHome ? fixture.awayTeam : fixture.homeTeam,
      opponentId: isHome ? fixture.awayTeamId : fixture.homeTeamId,
      isHome,
      kickoffTime: fixture.kickoffTime,
      postponed: fixture.postponed,
    };
  },
});

/**
 * Get fixtures for a team across multiple gameweeks
 */
export const getTeamFixtureRun = query({
  args: {
    teamId: v.number(),
    startGameweek: v.number(),
    endGameweek: v.number(),
  },
  handler: async (ctx, args) => {
    const result = [];

    for (let gw = args.startGameweek; gw <= args.endGameweek; gw++) {
      const fixtureDifficulty = await ctx.runQuery(
        api.fixtures.getTeamFixtureDifficulty,
        {
          teamId: args.teamId,
          gameweek: gw,
        }
      );

      result.push({
        gameweek: gw,
        ...fixtureDifficulty,
      });
    }

    return result;
  },
});

/**
 * Insert new fixture (mutation)
 */
export const insertFixture = mutation({
  args: {
    fplId: v.number(),
    gameweek: v.number(),
    kickoffTime: v.number(),
    homeTeam: v.string(),
    awayTeam: v.string(),
    homeTeamId: v.number(),
    awayTeamId: v.number(),
    homeTeamDifficulty: v.number(),
    awayTeamDifficulty: v.number(),
    finished: v.boolean(),
    postponed: v.boolean(),
    homeScore: v.optional(v.number()),
    awayScore: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("fixtures", { ...args });
  },
});

/**
 * Update existing fixture (mutation)
 */
export const updateFixture = mutation({
  args: {
    id: v.id("fixtures"),
    fplId: v.number(),
    gameweek: v.number(),
    kickoffTime: v.number(),
    homeTeam: v.string(),
    awayTeam: v.string(),
    homeTeamId: v.number(),
    awayTeamId: v.number(),
    homeTeamDifficulty: v.number(),
    awayTeamDifficulty: v.number(),
    finished: v.boolean(),
    postponed: v.boolean(),
    homeScore: v.optional(v.number()),
    awayScore: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...data } = args;
    return await ctx.db.patch(id, data);
  },
});

/**
 * Calculate FDR adjustment factor
 *
 * Converts FDR (1-5) to xMins multiplier:
 * - FDR 1 (easiest): +10% xMins
 * - FDR 2: +5%
 * - FDR 3 (medium): 0%
 * - FDR 4: -5%
 * - FDR 5 (hardest): -10%
 *
 * Attackers are MORE affected, defenders/goalkeepers LESS affected.
 */
export function calculateFdrAdjustment(
  difficulty: number,
  position: "GK" | "DEF" | "MID" | "FWD"
): number {
  // Base adjustment by difficulty
  const baseAdjustment: Record<number, number> = {
    1: 0.10, // +10%
    2: 0.05, // +5%
    3: 0.00, // 0%
    4: -0.05, // -5%
    5: -0.10, // -10%
  };

  // Position-specific multipliers
  const positionMultiplier: Record<string, number> = {
    GK: 0.5, // Goalkeepers least affected by opponent
    DEF: 0.7, // Defenders moderately affected
    MID: 1.0, // Midfielders fully affected
    FWD: 1.2, // Forwards most affected
  };

  const base = baseAdjustment[difficulty] || 0;
  const multiplier = positionMultiplier[position] || 1.0;

  return 1.0 + base * multiplier;
}
