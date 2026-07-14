import { cronJobs } from "convex/server";

const crons = cronJobs();

// The retained dashboard, captain, and XI pages are manual calculators. They
// do not consume the historical player/prediction corpus, so the former daily
// syncs and 10k-row weekly prediction generation were pure background cost.

export default crons;
