import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Get depth info for a player in a specific gameweek
export const getPlayerDepth = query({
  args: {
    playerId: v.id("players"),
    gameweek: v.number(),
  },
  handler: async (ctx, args) => {
    const depth = await ctx.db
      .query("depth")
      .withIndex("by_player_gameweek", (q) =>
        q.eq("playerId", args.playerId).eq("gameweek", args.gameweek)
      )
      .first();

    return depth;
  },
});

// Get depth info for multiple players
export const getMultiplePlayersDepth = query({
  args: {
    playerIds: v.array(v.id("players")),
    gameweek: v.number(),
  },
  handler: async (ctx, args) => {
    const depths = await Promise.all(
      args.playerIds.map(async (playerId) => {
        const depth = await ctx.db
          .query("depth")
          .withIndex("by_player_gameweek", (q) =>
            q.eq("playerId", playerId).eq("gameweek", args.gameweek)
          )
          .first();
        return { playerId, depth };
      })
    );

    return depths;
  },
});

// Upsert player depth
export const upsertPlayerDepth = mutation({
  args: {
    playerId: v.id("players"),
    gameweek: v.number(),
    viableBackupsCount: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("depth")
      .withIndex("by_player_gameweek", (q) =>
        q.eq("playerId", args.playerId).eq("gameweek", args.gameweek)
      )
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        viableBackupsCount: args.viableBackupsCount,
        notes: args.notes,
        updatedAt: now,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("depth", {
        playerId: args.playerId,
        gameweek: args.gameweek,
        viableBackupsCount: args.viableBackupsCount,
        notes: args.notes,
        updatedAt: now,
      });
    }
  },
});

// Bulk insert depth data
export const bulkInsertDepth = mutation({
  args: {
    depths: v.array(
      v.object({
        playerId: v.id("players"),
        gameweek: v.number(),
        viableBackupsCount: v.number(),
        notes: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const insertedIds = [];
    const now = Date.now();

    for (const depth of args.depths) {
      const existing = await ctx.db
        .query("depth")
        .withIndex("by_player_gameweek", (q) =>
          q.eq("playerId", depth.playerId).eq("gameweek", depth.gameweek)
        )
        .first();

      if (!existing) {
        const id = await ctx.db.insert("depth", {
          ...depth,
          updatedAt: now,
        });
        insertedIds.push(id);
      }
    }

    return {
      inserted: insertedIds.length,
      total: args.depths.length,
      skipped: args.depths.length - insertedIds.length,
    };
  },
});

// Delete depth data for a player
export const deletePlayerDepth = mutation({
  args: {
    playerId: v.id("players"),
    gameweek: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("depth")
      .withIndex("by_player_gameweek", (q) => q.eq("playerId", args.playerId));

    if (args.gameweek !== undefined) {
      const gameweek = args.gameweek;
      query = ctx.db
        .query("depth")
        .withIndex("by_player_gameweek", (q) =>
          q.eq("playerId", args.playerId).eq("gameweek", gameweek)
        );
    }

    const depths = await query.collect();

    for (const depth of depths) {
      await ctx.db.delete(depth._id);
    }

    return { deleted: depths.length };
  },
});

// Copy depth from one gameweek to another (for projecting forward)
export const copyDepthToGameweek = mutation({
  args: {
    fromGameweek: v.number(),
    toGameweek: v.number(),
  },
  handler: async (ctx, args) => {
    const sourceDepths = await ctx.db.query("depth").collect();
    const filtered = sourceDepths.filter((d) => d.gameweek === args.fromGameweek);

    const insertedIds = [];
    const now = Date.now();

    for (const source of filtered) {
      // Check if already exists for target gameweek
      const existing = await ctx.db
        .query("depth")
        .withIndex("by_player_gameweek", (q) =>
          q.eq("playerId", source.playerId).eq("gameweek", args.toGameweek)
        )
        .first();

      if (!existing) {
        const id = await ctx.db.insert("depth", {
          playerId: source.playerId,
          gameweek: args.toGameweek,
          viableBackupsCount: source.viableBackupsCount,
          notes: source.notes,
          updatedAt: now,
        });
        insertedIds.push(id);
      }
    }

    return {
      copied: insertedIds.length,
      skipped: filtered.length - insertedIds.length,
    };
  },
});
