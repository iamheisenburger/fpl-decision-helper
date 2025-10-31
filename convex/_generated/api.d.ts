/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as appearances from "../appearances.js";
import type * as context from "../context.js";
import type * as crons from "../crons.js";
import type * as dataIngestion from "../dataIngestion.js";
import type * as depth from "../depth.js";
import type * as depthCharts from "../depthCharts.js";
import type * as engines_calculations from "../engines/calculations.js";
import type * as engines_captaincy from "../engines/captaincy.js";
import type * as engines_mlPredictor from "../engines/mlPredictor.js";
import type * as engines_multiWeekPredictor from "../engines/multiWeekPredictor.js";
import type * as engines_xMinsHeuristic from "../engines/xMinsHeuristic.js";
import type * as engines_xiOptimizer from "../engines/xiOptimizer.js";
import type * as fixtures from "../fixtures.js";
import type * as gameweekInputs from "../gameweekInputs.js";
import type * as overrides from "../overrides.js";
import type * as players from "../players.js";
import type * as scheduledActions from "../scheduledActions.js";
import type * as syncLogs from "../syncLogs.js";
import type * as userSettings from "../userSettings.js";
import type * as userSquad from "../userSquad.js";
import type * as utils_gameweekDetection from "../utils/gameweekDetection.js";
import type * as utils_injuryIntelligence from "../utils/injuryIntelligence.js";
import type * as xmins from "../xmins.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  appearances: typeof appearances;
  context: typeof context;
  crons: typeof crons;
  dataIngestion: typeof dataIngestion;
  depth: typeof depth;
  depthCharts: typeof depthCharts;
  "engines/calculations": typeof engines_calculations;
  "engines/captaincy": typeof engines_captaincy;
  "engines/mlPredictor": typeof engines_mlPredictor;
  "engines/multiWeekPredictor": typeof engines_multiWeekPredictor;
  "engines/xMinsHeuristic": typeof engines_xMinsHeuristic;
  "engines/xiOptimizer": typeof engines_xiOptimizer;
  fixtures: typeof fixtures;
  gameweekInputs: typeof gameweekInputs;
  overrides: typeof overrides;
  players: typeof players;
  scheduledActions: typeof scheduledActions;
  syncLogs: typeof syncLogs;
  userSettings: typeof userSettings;
  userSquad: typeof userSquad;
  "utils/gameweekDetection": typeof utils_gameweekDetection;
  "utils/injuryIntelligence": typeof utils_injuryIntelligence;
  xmins: typeof xmins;
}>;
declare const fullApiWithMounts: typeof fullApi;

export declare const api: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, "internal">
>;

export declare const components: {};
