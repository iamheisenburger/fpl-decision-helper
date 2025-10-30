/**
 * Depth Charts Module
 *
 * Manages team depth charts to identify backup players.
 * When a starter is injured, backups get xMins boost.
 *
 * NOTE: Depth charts are EMPTY by default.
 * Populate via:
 * 1. Manual entry (admin interface)
 * 2. Automated inference from substitution patterns
 * 3. Scraping from team news
 */

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

/**
 * Get depth chart entry for a starter
 */
export const getDepthChartForStarter = query({
  args: { starterPlayerId: v.id("players") },
  handler: async (ctx, args) => {
    const depthChart = await ctx.db
      .query("depthCharts")
      .withIndex("by_starter", (q) => q.eq("starterPlayerId", args.starterPlayerId))
      .first();

    return depthChart;
  },
});

/**
 * Get all depth charts for a team
 */
export const getTeamDepthCharts = query({
  args: { teamId: v.number() },
  handler: async (ctx, args) => {
    const depthCharts = await ctx.db
      .query("depthCharts")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();

    return depthCharts;
  },
});

/**
 * Find who backs up a specific player
 *
 * Returns backup player IDs if depth chart exists.
 */
export const getBackupsForPlayer = query({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    // Find depth chart directly
    const depthChart = await ctx.db
      .query("depthCharts")
      .withIndex("by_starter", (q) => q.eq("starterPlayerId", args.playerId))
      .first();

    if (!depthChart) {
      return { hasBackups: false, backups: [] };
    }

    const backups = [];
    if (depthChart.backup1PlayerId) {
      const backup1 = await ctx.db.get(depthChart.backup1PlayerId);
      if (backup1) backups.push(backup1);
    }
    if (depthChart.backup2PlayerId) {
      const backup2 = await ctx.db.get(depthChart.backup2PlayerId);
      if (backup2) backups.push(backup2);
    }

    return {
      hasBackups: true,
      backups,
      confidence: depthChart.confidence,
    };
  },
});

/**
 * Add or update depth chart entry (mutation)
 */
export const upsertDepthChart = mutation({
  args: {
    teamId: v.number(),
    position: v.union(
      v.literal("GK"),
      v.literal("DEF"),
      v.literal("MID"),
      v.literal("FWD")
    ),
    starterPlayerId: v.id("players"),
    backup1PlayerId: v.optional(v.id("players")),
    backup2PlayerId: v.optional(v.id("players")),
    confidence: v.optional(v.number()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if entry already exists
    const existing = await ctx.db
      .query("depthCharts")
      .withIndex("by_starter", (q) => q.eq("starterPlayerId", args.starterPlayerId))
      .first();

    const data = {
      teamId: args.teamId,
      position: args.position,
      starterPlayerId: args.starterPlayerId,
      backup1PlayerId: args.backup1PlayerId,
      backup2PlayerId: args.backup2PlayerId,
      confidence: args.confidence || 0.7,
      lastUpdated: Date.now(),
      source: args.source || "manual",
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
      return existing._id;
    } else {
      return await ctx.db.insert("depthCharts", data);
    }
  },
});

/**
 * Calculate teammate xMins boost
 *
 * When a starter is injured/unavailable, their backups get extra minutes.
 * Boost amount = starter's baseline xMins × 70%
 *
 * Example:
 * - Starter normally plays 85 mins
 * - Starter gets injured (xMins = 0)
 * - Backup1 normally plays 20 mins → now 20 + (85 × 0.7) = 79.5 mins
 * - Backup2 normally plays 10 mins → now 10 + (85 × 0.3) = 35.5 mins
 *
 * @param starterPlayerId - The injured/unavailable starter
 * @param starterBaselineXMins - What starter would normally play (before injury)
 * @returns Map of backup player IDs to their xMins boost
 */
export const calculateTeammateBoost = query({
  args: {
    starterPlayerId: v.id("players"),
    starterBaselineXMins: v.number(),
  },
  handler: async (ctx, args) => {
    // Get depth chart for this starter directly
    const depthChart = await ctx.db
      .query("depthCharts")
      .withIndex("by_starter", (q) => q.eq("starterPlayerId", args.starterPlayerId))
      .first();

    if (!depthChart) {
      // No depth chart defined - no boost
      return {};
    }

    const boostMap: Record<string, number> = {};

    // Backup1 gets 70% of starter's minutes
    if (depthChart.backup1PlayerId) {
      boostMap[depthChart.backup1PlayerId] = args.starterBaselineXMins * 0.7;
    }

    // Backup2 gets 30% of starter's minutes
    if (depthChart.backup2PlayerId) {
      boostMap[depthChart.backup2PlayerId] = args.starterBaselineXMins * 0.3;
    }

    return boostMap;
  },
});

/**
 * Delete depth chart entry (mutation)
 */
export const deleteDepthChart = mutation({
  args: { id: v.id("depthCharts") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
