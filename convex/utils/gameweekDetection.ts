import { action, query } from "../_generated/server";

/**
 * Gameweek Detection Utilities
 *
 * Dynamically detects the current gameweek, next gameweek, and deadline times
 * from the FPL Official API. This eliminates hardcoded gameweek numbers.
 */

/**
 * Get the current active gameweek from FPL API
 * Returns the gameweek that is currently live or upcoming
 */
export const getCurrentGameweek = action({
  args: {},
  handler: async (): Promise<number> => {
    try {
      const response = await fetch(
        "https://fantasy.premierleague.com/api/bootstrap-static/"
      );

      if (!response.ok) {
        throw new Error(`FPL API returned ${response.status}`);
      }

      const data = await response.json();

      // Find the current gameweek (is_current = true)
      const currentGW = data.events.find((gw: any) => gw.is_current);

      if (currentGW) {
        return currentGW.id;
      }

      // Fallback: find the next upcoming gameweek
      const nextGW = data.events.find((gw: any) => gw.is_next);
      if (nextGW) {
        return nextGW.id;
      }

      // Last resort: find first unfinished gameweek
      const firstUnfinished = data.events.find((gw: any) => !gw.finished);
      if (firstUnfinished) {
        return firstUnfinished.id;
      }

      // If all else fails, return 1
      console.warn("Could not determine current gameweek, defaulting to 1");
      return 1;
    } catch (error) {
      console.error("Failed to fetch current gameweek:", error);
      // Default to 1 if API fails
      return 1;
    }
  },
});

/**
 * Get the next upcoming gameweek from FPL API
 */
export const getNextGameweek = action({
  args: {},
  handler: async (): Promise<number> => {
    try {
      const response = await fetch(
        "https://fantasy.premierleague.com/api/bootstrap-static/"
      );

      if (!response.ok) {
        throw new Error(`FPL API returned ${response.status}`);
      }

      const data = await response.json();

      // Find the next gameweek (is_next = true)
      const nextGW = data.events.find((gw: any) => gw.is_next);

      if (nextGW) {
        return nextGW.id;
      }

      // Fallback: current GW + 1
      const currentGW = data.events.find((gw: any) => gw.is_current);
      if (currentGW) {
        return currentGW.id + 1;
      }

      // Last resort: first unfinished GW
      const firstUnfinished = data.events.find((gw: any) => !gw.finished);
      if (firstUnfinished) {
        return firstUnfinished.id;
      }

      return 1;
    } catch (error) {
      console.error("Failed to fetch next gameweek:", error);
      return 1;
    }
  },
});

/**
 * Get all gameweek information including deadlines
 * Returns array of gameweeks with deadline times and status
 */
export const getAllGameweeks = action({
  args: {},
  handler: async (): Promise<
    Array<{
      id: number;
      name: string;
      deadline: string; // ISO 8601 timestamp
      finished: boolean;
      isCurrent: boolean;
      isNext: boolean;
    }>
  > => {
    try {
      const response = await fetch(
        "https://fantasy.premierleague.com/api/bootstrap-static/"
      );

      if (!response.ok) {
        throw new Error(`FPL API returned ${response.status}`);
      }

      const data = await response.json();

      return data.events.map((gw: any) => ({
        id: gw.id,
        name: gw.name,
        deadline: gw.deadline_time,
        finished: gw.finished,
        isCurrent: gw.is_current,
        isNext: gw.is_next,
      }));
    } catch (error) {
      console.error("Failed to fetch gameweeks:", error);
      return [];
    }
  },
});

/**
 * Get deadline time for a specific gameweek
 */
export const getGameweekDeadline = action({
  args: {},
  handler: async (ctx, args): Promise<{ gameweek: number; deadline: string; hoursUntilDeadline: number } | null> => {
    try {
      const response = await fetch(
        "https://fantasy.premierleague.com/api/bootstrap-static/"
      );

      if (!response.ok) {
        throw new Error(`FPL API returned ${response.status}`);
      }

      const data = await response.json();

      // Find next upcoming gameweek
      const nextGW = data.events.find((gw: any) => gw.is_next);

      if (!nextGW) {
        return null;
      }

      const deadlineTime = new Date(nextGW.deadline_time);
      const now = new Date();
      const hoursUntilDeadline = (deadlineTime.getTime() - now.getTime()) / (1000 * 60 * 60);

      return {
        gameweek: nextGW.id,
        deadline: nextGW.deadline_time,
        hoursUntilDeadline: Math.round(hoursUntilDeadline * 10) / 10, // Round to 1 decimal
      };
    } catch (error) {
      console.error("Failed to fetch gameweek deadline:", error);
      return null;
    }
  },
});
