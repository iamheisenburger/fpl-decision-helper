import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Players table - stores basic player information
  players: defineTable({
    name: v.string(),
    position: v.union(
      v.literal("GK"),
      v.literal("DEF"),
      v.literal("MID"),
      v.literal("FWD")
    ),
    price: v.number(), // in millions (e.g., 12.5)
    team: v.string(),
    fplId: v.optional(v.number()), // FPL API player ID for fetching historical data

    // Injury and availability tracking (from FPL API)
    status: v.optional(v.string()), // "a" = available, "d" = doubtful, "i" = injured, "s" = suspended, "u" = unavailable, "n" = not in squad
    news: v.optional(v.string()), // Injury/news description text from FPL API
    newsAdded: v.optional(v.number()), // Timestamp when news was added (epoch milliseconds)
    chanceOfPlayingNextRound: v.optional(v.number()), // 0, 25, 50, 75, 100, or null

    // Price change tracking
    lastPriceUpdate: v.optional(v.number()), // Timestamp of last price sync (epoch milliseconds)
  })
    .index("by_name", ["name"])
    .index("by_fplId", ["fplId"]),

  // Gameweek inputs - stores EV, EV95, xMins, EO for each player per gameweek
  gameweekInputs: defineTable({
    playerId: v.id("players"),
    gameweek: v.number(),
    ev: v.number(),
    ev95: v.number(),
    xMins: v.number(),
    eo: v.number(), // Expected Ownership as percentage (e.g., 68.5 for 68.5%)
  })
    .index("by_gameweek", ["gameweek"])
    .index("by_player_gameweek", ["playerId", "gameweek"]),

  // User squad - tracks the current 15 players in the squad
  userSquad: defineTable({
    playerId: v.id("players"),
    gameweek: v.number(),
    isCaptain: v.boolean(),
    isVice: v.boolean(),
    benchOrder: v.optional(v.number()), // 0 = starter, 1-4 = bench position
  })
    .index("by_gameweek", ["gameweek"])
    .index("by_player_gameweek", ["playerId", "gameweek"]),

  // User settings - stores risk profile and preferences
  userSettings: defineTable({
    // Captaincy settings
    captaincyEoRate: v.number(), // default: 0.1 EV per 10% EO
    captaincyEoCap: v.number(), // default: 1.0 EV

    // XI settings
    xiEoRate: v.number(), // default: 0.1 EV per 15% EO
    xiEoCap: v.number(), // default: 1.0 EV

    // xMins penalty settings
    xMinsThreshold: v.number(), // default: 70 minutes
    xMinsPenalty: v.number(), // default: 0.3 EV

    // Bleed budget
    weeklyBleedBudget: v.number(), // default: 0.8 EV

    // Transfer settings
    defaultHoldLength: v.number(), // default: 8 weeks
    transferGainThreshold: v.number(), // default: 0.5 EV

    // xMins model parameters
    xMinsRecencyWindow: v.optional(v.number()), // default: 8 GWs
    xMinsMinHealthyStarts: v.optional(v.number()), // default: 5 appearances
    xMinsRecencyWeights: v.optional(v.array(v.number())), // e.g., [0.6, 0.3, 0.1] for last 3
    xMinsRoleLockThreshold: v.optional(v.number()), // default: 3 consecutive 85+ starts
    xMinsUseModel: v.optional(v.boolean()), // default: true (use predictions vs manual)
  }),

  // Templates - baseline EO and EV95×P90 values per position for comparisons
  templates: defineTable({
    position: v.union(
      v.literal("GK"),
      v.literal("DEF"),
      v.literal("MID"),
      v.literal("FWD")
    ),
    gameweek: v.number(),
    baselineEo: v.number(),
    baselineEv95P90: v.number(),
  }).index("by_position_gameweek", ["position", "gameweek"]),

  // Recommendations - stores past decisions for tracking
  recommendations: defineTable({
    gameweek: v.number(),
    type: v.union(
      v.literal("captaincy"),
      v.literal("xi"),
      v.literal("transfer")
    ),
    decision: v.string(), // JSON stringified decision data
    metrics: v.string(), // JSON stringified metrics (EO gap, tolerance, bleed, etc.)
    createdAt: v.number(), // timestamp
  }).index("by_gameweek_type", ["gameweek", "type"]),

  // Appearances - historical match data for xMins modeling
  appearances: defineTable({
    playerId: v.id("players"),
    gameweek: v.number(),
    season: v.string(), // e.g., "2023-24"
    started: v.boolean(), // true if in starting XI
    minutes: v.number(), // minutes played (0-90+)
    injExit: v.boolean(), // true if subbed off due to injury
    redCard: v.boolean(), // true if sent off
    date: v.number(), // timestamp of match
    competition: v.string(), // "Premier League", "UEFA", etc.
    opponent: v.string(), // opponent team name
    homeAway: v.union(v.literal("home"), v.literal("away")),
    fplGameweekId: v.optional(v.number()), // FPL API gameweek ID
  })
    .index("by_player_gameweek", ["playerId", "gameweek"])
    .index("by_player_season", ["playerId", "season"])
    .index("by_gameweek", ["gameweek"]),

  // Context - gameweek-level factors affecting rotation
  context: defineTable({
    gameweek: v.number(),
    season: v.string(),
    congestionFlag: v.boolean(), // true if midweek UEFA/cup fixture
    intlWindowFlag: v.boolean(), // true if international break just ended
    avgDaysRestTeam: v.optional(v.number()), // avg days since last match for team
    pressConfNotes: v.optional(v.string()), // optional text notes from pressers
  }).index("by_gameweek_season", ["gameweek", "season"]),

  // Depth - rotation risk per player
  depth: defineTable({
    playerId: v.id("players"),
    gameweek: v.number(),
    viableBackupsCount: v.number(), // manual integer: how many credible rotation options
    notes: v.optional(v.string()), // e.g., "Injury to backup increases lock"
    updatedAt: v.number(), // timestamp
  }).index("by_player_gameweek", ["playerId", "gameweek"]),

  // xMins - predicted minutes with audit trail
  xmins: defineTable({
    playerId: v.id("players"),
    gameweek: v.number(),
    startProb: v.number(), // 0.0-1.0 probability of starting
    xMinsStart: v.number(), // expected minutes conditional on starting
    p90: v.number(), // probability of playing 90 minutes
    source: v.union(
      v.literal("model"),
      v.literal("override"),
      v.literal("heuristic")
    ),
    uncertaintyLo: v.optional(v.number()), // lower bound of confidence interval
    uncertaintyHi: v.optional(v.number()), // upper bound of confidence interval
    flags: v.optional(
      v.object({
        injExcluded: v.optional(v.boolean()),
        rcExcluded: v.optional(v.boolean()),
        recentWeightApplied: v.optional(v.boolean()),
        roleLock: v.optional(v.boolean()),
        sparseFallback: v.optional(v.boolean()),
      })
    ),
    modelVersion: v.optional(v.string()), // e.g., "v1.2.0"
    updatedAt: v.number(), // timestamp
  })
    .index("by_player_gameweek", ["playerId", "gameweek"])
    .index("by_gameweek", ["gameweek"]),

  // Overrides - manual adjustments to xMins/P90
  overrides: defineTable({
    playerId: v.id("players"),
    gameweek: v.number(),
    field: v.union(
      v.literal("xMins"),
      v.literal("p90"),
      v.literal("startProb")
    ),
    value: v.number(), // override value
    reason: v.optional(v.string()), // user-provided reason
    createdAt: v.number(), // timestamp
    createdBy: v.optional(v.string()), // user identifier
  })
    .index("by_player_gameweek", ["playerId", "gameweek"])
    .index("by_created_at", ["createdAt"]),
});
