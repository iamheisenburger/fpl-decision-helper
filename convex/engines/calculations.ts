/**
 * Core calculation functions for FPL Decision Helper
 * All formulas implement the exact specifications from the requirements
 */

/**
 * Calculate P90 (probability of hitting EV95 ceiling) based on xMins
 * @param xMins - Expected minutes
 * @returns P90 value (0.0 to 1.0)
 *
 * Granular thresholds:
 * - xMins >= 95: P90 = 1.0 (plays full match including AET)
 * - xMins 90-94: P90 = 0.9
 * - xMins 88-89: P90 = 0.85
 * - xMins 86-87: P90 = 0.75
 * - xMins 84-85: P90 = 0.65
 * - xMins 82-83: P90 = 0.55
 * - xMins 80-81: P90 = 0.45
 * - xMins 75-79: P90 = 0.30
 * - xMins 70-74: P90 = 0.15
 * - xMins < 70: P90 = 0.0 (unreliable minutes)
 */
export function calculateP90(xMins: number): number {
  if (xMins >= 95) return 1.0;
  if (xMins >= 90) return 0.9;
  if (xMins >= 88) return 0.85;
  if (xMins >= 86) return 0.75;
  if (xMins >= 84) return 0.65;
  if (xMins >= 82) return 0.55;
  if (xMins >= 80) return 0.45;
  if (xMins >= 75) return 0.30;
  if (xMins >= 70) return 0.15;
  return 0.0;
}

/**
 * Calculate variance penalty based on minutes uncertainty
 * @param xMins - Expected minutes
 * @returns Variance penalty in EV units
 *
 * Formula: (95 - xMins) / 100
 *
 * Rationale: Players further from 95 xMins have higher outcome variance.
 * Even if they're likely to hit their xMins projection, there's uncertainty
 * about whether they'll actually achieve it (sub risk, rotation, etc.)
 */
export function calculateVariancePenalty(xMins: number): number {
  return (95 - xMins) / 100;
}

/**
 * Calculate Total Score for captaincy decisions
 * @param player - Player with EV, EV95, xMins, EO
 * @param eoRate - EV per 10% EO (default: 0.1 for captaincy)
 * @returns Total score (EV + ceiling bonus + EO shield - variance penalty)
 *
 * Formula: EV + (EV95 - EV) × P90 + (EO/10 × eoRate) - variancePenalty
 * P90 already weights ceiling probability, EO shield rewards ownership, variance penalty accounts for xMins uncertainty
 */
export function calculateTotalScore(
  player: {
    ev: number;
    ev95: number;
    xMins: number;
    eo: number;
  },
  eoRate: number = 0.1
): number {
  const p90 = calculateP90(player.xMins);
  const ceilingBonus = (player.ev95 - player.ev) * p90;
  const eoShield = (player.eo / 10) * eoRate;
  const variancePenalty = calculateVariancePenalty(player.xMins);
  return player.ev + ceilingBonus + eoShield - variancePenalty;
}

/**
 * Calculate Risk-Adjusted EV (RAEV) for a player in XI selection
 * @param player - Player with EV, EV95, xMins, EO
 * @param settings - User settings for EO rate
 * @returns RAEV value
 *
 * Formula: EV + (EV95 - EV) × P90 + (EO/15 × eoRate) - variancePenalty
 * P90 already weights ceiling probability, EO shield rewards ownership, variance penalty accounts for xMins uncertainty
 */
export function calculateRAEV(
  player: {
    ev: number;
    ev95: number;
    xMins: number;
    eo: number;
  },
  settings: {
    xiEoRate: number;
  }
): number {
  const p90 = calculateP90(player.xMins);

  // Ceiling bonus: reward EV95 upside weighted by P90
  const ceilingBonus = (player.ev95 - player.ev) * p90;

  // EO shield: 0.1 EV per 15% EO (applied to ALL players proportionally)
  const eoShield = (player.eo / 15) * settings.xiEoRate;

  // Variance penalty: uncertainty increases as player strays from 95 xMins
  const variancePenalty = calculateVariancePenalty(player.xMins);

  return player.ev + ceilingBonus + eoShield - variancePenalty;
}

/**
 * Calculate adjusted EV for transfer analysis
 * @param player - Player with EV, EV95, xMins
 * @param templateEv95P90 - Template benchmark for rMins comparison
 * @param settings - User settings for rMins weight
 * @returns Adjusted EV
 *
 * Formula:
 * AdjEV = EV + 0.5 × max(0, EV95×P90_player - EV95×P90_template)
 * This rewards players with higher upside potential
 */
export function calculateAdjustedEV(
  player: {
    ev: number;
    ev95: number;
    xMins: number;
  },
  templateEv95P90: number,
  rminsWeight: number = 0.5
): number {
  const playerUpside = player.ev95 * calculateP90(player.xMins);
  const upsideBonus = rminsWeight * Math.max(0, playerUpside - templateEv95P90);
  return player.ev + upsideBonus;
}

/**
 * Calculate EO tax for dropping a high-EO template player
 * @param templateEo - EO of the template player being dropped
 * @param candidateEo - EO of the candidate player coming in
 * @param eoRate - EO exchange rate (0.1 EV per 15% for transfers)
 * @param cap - Maximum EO tax cap (1.0 EV)
 * @returns EO tax in EV units
 *
 * Formula: max(0, (EO_template - EO_candidate)) × (0.1 EV per 15% EO) × cap
 */
export function calculateEOTax(
  templateEo: number,
  candidateEo: number,
  eoRate: number = 0.1,
  cap: number = 1.0
): number {
  const eoGap = Math.max(0, templateEo - candidateEo);
  const tax = (eoGap / 15) * eoRate;
  return Math.min(cap, tax);
}
