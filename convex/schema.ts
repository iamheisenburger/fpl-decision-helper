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
  }).index("by_name", ["name"]),

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
});
