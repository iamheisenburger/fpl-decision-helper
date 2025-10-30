import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Get override for a specific player/gameweek/field
export const getOverride = query({
  args: {
    playerId: v.id("players"),
    gameweek: v.number(),
    field: v.optional(v.union(v.literal("xMins"), v.literal("p90"), v.literal("startProb"))),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("overrides")
      .withIndex("by_player_gameweek", (q) =>
        q.eq("playerId", args.playerId).eq("gameweek", args.gameweek)
      );

    const overrides = await query.collect();

    if (args.field) {
      return overrides.find((o) => o.field === args.field) || null;
    }

    return overrides;
  },
});

// Get all overrides for a player
export const getPlayerOverrides = query({
  args: {
    playerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    const overrides = await ctx.db
      .query("overrides")
      .withIndex("by_player_gameweek", (q) => q.eq("playerId", args.playerId))
      .collect();

    return overrides.sort((a, b) => a.gameweek - b.gameweek);
  },
});

// Get recent overrides (for audit trail)
export const getRecentOverrides = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const overrides = await ctx.db
      .query("overrides")
      .withIndex("by_created_at")
      .order("desc")
      .take(args.limit || 50);

    // Enrich with player data
    const enriched = await Promise.all(
      overrides.map(async (override) => {
        const player = await ctx.db.get(override.playerId);
        return {
          ...override,
          player,
        };
      })
    );

    return enriched;
  },
});

// Create or update an override
export const upsertOverride = mutation({
  args: {
    playerId: v.id("players"),
    gameweek: v.number(),
    field: v.union(v.literal("xMins"), v.literal("p90"), v.literal("startProb")),
    value: v.number(),
    reason: v.optional(v.string()),
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if override already exists for this player/gameweek/field
    const existing = await ctx.db
      .query("overrides")
      .withIndex("by_player_gameweek", (q) =>
        q.eq("playerId", args.playerId).eq("gameweek", args.gameweek)
      )
      .collect();

    const existingForField = existing.find((o) => o.field === args.field);

    const now = Date.now();

    if (existingForField) {
      // Update existing override
      await ctx.db.patch(existingForField._id, {
        value: args.value,
        reason: args.reason,
        createdAt: now, // Update timestamp
        createdBy: args.createdBy,
      });
      return existingForField._id;
    } else {
      // Create new override
      return await ctx.db.insert("overrides", {
        playerId: args.playerId,
        gameweek: args.gameweek,
        field: args.field,
        value: args.value,
        reason: args.reason,
        createdAt: now,
        createdBy: args.createdBy,
      });
    }
  },
});

// Delete an override
export const deleteOverride = mutation({
  args: {
    playerId: v.id("players"),
    gameweek: v.number(),
    field: v.union(v.literal("xMins"), v.literal("p90"), v.literal("startProb")),
  },
  handler: async (ctx, args) => {
    const overrides = await ctx.db
      .query("overrides")
      .withIndex("by_player_gameweek", (q) =>
        q.eq("playerId", args.playerId).eq("gameweek", args.gameweek)
      )
      .collect();

    const toDelete = overrides.find((o) => o.field === args.field);

    if (toDelete) {
      await ctx.db.delete(toDelete._id);
      return { deleted: true };
    }

    return { deleted: false };
  },
});

// Delete all overrides for a player/gameweek
export const deleteAllOverrides = mutation({
  args: {
    playerId: v.id("players"),
    gameweek: v.number(),
  },
  handler: async (ctx, args) => {
    const overrides = await ctx.db
      .query("overrides")
      .withIndex("by_player_gameweek", (q) =>
        q.eq("playerId", args.playerId).eq("gameweek", args.gameweek)
      )
      .collect();

    for (const override of overrides) {
      await ctx.db.delete(override._id);
    }

    return { deleted: overrides.length };
  },
});

// Apply override to xMins prediction (updates xmins table)
export const applyOverride = mutation({
  args: {
    playerId: v.id("players"),
    gameweek: v.number(),
    field: v.union(v.literal("xMins"), v.literal("p90"), v.literal("startProb")),
    value: v.number(),
    reason: v.optional(v.string()),
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Create the override record directly
    const existing = await ctx.db
      .query("overrides")
      .withIndex("by_player_gameweek", (q) =>
        q.eq("playerId", args.playerId).eq("gameweek", args.gameweek)
      )
      .collect();

    const existingForField = existing.find((o) => o.field === args.field);
    const now = Date.now();

    let overrideId;
    if (existingForField) {
      await ctx.db.patch(existingForField._id, {
        value: args.value,
        reason: args.reason,
        createdAt: now,
        createdBy: args.createdBy,
      });
      overrideId = existingForField._id;
    } else {
      overrideId = await ctx.db.insert("overrides", {
        playerId: args.playerId,
        gameweek: args.gameweek,
        field: args.field,
        value: args.value,
        reason: args.reason,
        createdAt: now,
        createdBy: args.createdBy,
      });
    }

    // Get existing xMins prediction
    const xmins = await ctx.db
      .query("xmins")
      .withIndex("by_player_gameweek", (q) =>
        q.eq("playerId", args.playerId).eq("gameweek", args.gameweek)
      )
      .first();

    if (!xmins) {
      // Create new xMins record with override
      const now = Date.now();
      await ctx.db.insert("xmins", {
        playerId: args.playerId,
        gameweek: args.gameweek,
        startProb: args.field === "startProb" ? args.value : 0.0,
        xMinsStart: args.field === "xMins" ? args.value : 0.0,
        p90: args.field === "p90" ? args.value : 0.0,
        source: "override",
        updatedAt: now,
      });
    } else {
      // Update existing xMins prediction
      const updates: any = {
        source: "override",
        updatedAt: Date.now(),
      };

      if (args.field === "xMins") {
        updates.xMinsStart = args.value;
      } else if (args.field === "p90") {
        updates.p90 = args.value;
      } else if (args.field === "startProb") {
        updates.startProb = args.value;
      }

      await ctx.db.patch(xmins._id, updates);
    }

    return { overrideId, applied: true };
  },
});

// Bulk apply overrides from CSV/manual entry
export const bulkApplyOverrides = mutation({
  args: {
    overrides: v.array(
      v.object({
        playerId: v.id("players"),
        gameweek: v.number(),
        field: v.union(v.literal("xMins"), v.literal("p90"), v.literal("startProb")),
        value: v.number(),
        reason: v.optional(v.string()),
      })
    ),
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const applied = [];
    const now = Date.now();

    for (const override of args.overrides) {
      // Create/update override record
      const existing = await ctx.db
        .query("overrides")
        .withIndex("by_player_gameweek", (q) =>
          q.eq("playerId", override.playerId).eq("gameweek", override.gameweek)
        )
        .collect();

      const existingForField = existing.find((o: any) => o.field === override.field);

      let overrideId;
      if (existingForField) {
        await ctx.db.patch(existingForField._id, {
          value: override.value,
          reason: override.reason,
          createdAt: now,
          createdBy: args.createdBy,
        });
        overrideId = existingForField._id;
      } else {
        overrideId = await ctx.db.insert("overrides", {
          playerId: override.playerId,
          gameweek: override.gameweek,
          field: override.field,
          value: override.value,
          reason: override.reason,
          createdAt: now,
          createdBy: args.createdBy,
        });
      }

      // Get existing xMins prediction
      const xmins = await ctx.db
        .query("xmins")
        .withIndex("by_player_gameweek", (q) =>
          q.eq("playerId", override.playerId).eq("gameweek", override.gameweek)
        )
        .first();

      if (!xmins) {
        // Create new xMins record with override
        await ctx.db.insert("xmins", {
          playerId: override.playerId,
          gameweek: override.gameweek,
          startProb: override.field === "startProb" ? override.value : 0.0,
          xMinsStart: override.field === "xMins" ? override.value : 0.0,
          p90: override.field === "p90" ? override.value : 0.0,
          source: "override",
          updatedAt: now,
        });
      } else {
        // Update existing xMins prediction
        const updates: any = {
          source: "override",
          updatedAt: now,
        };

        if (override.field === "xMins") {
          updates.xMinsStart = override.value;
        } else if (override.field === "p90") {
          updates.p90 = override.value;
        } else if (override.field === "startProb") {
          updates.startProb = override.value;
        }

        await ctx.db.patch(xmins._id, updates);
      }

      applied.push({ overrideId, applied: true });
    }

    return {
      applied: applied.length,
      total: args.overrides.length,
    };
  },
});

// Clear all overrides and restore model predictions
export const clearAllOverrides = mutation({
  args: {
    playerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    const overrides = await ctx.db
      .query("overrides")
      .withIndex("by_player_gameweek", (q) => q.eq("playerId", args.playerId))
      .collect();

    for (const override of overrides) {
      await ctx.db.delete(override._id);
    }

    // Reset xMins predictions to model source (you may want to re-run predictions)
    const xminsPredictions = await ctx.db
      .query("xmins")
      .withIndex("by_player_gameweek", (q) => q.eq("playerId", args.playerId))
      .collect();

    const overriddenPredictions = xminsPredictions.filter((p) => p.source === "override");

    // Note: This doesn't restore the original model values, just changes the source flag
    // You'll need to re-run the model to get original predictions back
    for (const prediction of overriddenPredictions) {
      await ctx.db.patch(prediction._id, {
        source: "model",
        updatedAt: Date.now(),
      });
    }

    return {
      overridesDeleted: overrides.length,
      predictionsReset: overriddenPredictions.length,
    };
  },
});
