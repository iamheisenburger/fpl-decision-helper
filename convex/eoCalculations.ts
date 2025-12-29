/**
 * EO Calculation Utilities
 * Continuous sigmoid-based scaling for near-rank ownership and captain EO
 *
 * Eliminates cliff effects from discrete tiers by using smooth mathematical functions.
 */

/**
 * Calculate base captain probability using sigmoid function
 * Provides smooth, continuous scaling without discrete tier cliff effects
 *
 * Calibrated against GW14 real-world data:
 * - Haaland 74.2% ownership → ~180% captain EO (needs ~87% captain prob)
 * - Cunha 10.8% ownership → ~12-15% captain EO (needs ~40-45% captain prob)
 *
 * @param ownership - Overall ownership percentage (0-100)
 * @returns Base captain probability percentage (20-92%)
 */
function calculateBaseCaptainProbability(ownership: number): number {
  const floor = 20;        // Minimum 20% - even differentials get some captaincy
  const ceiling = 92;      // Maximum 92% - even templates aren't 100% captained
  const range = ceiling - floor;
  const midpoint = 35;     // Ownership where prob = ~56%
  const steepness = 20;    // Wider curve for smoother transitions

  const sigmoid = 1 / (1 + Math.exp(-(ownership - midpoint) / steepness));
  return floor + range * sigmoid;
}

/**
 * Calculate fixture multiplier with ownership attenuation
 * Template players are captained regardless of fixture difficulty
 *
 * @param fixtureDifficulty - 1-5 (1=hardest, 5=easiest)
 * @param ownership - Overall ownership percentage
 * @returns Multiplier (0.75 to 1.25, attenuated by ownership)
 */
function calculateFixtureMultiplier(fixtureDifficulty: number, ownership: number): number {
  // Base: 0.75 (hardest, difficulty=1) to 1.25 (easiest, difficulty=5)
  const baseMultiplier = 0.75 + (fixtureDifficulty - 1) * 0.125;

  // High ownership = ignore fixture impact (template players captained regardless)
  // At 60%+ ownership, attenuation reduces fixture impact by 80%
  const attenuation = Math.min(1, ownership / 60) * 0.8;

  // Blend towards 1.0 based on attenuation
  return 1 - (1 - baseMultiplier) * (1 - attenuation);
}

/**
 * Calculate captain probability with continuous scaling
 * Combines sigmoid base rate with attenuated fixture adjustment
 *
 * @param ownership - Overall ownership percentage (0-100)
 * @param fixtureDifficulty - Fixture difficulty (1-5, where 5 is easiest)
 * @returns Captain probability percentage (0-100)
 */
export function calculateCaptainProbability(
  ownership: number,
  fixtureDifficulty: number
): number {
  const baseProbability = calculateBaseCaptainProbability(ownership);
  const fixtureMultiplier = calculateFixtureMultiplier(fixtureDifficulty, ownership);

  // Apply fixture multiplier and clamp to 0-100
  const probability = baseProbability * fixtureMultiplier;
  return Math.max(0, Math.min(100, probability));
}

/**
 * Calculate near-rank multiplier with smooth transitions and ownership boost
 * Elite managers have different ownership patterns than overall base
 * High-ownership players are more concentrated at top ranks (template boost)
 *
 * @param rank - Current FPL rank
 * @param ownership - Overall ownership percentage (for template boost)
 * @returns Near-rank multiplier (1.10 to 1.53)
 */
export function calculateNearRankMultiplier(rank: number, ownership: number = 0): number {
  let baseMultiplier: number;

  if (rank <= 10000) {
    // Top 10K: elite managers
    baseMultiplier = 1.45;
  } else if (rank <= 100000) {
    // Top 100K: smooth transition 1.45 → 1.37
    const progress = (rank - 10000) / 90000;
    baseMultiplier = 1.45 - 0.08 * progress;
  } else if (rank <= 500000) {
    // Top 500K: smooth transition 1.37 → 1.32
    const progress = (rank - 100000) / 400000;
    baseMultiplier = 1.37 - 0.05 * progress;
  } else if (rank <= 1000000) {
    // Top 1M: smooth transition 1.32 → 1.20
    const progress = (rank - 500000) / 500000;
    baseMultiplier = 1.32 - 0.12 * progress;
  } else {
    // Outside top 1M
    baseMultiplier = 1.10;
  }

  // Template boost: high-ownership players more concentrated at top ranks
  // Ownership 40-100% gets 0-8% boost
  const templateBoost = Math.max(0, (ownership - 40) / 60) * 0.08;

  return baseMultiplier + templateBoost;
}

/**
 * Calculate what percentage rank represents (e.g., Top 4.44%)
 * Total active managers: ~10.8M
 */
export function calculateRankPercentage(rank: number): number {
  const totalManagers = 10800000;
  return (rank / totalManagers) * 100;
}

/**
 * Calculate final captain EO using continuous three-step process
 * @param ownership - Overall ownership percentage (0-100)
 * @param rank - Current FPL rank
 * @param fixtureDifficulty - Fixture difficulty (1-5, where 5 is easiest)
 * @returns Captain EO percentage (can exceed 100% due to captaincy doubling)
 *
 * Calibrated against GW14 real-world data (at rank ~350K):
 * - Haaland (74.2%, fixture 5/5) → ~180% captain EO
 * - Bruno (18%, fixture 5/5) → ~25-28% captain EO
 * - Cunha (10.8%, fixture 5/5) → ~12-14% captain EO
 */
export function calculateCaptainEO(
  ownership: number,
  rank: number,
  fixtureDifficulty: number
): number {
  // Step 1: Near-rank ownership with template boost
  const multiplier = calculateNearRankMultiplier(rank, ownership);
  const nearRankOwnership = ownership * multiplier;

  // Step 2: Captain probability (as decimal) - continuous sigmoid
  const captainProb = calculateCaptainProbability(ownership, fixtureDifficulty) / 100;

  // Step 3: Captain EO = near_rank_ownership × captain_probability × 2
  const captainEO = nearRankOwnership * captainProb * 2;

  return captainEO;
}

/**
 * Calculate near-rank EO for XI optimization (no captaincy multiplier)
 * @param ownership - Overall ownership percentage (0-100)
 * @param rank - Current FPL rank
 * @returns Near-rank EO percentage
 */
export function calculateNearRankEO(ownership: number, rank: number): number {
  const multiplier = calculateNearRankMultiplier(rank, ownership);
  return ownership * multiplier;
}
