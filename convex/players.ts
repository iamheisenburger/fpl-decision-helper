import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Get all players
export const getAllPlayers = query({
  handler: async (ctx) => {
    return await ctx.db.query("players").collect();
  },
});

// Get player by ID
export const getPlayer = query({
  args: { id: v.id("players") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Get player by name
export const getPlayerByName = query({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("players")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
  },
});

// Get players by position
export const getPlayersByPosition = query({
  args: { position: v.union(v.literal("GK"), v.literal("DEF"), v.literal("MID"), v.literal("FWD")) },
  handler: async (ctx, args) => {
    const allPlayers = await ctx.db.query("players").collect();
    return allPlayers.filter((p) => p.position === args.position);
  },
});

// Add a new player
export const addPlayer = mutation({
  args: {
    name: v.string(),
    position: v.union(v.literal("GK"), v.literal("DEF"), v.literal("MID"), v.literal("FWD")),
    price: v.number(),
    team: v.string(),
    fplId: v.optional(v.number()),
    status: v.optional(v.string()),
    news: v.optional(v.string()),
    newsAdded: v.optional(v.number()),
    chanceOfPlayingNextRound: v.optional(v.number()),
    lastPriceUpdate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("players", {
      name: args.name,
      position: args.position,
      price: args.price,
      team: args.team,
      fplId: args.fplId,
      status: args.status,
      news: args.news,
      newsAdded: args.newsAdded,
      chanceOfPlayingNextRound: args.chanceOfPlayingNextRound,
      lastPriceUpdate: args.lastPriceUpdate,
    });
  },
});

// Update player
export const updatePlayer = mutation({
  args: {
    id: v.id("players"),
    name: v.optional(v.string()),
    position: v.optional(v.union(v.literal("GK"), v.literal("DEF"), v.literal("MID"), v.literal("FWD"))),
    price: v.optional(v.number()),
    team: v.optional(v.string()),
    fplId: v.optional(v.number()),
    status: v.optional(v.string()),
    news: v.optional(v.string()),
    newsAdded: v.optional(v.number()),
    chanceOfPlayingNextRound: v.optional(v.number()),
    lastPriceUpdate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, updates);
  },
});

// Delete player
export const deletePlayer = mutation({
  args: { id: v.id("players") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
