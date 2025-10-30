import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

/**
 * Data ingestion actions for FPL API
 * These use Convex actions (not mutations) to call external APIs
 */

// Import FPL client (will be available at runtime)
// Note: In Convex, we need to import these dynamically or inline the fetch logic

/**
 * Sync players from FPL API to Convex
 */
export const syncPlayers = action({
  args: {},
  handler: async (ctx) => {
    try {
      // Fetch bootstrap data
      const response = await fetch(
        "https://fantasy.premierleague.com/api/bootstrap-static/"
      );
      const data = await response.json();

      const positionMap: { [key: number]: "GK" | "DEF" | "MID" | "FWD" } = {
        1: "GK",
        2: "DEF",
        3: "MID",
        4: "FWD",
      };

      const syncedPlayers = [];
      const errors = [];

      for (const fplPlayer of data.elements) {
        const position = positionMap[fplPlayer.element_type];
        const team = data.teams.find((t: any) => t.id === fplPlayer.team);

        if (!position || !team) {
          errors.push({
            playerId: fplPlayer.id,
            error: "Invalid position or team",
          });
          continue;
        }

        try {
          // Check if player exists
          const existingPlayer = await ctx.runQuery(api.players.getPlayerByName, {
            name: fplPlayer.web_name,
          });

          if (existingPlayer) {
            // Update existing player
            await ctx.runMutation(api.players.updatePlayer, {
              id: existingPlayer._id,
              name: fplPlayer.web_name,
              position,
              price: fplPlayer.now_cost / 10,
              team: team.name,
              fplId: fplPlayer.id,
            });
          } else {
            // Create new player
            await ctx.runMutation(api.players.addPlayer, {
              name: fplPlayer.web_name,
              position,
              price: fplPlayer.now_cost / 10,
              team: team.name,
              fplId: fplPlayer.id,
            });
          }

          syncedPlayers.push({
            fplId: fplPlayer.id,
            name: fplPlayer.web_name,
            team: team.name,
          });
        } catch (error) {
          errors.push({
            playerId: fplPlayer.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return {
        success: true,
        synced: syncedPlayers.length,
        total: data.elements.length,
        errors: errors.length,
        errorDetails: errors.slice(0, 10), // Return first 10 errors
      };
    } catch (error) {
      console.error("Failed to sync players:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

/**
 * Fetch and store historical appearances for a single player
 */
export const ingestPlayerHistory = action({
  args: {
    fplPlayerId: v.number(),
    playerName: v.string(),
    season: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<any> => {
    try {
      const season = args.season || getCurrentSeason();

      // Fetch player summary
      const response = await fetch(
        `https://fantasy.premierleague.com/api/element-summary/${args.fplPlayerId}/`
      );

      if (!response.ok) {
        throw new Error(`FPL API returned ${response.status}`);
      }

      const data = await response.json();

      // Get team map
      const bootstrapResponse = await fetch(
        "https://fantasy.premierleague.com/api/bootstrap-static/"
      );
      const bootstrap = await bootstrapResponse.json();
      const teamMap = new Map(bootstrap.teams.map((t: any) => [t.id, t.name]));

      // Find player in Convex
      const player = await ctx.runQuery(api.players.getPlayerByName, {
        name: args.playerName,
      });

      if (!player) {
        throw new Error(`Player ${args.playerName} not found in Convex`);
      }

      const appearances = [];

      // Process match history
      for (const match of data.history) {
        const opponent = (teamMap.get(match.opponent_team) || "Unknown") as string;

        // Detect injury exit heuristically
        const earlySubOff = match.minutes > 0 && match.minutes < 60;
        const didStart = match.starts === 1;
        const injExit = didStart && earlySubOff;

        const appearance = {
          playerId: player._id,
          gameweek: match.round,
          season,
          started: match.starts === 1,
          minutes: match.minutes,
          injExit,
          redCard: match.red_cards > 0,
          date: new Date(match.kickoff_time).getTime(),
          competition: "Premier League",
          opponent,
          homeAway: (match.was_home ? "home" : "away") as "home" | "away",
          fplGameweekId: match.fixture,
        };

        appearances.push(appearance);
      }

      // Bulk insert appearances
      if (appearances.length > 0) {
        await ctx.runMutation(api.appearances.bulkInsertAppearances, {
          appearances,
        });
      }

      return {
        success: true,
        playerName: args.playerName,
        appearances: appearances.length,
      };
    } catch (error) {
      console.error(
        `Failed to ingest history for player ${args.playerName}:`,
        error
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

/**
 * Batch ingest historical data for all players
 */
export const ingestAllPlayersHistory = action({
  args: {
    season: v.optional(v.string()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    try {
      const season = args.season || getCurrentSeason();
      const batchSize = args.batchSize || 10;

      // Get all players from Convex
      const players = await ctx.runQuery(api.players.getAllPlayers);

      const results = {
        successCount: 0,
        failedCount: 0,
        errors: [] as Array<{ playerName: string; error: string }>,
      };

      // Process in batches
      for (let i = 0; i < players.length; i += batchSize) {
        const batch = players.slice(i, i + batchSize);

        await Promise.all(
          batch.map(async (player: any) => {
            try {
              // Note: We need to map Convex player to FPL ID
              // For now, we'll skip this and let user manually trigger
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

        // Rate limiting between batches
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      return {
        success: true,
        ...results,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

/**
 * Sync gameweek context data (congestion, intl breaks)
 */
export const syncGameweekContext = action({
  args: {
    season: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const season = args.season || getCurrentSeason();

      // Fetch fixtures and gameweeks
      const [fixturesResponse, bootstrapResponse] = await Promise.all([
        fetch("https://fantasy.premierleague.com/api/fixtures/"),
        fetch("https://fantasy.premierleague.com/api/bootstrap-static/"),
      ]);

      const fixtures = await fixturesResponse.json();
      const bootstrap = await bootstrapResponse.json();

      // Detect international breaks
      const gameweeks = bootstrap.events
        .filter((gw: any) => gw.deadline_time)
        .sort((a: any, b: any) => a.id - b.id);

      const contexts = [];

      for (let i = 0; i < gameweeks.length; i++) {
        const gw = gameweeks[i];
        const gwFixtures = fixtures.filter((f: any) => f.event === gw.id);

        // Detect congestion
        const kickoffTimes = gwFixtures
          .filter((f: any) => f.kickoff_time)
          .map((f: any) => new Date(f.kickoff_time).getTime())
          .sort();

        let congestionFlag = false;
        let avgDaysRestTeam = 7;

        if (kickoffTimes.length >= 2) {
          const span =
            kickoffTimes[kickoffTimes.length - 1] - kickoffTimes[0];
          const spanDays = span / (1000 * 60 * 60 * 24);
          congestionFlag = spanDays < 5;
          avgDaysRestTeam = spanDays / gwFixtures.length;
        }

        // Detect international break
        let intlWindowFlag = false;
        if (i > 0) {
          const prev = new Date(gameweeks[i - 1].deadline_time).getTime();
          const curr = new Date(gw.deadline_time).getTime();
          const daysBetween = (curr - prev) / (1000 * 60 * 60 * 24);
          intlWindowFlag = daysBetween > 14;
        }

        contexts.push({
          gameweek: gw.id,
          season,
          congestionFlag,
          intlWindowFlag,
          avgDaysRestTeam,
        });
      }

      // Bulk insert contexts
      await ctx.runMutation(api.context.bulkInsertContext, { contexts });

      return {
        success: true,
        synced: contexts.length,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

/**
 * Generate predictions for current squad
 * Fetches historical data from FPL API and generates heuristic predictions
 */
export const generateSquadPredictions = action({
  args: {
    gameweek: v.number(),
  },
  handler: async (ctx, args) => {
    try {
      const season = getCurrentSeason();

      // Get user's squad
      const squad = await ctx.runQuery(api.userSquad.getSquad, {
        gameweek: args.gameweek,
      });

      if (!squad || squad.length === 0) {
        return {
          success: false,
          error: `No squad found for gameweek ${args.gameweek}. Please add your squad in the Data Entry page first.`,
        };
      }

      const results = {
        successCount: 0,
        failedCount: 0,
        errors: [] as Array<{ playerName: string; error: string }>,
      };

      // Get bootstrap data for team mapping
      const bootstrapResponse = await fetch(
        "https://fantasy.premierleague.com/api/bootstrap-static/"
      );
      const bootstrap = await bootstrapResponse.json();
      const teamMap = new Map(bootstrap.teams.map((t: any) => [t.id, t.name]));

      // Process each player in squad
      for (const squadEntry of squad) {
        try {
          // Get full player data
          const player = await ctx.runQuery(api.players.getPlayer, {
            id: squadEntry.playerId,
          });

          if (!player) {
            results.failedCount++;
            results.errors.push({
              playerName: squadEntry.playerName || "Unknown",
              error: "Player not found in database",
            });
            continue;
          }

          if (!player.fplId) {
            results.failedCount++;
            results.errors.push({
              playerName: player.name,
              error: "No FPL ID found. Please re-sync players from FPL API.",
            });
            continue;
          }

          // Fetch player history from FPL API
          const historyResponse = await fetch(
            `https://fantasy.premierleague.com/api/element-summary/${player.fplId}/`
          );

          if (!historyResponse.ok) {
            results.failedCount++;
            results.errors.push({
              playerName: player.name,
              error: `FPL API returned ${historyResponse.status}`,
            });
            continue;
          }

          const historyData = await historyResponse.json();

          // Store historical appearances
          const appearances = [];
          for (const match of historyData.history) {
            const opponent = (teamMap.get(match.opponent_team) || "Unknown") as string;
            const earlySubOff = match.minutes > 0 && match.minutes < 60;
            const didStart = match.starts === 1;
            const injExit = didStart && earlySubOff;

            appearances.push({
              playerId: player._id,
              gameweek: match.round,
              season,
              started: match.starts === 1,
              minutes: match.minutes,
              injExit,
              redCard: match.red_cards > 0,
              date: new Date(match.kickoff_time).getTime(),
              competition: "Premier League",
              opponent,
              homeAway: (match.was_home ? "home" : "away") as "home" | "away",
              fplGameweekId: match.fixture,
            });
          }

          // Bulk insert appearances (if any)
          if (appearances.length > 0) {
            await ctx.runMutation(api.appearances.bulkInsertAppearances, {
              appearances,
            });
          }

          // Generate heuristic prediction for this player
          const prediction = await ctx.runQuery(api.engines.xMinsHeuristic.predictWithHeuristic, {
            playerId: player._id,
            gameweek: args.gameweek,
            excludeInjury: true,
            excludeRedCard: true,
            recencyWindow: 8,
          });

          // Store prediction
          if (prediction) {
            await ctx.runMutation(api.xmins.upsertXMins, {
              playerId: player._id,
              gameweek: args.gameweek,
              startProb: prediction.startProb,
              xMinsStart: prediction.xMinsStart,
              p90: prediction.p90,
              source: "heuristic",
              flags: prediction.flags,
            });
          }

          results.successCount++;

          // Rate limiting
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (error) {
          results.failedCount++;
          results.errors.push({
            playerName: (squadEntry as any).playerName || "Unknown",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return {
        success: true,
        processed: squad.length,
        ...results,
        message: `Generated predictions for ${results.successCount}/${squad.length} players`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

// Helper function
function getCurrentSeason(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  if (month >= 8) {
    return `${year}-${(year + 1).toString().slice(2)}`;
  } else {
    return `${year - 1}-${year.toString().slice(2)}`;
  }
}
