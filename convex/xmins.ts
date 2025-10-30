import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Get xMins prediction for a specific player and gameweek
export const getPlayerXMins = query({
  args: {
    playerId: v.id("players"),
    gameweek: v.number(),
  },
  handler: async (ctx, args) => {
    const xmins = await ctx.db
      .query("xmins")
      .withIndex("by_player_gameweek", (q) =>
        q.eq("playerId", args.playerId).eq("gameweek", args.gameweek)
      )
      .first();

    return xmins;
  },
});

// Get xMins predictions for multiple players
export const getMultiplePlayersXMins = query({
  args: {
    playerIds: v.array(v.id("players")),
    gameweek: v.number(),
  },
  handler: async (ctx, args) => {
    const predictions = await Promise.all(
      args.playerIds.map(async (playerId) => {
        const xmins = await ctx.db
          .query("xmins")
          .withIndex("by_player_gameweek", (q) =>
            q.eq("playerId", playerId).eq("gameweek", args.gameweek)
          )
          .first();
        return { playerId, xmins };
      })
    );

    return predictions;
  },
});

// Get all xMins predictions for a gameweek
export const getGameweekXMins = query({
  args: {
    gameweek: v.number(),
  },
  handler: async (ctx, args) => {
    const predictions = await ctx.db
      .query("xmins")
      .withIndex("by_gameweek", (q) => q.eq("gameweek", args.gameweek))
      .collect();

    return predictions;
  },
});

// Get xMins predictions for a player across multiple gameweeks
export const getPlayerXMinsRange = query({
  args: {
    playerId: v.id("players"),
    startGameweek: v.number(),
    endGameweek: v.number(),
  },
  handler: async (ctx, args) => {
    const allPredictions = await ctx.db
      .query("xmins")
      .withIndex("by_player_gameweek", (q) => q.eq("playerId", args.playerId))
      .collect();

    const filtered = allPredictions.filter(
      (p) => p.gameweek >= args.startGameweek && p.gameweek <= args.endGameweek
    );

    return filtered.sort((a, b) => a.gameweek - b.gameweek);
  },
});

// Upsert xMins prediction
export const upsertXMins = mutation({
  args: {
    playerId: v.id("players"),
    gameweek: v.number(),
    startProb: v.number(),
    xMinsStart: v.number(),
    p90: v.number(),
    source: v.union(v.literal("model"), v.literal("override"), v.literal("heuristic")),
    uncertaintyLo: v.optional(v.number()),
    uncertaintyHi: v.optional(v.number()),
    flags: v.optional(
      v.object({
        injExcluded: v.optional(v.boolean()),
        rcExcluded: v.optional(v.boolean()),
        recentWeightApplied: v.optional(v.boolean()),
        roleLock: v.optional(v.boolean()),
        sparseFallback: v.optional(v.boolean()),
      })
    ),
    modelVersion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("xmins")
      .withIndex("by_player_gameweek", (q) =>
        q.eq("playerId", args.playerId).eq("gameweek", args.gameweek)
      )
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        startProb: args.startProb,
        xMinsStart: args.xMinsStart,
        p90: args.p90,
        source: args.source,
        uncertaintyLo: args.uncertaintyLo,
        uncertaintyHi: args.uncertaintyHi,
        flags: args.flags,
        modelVersion: args.modelVersion,
        updatedAt: now,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("xmins", {
        playerId: args.playerId,
        gameweek: args.gameweek,
        startProb: args.startProb,
        xMinsStart: args.xMinsStart,
        p90: args.p90,
        source: args.source,
        uncertaintyLo: args.uncertaintyLo,
        uncertaintyHi: args.uncertaintyHi,
        flags: args.flags,
        modelVersion: args.modelVersion,
        updatedAt: now,
      });
    }
  },
});

// Bulk insert xMins predictions
export const bulkInsertXMins = mutation({
  args: {
    predictions: v.array(
      v.object({
        playerId: v.id("players"),
        gameweek: v.number(),
        startProb: v.number(),
        xMinsStart: v.number(),
        p90: v.number(),
        source: v.union(v.literal("model"), v.literal("override"), v.literal("heuristic")),
        uncertaintyLo: v.optional(v.number()),
        uncertaintyHi: v.optional(v.number()),
        flags: v.optional(
          v.object({
            injExcluded: v.optional(v.boolean()),
            rcExcluded: v.optional(v.boolean()),
            recentWeightApplied: v.optional(v.boolean()),
            roleLock: v.optional(v.boolean()),
            sparseFallback: v.optional(v.boolean()),
          })
        ),
        modelVersion: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const insertedIds = [];
    const updatedIds = [];
    const now = Date.now();

    for (const prediction of args.predictions) {
      const existing = await ctx.db
        .query("xmins")
        .withIndex("by_player_gameweek", (q) =>
          q.eq("playerId", prediction.playerId).eq("gameweek", prediction.gameweek)
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          ...prediction,
          updatedAt: now,
        });
        updatedIds.push(existing._id);
      } else {
        const id = await ctx.db.insert("xmins", {
          ...prediction,
          updatedAt: now,
        });
        insertedIds.push(id);
      }
    }

    return {
      inserted: insertedIds.length,
      updated: updatedIds.length,
      total: args.predictions.length,
    };
  },
});

// Delete xMins predictions
export const deletePlayerXMins = mutation({
  args: {
    playerId: v.id("players"),
    gameweek: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("xmins")
      .withIndex("by_player_gameweek", (q) => q.eq("playerId", args.playerId));

    if (args.gameweek !== undefined) {
      query = ctx.db
        .query("xmins")
        .withIndex("by_player_gameweek", (q) =>
          q.eq("playerId", args.playerId).eq("gameweek", args.gameweek)
        );
    }

    const predictions = await query.collect();

    for (const prediction of predictions) {
      await ctx.db.delete(prediction._id);
    }

    return { deleted: predictions.length };
  },
});

// Get audit information for a prediction
export const getXMinsAudit = query({
  args: {
    playerId: v.id("players"),
    gameweek: v.number(),
  },
  handler: async (ctx, args) => {
    const xmins = await ctx.db
      .query("xmins")
      .withIndex("by_player_gameweek", (q) =>
        q.eq("playerId", args.playerId).eq("gameweek", args.gameweek)
      )
      .first();

    if (!xmins) {
      return null;
    }

    // Get player info
    const player = await ctx.db.get(args.playerId);

    // Get any overrides for this player/gameweek
    const overrides = await ctx.db
      .query("overrides")
      .withIndex("by_player_gameweek", (q) =>
        q.eq("playerId", args.playerId).eq("gameweek", args.gameweek)
      )
      .collect();

    return {
      xmins,
      player,
      overrides,
      audit: {
        source: xmins.source,
        flags: xmins.flags || {},
        modelVersion: xmins.modelVersion,
        updatedAt: xmins.updatedAt,
        uncertaintyRange: xmins.uncertaintyLo && xmins.uncertaintyHi
          ? [xmins.uncertaintyLo, xmins.uncertaintyHi]
          : null,
      },
    };
  },
});

// Calculate effective xMins (startProb × xMinsStart)
export const getEffectiveXMins = query({
  args: {
    playerId: v.id("players"),
    gameweek: v.number(),
  },
  handler: async (ctx, args) => {
    const xmins = await ctx.db
      .query("xmins")
      .withIndex("by_player_gameweek", (q) =>
        q.eq("playerId", args.playerId).eq("gameweek", args.gameweek)
      )
      .first();

    if (!xmins) {
      return null;
    }

    const effectiveXMins = xmins.startProb * xmins.xMinsStart;

    return {
      playerId: args.playerId,
      gameweek: args.gameweek,
      startProb: xmins.startProb,
      xMinsStart: xmins.xMinsStart,
      effectiveXMins,
      p90: xmins.p90,
      source: xmins.source,
    };
  },
});
