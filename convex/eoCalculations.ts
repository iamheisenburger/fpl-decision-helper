/**
 * EO Calculation Utilities
 * Three-step dynamic calculation for near-rank ownership and captain EO
 */

/**
 * Step 1: Calculate near-rank multiplier based on current rank
 * Elite managers have different ownership patterns than overall base
 */
export function calculateNearRankMultiplier(rank: number): number {
  if (rank <= 10000) return 1.35;     // Top 0.09%
  if (rank <= 100000) return 1.3;     // Top 0.93%
  if (rank <= 500000) return 1.25;    // Top 4.63%
  if (rank <= 1000000) return 1.15;   // Top 9.26%
  return 1.1;                          // Everyone else
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
 * Step 2: Calculate captain probability based on ownership tier and fixture difficulty
 */
export function calculateCaptainProbability(
  ownership: number,
  fixtureDifficulty: number
): number {
  // Base rates by ownership tier
  let baseRate: number;
  if (ownership >= 70) {
    baseRate = 80; // Template players
  } else if (ownership >= 40) {
    baseRate = 50; // Popular options
  } else {
    baseRate = 20; // Differentials
  }

  // Fixture difficulty adjustments (1=hardest, 5=easiest)
  let adjustment: number;
  switch (fixtureDifficulty) {
    case 5:
      adjustment = 10;
      break;
    case 4:
      adjustment = 5;
      break;
    case 3:
      adjustment = 0;
      break;
    case 2:
      adjustment = -10;
      break;
    case 1:
      adjustment = -20;
      break;
    default:
      adjustment = 0;
  }

  // Apply adjustment and clamp to 0-100
  const probability = baseRate + adjustment;
  return Math.max(0, Math.min(100, probability));
}

/**
 * Step 3: Calculate final captain EO using three-step process
 * @param ownership - Overall ownership percentage (0-100)
 * @param rank - Current FPL rank
 * @param fixtureDifficulty - Fixture difficulty (1-5, where 5 is easiest)
 * @returns Captain EO percentage (can exceed 100% due to captaincy doubling)
 */
export function calculateCaptainEO(
  ownership: number,
  rank: number,
  fixtureDifficulty: number
): number {
  // Step 1: Near-rank ownership
  const multiplier = calculateNearRankMultiplier(rank);
  const nearRankOwnership = ownership * multiplier;

  // Step 2: Captain probability (as decimal)
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
  const multiplier = calculateNearRankMultiplier(rank);
  return ownership * multiplier;
}
