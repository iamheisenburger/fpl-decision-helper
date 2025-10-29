import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Get user squad for a gameweek
export const getSquad = query({
  args: { gameweek: v.number() },
  handler: async (ctx, args) => {
    const squad = await ctx.db
      .query("userSquad")
      .withIndex("by_gameweek", (q) => q.eq("gameweek", args.gameweek))
      .collect();

    // Enrich with player data
    const enriched = await Promise.all(
      squad.map(async (entry) => {
        const player = await ctx.db.get(entry.playerId);
        return {
          ...entry,
          playerName: player?.name,
          position: player?.position,
          team: player?.team,
          price: player?.price,
        };
      })
    );

    return enriched;
  },
});

// Add player to squad
export const addToSquad = mutation({
  args: {
    playerId: v.id("players"),
    gameweek: v.number(),
    isCaptain: v.optional(v.boolean()),
    isVice: v.optional(v.boolean()),
    benchOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Check if player already in squad for this gameweek
    const existing = await ctx.db
      .query("userSquad")
      .withIndex("by_player_gameweek", (q) =>
        q.eq("playerId", args.playerId).eq("gameweek", args.gameweek)
      )
      .first();

    if (existing) {
      throw new Error("Player already in squad for this gameweek");
    }

    return await ctx.db.insert("userSquad", {
      playerId: args.playerId,
      gameweek: args.gameweek,
      isCaptain: args.isCaptain ?? false,
      isVice: args.isVice ?? false,
      benchOrder: args.benchOrder,
    });
  },
});

// Update squad entry
export const updateSquadEntry = mutation({
  args: {
    id: v.id("userSquad"),
    isCaptain: v.optional(v.boolean()),
    isVice: v.optional(v.boolean()),
    benchOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, updates);
  },
});

// Remove player from squad
export const removeFromSquad = mutation({
  args: { id: v.id("userSquad") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

// Batch set squad for a gameweek (replaces entire squad)
export const setSquad = mutation({
  args: {
    gameweek: v.number(),
    players: v.array(
      v.object({
        playerId: v.id("players"),
        isCaptain: v.boolean(),
        isVice: v.boolean(),
        benchOrder: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Delete existing squad for this gameweek
    const existing = await ctx.db
      .query("userSquad")
      .withIndex("by_gameweek", (q) => q.eq("gameweek", args.gameweek))
      .collect();

    for (const entry of existing) {
      await ctx.db.delete(entry._id);
    }

    // Insert new squad
    const results = [];
    for (const player of args.players) {
      const id = await ctx.db.insert("userSquad", {
        playerId: player.playerId,
        gameweek: args.gameweek,
        isCaptain: player.isCaptain,
        isVice: player.isVice,
        benchOrder: player.benchOrder,
      });
      results.push(id);
    }

    return results;
  },
});
