import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Get all gameweek inputs for a specific gameweek
export const getGameweekInputs = query({
  args: { gameweek: v.number() },
  handler: async (ctx, args) => {
    const inputs = await ctx.db
      .query("gameweekInputs")
      .withIndex("by_gameweek", (q) => q.eq("gameweek", args.gameweek))
      .collect();

    // Enrich with player data
    const enriched = await Promise.all(
      inputs.map(async (input) => {
        const player = await ctx.db.get(input.playerId);
        return {
          ...input,
          playerName: player?.name,
          position: player?.position,
          team: player?.team,
        };
      })
    );

    return enriched;
  },
});

// Get gameweek input for a specific player
export const getPlayerGameweekInput = query({
  args: {
    playerId: v.id("players"),
    gameweek: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("gameweekInputs")
      .withIndex("by_player_gameweek", (q) =>
        q.eq("playerId", args.playerId).eq("gameweek", args.gameweek)
      )
      .first();
  },
});

// Add or update gameweek input
export const upsertGameweekInput = mutation({
  args: {
    playerId: v.id("players"),
    gameweek: v.number(),
    ev: v.number(),
    ev95: v.number(),
    xMins: v.number(),
    eo: v.number(),
  },
  handler: async (ctx, args) => {
    // Check if entry already exists
    const existing = await ctx.db
      .query("gameweekInputs")
      .withIndex("by_player_gameweek", (q) =>
        q.eq("playerId", args.playerId).eq("gameweek", args.gameweek)
      )
      .first();

    if (existing) {
      // Update existing
      await ctx.db.patch(existing._id, {
        ev: args.ev,
        ev95: args.ev95,
        xMins: args.xMins,
        eo: args.eo,
      });
      return existing._id;
    } else {
      // Insert new
      return await ctx.db.insert("gameweekInputs", {
        playerId: args.playerId,
        gameweek: args.gameweek,
        ev: args.ev,
        ev95: args.ev95,
        xMins: args.xMins,
        eo: args.eo,
      });
    }
  },
});

// Batch upsert gameweek inputs
export const batchUpsertGameweekInputs = mutation({
  args: {
    inputs: v.array(
      v.object({
        playerId: v.id("players"),
        gameweek: v.number(),
        ev: v.number(),
        ev95: v.number(),
        xMins: v.number(),
        eo: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const results = [];
    for (const input of args.inputs) {
      const existing = await ctx.db
        .query("gameweekInputs")
        .withIndex("by_player_gameweek", (q) =>
          q.eq("playerId", input.playerId).eq("gameweek", input.gameweek)
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          ev: input.ev,
          ev95: input.ev95,
          xMins: input.xMins,
          eo: input.eo,
        });
        results.push(existing._id);
      } else {
        const id = await ctx.db.insert("gameweekInputs", input);
        results.push(id);
      }
    }
    return results;
  },
});

// Delete gameweek input
export const deleteGameweekInput = mutation({
  args: { id: v.id("gameweekInputs") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
