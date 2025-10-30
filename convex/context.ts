import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Get context for a specific gameweek
export const getGameweekContext = query({
  args: {
    gameweek: v.number(),
    season: v.string(),
  },
  handler: async (ctx, args) => {
    const context = await ctx.db
      .query("context")
      .withIndex("by_gameweek_season", (q) =>
        q.eq("gameweek", args.gameweek).eq("season", args.season)
      )
      .first();

    return context;
  },
});

// Get context for multiple gameweeks
export const getMultipleGameweeksContext = query({
  args: {
    gameweeks: v.array(v.number()),
    season: v.string(),
  },
  handler: async (ctx, args) => {
    const contexts = await Promise.all(
      args.gameweeks.map(async (gw) => {
        const context = await ctx.db
          .query("context")
          .withIndex("by_gameweek_season", (q) =>
            q.eq("gameweek", gw).eq("season", args.season)
          )
          .first();
        return { gameweek: gw, context };
      })
    );

    return contexts;
  },
});

// Upsert gameweek context
export const upsertGameweekContext = mutation({
  args: {
    gameweek: v.number(),
    season: v.string(),
    congestionFlag: v.boolean(),
    intlWindowFlag: v.boolean(),
    avgDaysRestTeam: v.optional(v.number()),
    pressConfNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("context")
      .withIndex("by_gameweek_season", (q) =>
        q.eq("gameweek", args.gameweek).eq("season", args.season)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        congestionFlag: args.congestionFlag,
        intlWindowFlag: args.intlWindowFlag,
        avgDaysRestTeam: args.avgDaysRestTeam,
        pressConfNotes: args.pressConfNotes,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("context", {
        gameweek: args.gameweek,
        season: args.season,
        congestionFlag: args.congestionFlag,
        intlWindowFlag: args.intlWindowFlag,
        avgDaysRestTeam: args.avgDaysRestTeam,
        pressConfNotes: args.pressConfNotes,
      });
    }
  },
});

// Bulk insert context data
export const bulkInsertContext = mutation({
  args: {
    contexts: v.array(
      v.object({
        gameweek: v.number(),
        season: v.string(),
        congestionFlag: v.boolean(),
        intlWindowFlag: v.boolean(),
        avgDaysRestTeam: v.optional(v.number()),
        pressConfNotes: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const insertedIds = [];

    for (const context of args.contexts) {
      const existing = await ctx.db
        .query("context")
        .withIndex("by_gameweek_season", (q) =>
          q.eq("gameweek", context.gameweek).eq("season", context.season)
        )
        .first();

      if (!existing) {
        const id = await ctx.db.insert("context", context);
        insertedIds.push(id);
      }
    }

    return {
      inserted: insertedIds.length,
      total: args.contexts.length,
      skipped: args.contexts.length - insertedIds.length,
    };
  },
});

// Delete context for a gameweek
export const deleteGameweekContext = mutation({
  args: {
    gameweek: v.number(),
    season: v.string(),
  },
  handler: async (ctx, args) => {
    const context = await ctx.db
      .query("context")
      .withIndex("by_gameweek_season", (q) =>
        q.eq("gameweek", args.gameweek).eq("season", args.season)
      )
      .first();

    if (context) {
      await ctx.db.delete(context._id);
      return { deleted: true };
    }

    return { deleted: false };
  },
});
