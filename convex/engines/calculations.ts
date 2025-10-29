/**
 * Core calculation functions for FPL Decision Helper
 * All formulas implement the exact specifications from the requirements
 */

/**
 * Calculate P90 (probability of 90+ minutes) based on xMins
 * @param xMins - Expected minutes
 * @returns P90 value (0.0 to 1.0)
 *
 * Formula:
 * - xMins >= 88: P90 = 1.0
 * - xMins 85-87: P90 = 0.8
 * - xMins 81-84: P90 = 0.5
 * - xMins < 81: P90 = 0.0
 */
export function calculateP90(xMins: number): number {
  if (xMins >= 88) return 1.0;
  if (xMins >= 85) return 0.8;
  if (xMins >= 81) return 0.5;
  return 0.0;
}

/**
 * Calculate EO tolerance based on EO gap
 * @param eoGap - Expected Ownership gap (percentage points)
 * @param rate - EV per unit EO (e.g., 0.1 EV per 10% for captaincy)
 * @param cap - Maximum tolerance cap (e.g., 1.0 EV)
 * @returns Tolerance in EV units
 *
 * Captaincy: 0.1 EV per 10% EO gap, capped at 1.0 EV
 * XI: 0.1 EV per 15% EO gap, capped at 1.0 EV
 */
export function calculateTolerance(
  eoGap: number,
  rate: number,
  cap: number
): number {
  const tolerance = (eoGap / 10) * rate;
  return Math.min(cap, tolerance);
}

/**
 * Calculate Total Score for captaincy decisions
 * @param player - Player with EV, EV95, xMins
 * @returns Total score (EV + ceiling bonus)
 *
 * Formula: EV + (EV95 - EV) × P90 × 0.5
 * P90 naturally controls probability based on xMins confidence
 */
export function calculateTotalScore(player: {
  ev: number;
  ev95: number;
  xMins: number;
}): number {
  const p90 = calculateP90(player.xMins);
  const ceilingBonus = (player.ev95 - player.ev) * p90 * 0.5;
  return player.ev + ceilingBonus;
}

/**
 * Calculate xMins penalty if player has risky minutes
 * @param xMins - Expected minutes
 * @param threshold - Minimum safe minutes threshold (default: 70)
 * @param penalty - Penalty amount in EV (default: 0.3)
 * @returns Penalty in EV units (0 if above threshold)
 */
export function calculateXMinsPenalty(
  xMins: number,
  threshold: number = 70,
  penalty: number = 0.3
): number {
  return xMins < threshold ? penalty : 0;
}

/**
 * Calculate Risk-Adjusted EV (RAEV) for a player in XI selection
 * @param player - Player with EV, EV95, xMins, EO
 * @param templateEo - Template/benchmark EO for comparison
 * @param templateEv95P90 - Template/benchmark EV95×P90 for comparison
 * @param settings - User settings for EO rate, cap, and rMins weight
 * @returns RAEV value
 *
 * Formula:
 * RAEV = EV
 *        - rMins_surcharge (if player has less upside than template)
 *        + EO_shield_bonus (if player has higher EO than template)
 */
export function calculateRAEV(
  player: {
    ev: number;
    ev95: number;
    xMins: number;
    eo: number;
  },
  templateEo: number,
  templateEv95P90: number,
  settings: {
    xiEoRate: number;
    xiEoCap: number;
  }
): number {
  let raev = player.ev;

  // rMins surcharge: penalize if player has less upside than template
  // P90 naturally controls probability based on xMins confidence
  const playerUpside = player.ev95 * calculateP90(player.xMins);
  const rMinsSurcharge = 0.5 * Math.max(0, templateEv95P90 - playerUpside);
  raev -= rMinsSurcharge;

  // EO shield bonus: 0.1 EV per 15% EO (applied to ALL players proportionally)
  const shieldBonus = Math.min(
    settings.xiEoCap,
    (player.eo / 15) * settings.xiEoRate
  );
  raev += shieldBonus;

  return raev;
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
