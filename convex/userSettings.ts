import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Get user settings
export const getSettings = query({
  handler: async (ctx) => {
    const settings = await ctx.db.query("userSettings").first();

    // Return defaults if no settings exist
    if (!settings) {
      return {
        captaincyEoRate: 0.1,
        captaincyEoCap: 1.0,
        xiEoRate: 0.1,
        xiEoCap: 1.0,
        xMinsThreshold: 70,
        xMinsPenalty: 0.3,
        weeklyBleedBudget: 0.8,
        defaultHoldLength: 8,
        transferGainThreshold: 0.5,
      };
    }

    return settings;
  },
});

// Initialize or update settings
export const upsertSettings = mutation({
  args: {
    captaincyEoRate: v.optional(v.number()),
    captaincyEoCap: v.optional(v.number()),
    xiEoRate: v.optional(v.number()),
    xiEoCap: v.optional(v.number()),
    xMinsThreshold: v.optional(v.number()),
    xMinsPenalty: v.optional(v.number()),
    weeklyBleedBudget: v.optional(v.number()),
    defaultHoldLength: v.optional(v.number()),
    transferGainThreshold: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("userSettings").first();

    if (existing) {
      // Update existing settings
      const updates: any = {};
      if (args.captaincyEoRate !== undefined) updates.captaincyEoRate = args.captaincyEoRate;
      if (args.captaincyEoCap !== undefined) updates.captaincyEoCap = args.captaincyEoCap;
      if (args.xiEoRate !== undefined) updates.xiEoRate = args.xiEoRate;
      if (args.xiEoCap !== undefined) updates.xiEoCap = args.xiEoCap;
      if (args.xMinsThreshold !== undefined) updates.xMinsThreshold = args.xMinsThreshold;
      if (args.xMinsPenalty !== undefined) updates.xMinsPenalty = args.xMinsPenalty;
      if (args.weeklyBleedBudget !== undefined) updates.weeklyBleedBudget = args.weeklyBleedBudget;
      if (args.defaultHoldLength !== undefined) updates.defaultHoldLength = args.defaultHoldLength;
      if (args.transferGainThreshold !== undefined) updates.transferGainThreshold = args.transferGainThreshold;

      await ctx.db.patch(existing._id, updates);
      return existing._id;
    } else {
      // Create new settings with defaults
      return await ctx.db.insert("userSettings", {
        captaincyEoRate: args.captaincyEoRate ?? 0.1,
        captaincyEoCap: args.captaincyEoCap ?? 1.0,
        xiEoRate: args.xiEoRate ?? 0.1,
        xiEoCap: args.xiEoCap ?? 1.0,
        xMinsThreshold: args.xMinsThreshold ?? 70,
        xMinsPenalty: args.xMinsPenalty ?? 0.3,
        weeklyBleedBudget: args.weeklyBleedBudget ?? 0.8,
        defaultHoldLength: args.defaultHoldLength ?? 8,
        transferGainThreshold: args.transferGainThreshold ?? 0.5,
      });
    }
  },
});

// Reset to defaults
export const resetSettings = mutation({
  handler: async (ctx) => {
    const existing = await ctx.db.query("userSettings").first();

    const defaults = {
      captaincyEoRate: 0.1,
      captaincyEoCap: 1.0,
      xiEoRate: 0.1,
      xiEoCap: 1.0,
      xMinsThreshold: 70,
      xMinsPenalty: 0.3,
      weeklyBleedBudget: 0.8,
      defaultHoldLength: 8,
      transferGainThreshold: 0.5,
    };

    if (existing) {
      await ctx.db.patch(existing._id, defaults);
      return existing._id;
    } else {
      return await ctx.db.insert("userSettings", defaults);
    }
  },
});
