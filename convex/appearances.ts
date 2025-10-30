import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Get appearances for a specific player
export const getPlayerAppearances = query({
  args: {
    playerId: v.id("players"),
    season: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("appearances")
      .withIndex("by_player_season", (q) => q.eq("playerId", args.playerId));

    if (args.season) {
      query = ctx.db
        .query("appearances")
        .withIndex("by_player_season", (q) =>
          q.eq("playerId", args.playerId).eq("season", args.season)
        );
    }

    const appearances = await query.collect();

    // Sort by date descending (most recent first)
    appearances.sort((a, b) => b.date - a.date);

    if (args.limit) {
      return appearances.slice(0, args.limit);
    }

    return appearances;
  },
});

// Get all appearances for a gameweek
export const getGameweekAppearances = query({
  args: {
    gameweek: v.number(),
    season: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const appearances = await ctx.db
      .query("appearances")
      .withIndex("by_gameweek", (q) => q.eq("gameweek", args.gameweek))
      .collect();

    if (args.season) {
      return appearances.filter((a) => a.season === args.season);
    }

    return appearances;
  },
});

// Add or update an appearance
export const upsertAppearance = mutation({
  args: {
    playerId: v.id("players"),
    gameweek: v.number(),
    season: v.string(),
    started: v.boolean(),
    minutes: v.number(),
    injExit: v.boolean(),
    redCard: v.boolean(),
    date: v.number(),
    competition: v.string(),
    opponent: v.string(),
    homeAway: v.union(v.literal("home"), v.literal("away")),
    fplGameweekId: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Check if appearance already exists
    const existing = await ctx.db
      .query("appearances")
      .withIndex("by_player_gameweek", (q) =>
        q.eq("playerId", args.playerId).eq("gameweek", args.gameweek)
      )
      .filter((q) => q.eq(q.field("season"), args.season))
      .first();

    if (existing) {
      // Update existing appearance
      await ctx.db.patch(existing._id, {
        started: args.started,
        minutes: args.minutes,
        injExit: args.injExit,
        redCard: args.redCard,
        date: args.date,
        competition: args.competition,
        opponent: args.opponent,
        homeAway: args.homeAway,
        fplGameweekId: args.fplGameweekId,
      });
      return existing._id;
    } else {
      // Create new appearance
      return await ctx.db.insert("appearances", {
        playerId: args.playerId,
        gameweek: args.gameweek,
        season: args.season,
        started: args.started,
        minutes: args.minutes,
        injExit: args.injExit,
        redCard: args.redCard,
        date: args.date,
        competition: args.competition,
        opponent: args.opponent,
        homeAway: args.homeAway,
        fplGameweekId: args.fplGameweekId,
      });
    }
  },
});

// Bulk insert appearances (for historical data import)
export const bulkInsertAppearances = mutation({
  args: {
    appearances: v.array(
      v.object({
        playerId: v.id("players"),
        gameweek: v.number(),
        season: v.string(),
        started: v.boolean(),
        minutes: v.number(),
        injExit: v.boolean(),
        redCard: v.boolean(),
        date: v.number(),
        competition: v.string(),
        opponent: v.string(),
        homeAway: v.union(v.literal("home"), v.literal("away")),
        fplGameweekId: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const insertedIds = [];

    for (const appearance of args.appearances) {
      // Check if already exists
      const existing = await ctx.db
        .query("appearances")
        .withIndex("by_player_gameweek", (q) =>
          q.eq("playerId", appearance.playerId).eq("gameweek", appearance.gameweek)
        )
        .filter((q) => q.eq(q.field("season"), appearance.season))
        .first();

      if (!existing) {
        const id = await ctx.db.insert("appearances", appearance);
        insertedIds.push(id);
      }
    }

    return {
      inserted: insertedIds.length,
      total: args.appearances.length,
      skipped: args.appearances.length - insertedIds.length,
    };
  },
});

// Delete appearances for a player
export const deletePlayerAppearances = mutation({
  args: {
    playerId: v.id("players"),
    season: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const appearances = await ctx.db
      .query("appearances")
      .withIndex("by_player_season", (q) => q.eq("playerId", args.playerId))
      .collect();

    const toDelete = args.season
      ? appearances.filter((a) => a.season === args.season)
      : appearances;

    for (const appearance of toDelete) {
      await ctx.db.delete(appearance._id);
    }

    return { deleted: toDelete.length };
  },
});

// Get healthy starts for a player (excludes injury/red card)
export const getHealthyStarts = query({
  args: {
    playerId: v.id("players"),
    limit: v.optional(v.number()),
    excludeInjury: v.optional(v.boolean()),
    excludeRedCard: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const appearances = await ctx.db
      .query("appearances")
      .withIndex("by_player_season", (q) => q.eq("playerId", args.playerId))
      .collect();

    // Sort by date descending
    appearances.sort((a, b) => b.date - a.date);

    // Filter for healthy starts
    const healthyStarts = appearances.filter((a) => {
      if (!a.started) return false;
      if (args.excludeInjury !== false && a.injExit) return false;
      if (args.excludeRedCard !== false && a.redCard) return false;
      return true;
    });

    if (args.limit) {
      return healthyStarts.slice(0, args.limit);
    }

    return healthyStarts;
  },
});
