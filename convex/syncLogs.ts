import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Get the most recent sync log for each type
 */
export const getLatestSyncs = query({
  handler: async (ctx) => {
    const syncTypes = ["players", "context", "fixtures", "predictions", "pre-deadline"] as const;

    const latestSyncs = await Promise.all(
      syncTypes.map(async (type) => {
        const logs = await ctx.db
          .query("syncLogs")
          .withIndex("by_type_timestamp", (q) => q.eq("syncType", type))
          .order("desc")
          .take(1);

        return {
          syncType: type,
          lastSync: logs[0] || null,
        };
      })
    );

    return latestSyncs;
  },
});

/**
 * Get recent sync logs (last 20)
 */
export const getRecentSyncs = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 20;

    return await ctx.db
      .query("syncLogs")
      .withIndex("by_timestamp")
      .order("desc")
      .take(limit);
  },
});

/**
 * Log a sync operation
 */
export const logSync = mutation({
  args: {
    syncType: v.union(
      v.literal("players"),
      v.literal("context"),
      v.literal("fixtures"),
      v.literal("predictions"),
      v.literal("pre-deadline")
    ),
    status: v.union(v.literal("success"), v.literal("failed")),
    details: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("syncLogs", {
      syncType: args.syncType,
      status: args.status,
      timestamp: Date.now(),
      details: args.details,
      errorMessage: args.errorMessage,
    });
  },
});
