/**
 * Number formatting for labels, tables, and tooltips.
 *
 * Centralised so the same quantity never appears with two precisions in two
 * places, which is the fastest way to make a dashboard look untrustworthy.
 */

/** Points per shot, e.g. "1.04". Two decimals: hundredths are the unit of a real difference. */
export function formatPointsPerShot(value: number): string {
  return value.toFixed(2);
}

/** A signed difference, e.g. "+0.13" / "-0.11". The sign is the point. */
export function formatSigned(value: number, decimals = 2): string {
  // Guard against "-0.00", which reads as a real negative.
  const rounded = Number(value.toFixed(decimals));
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return `${sign}${Math.abs(rounded).toFixed(decimals)}`;
}

/** A shooting percentage, e.g. "44.6%". */
export function formatPercent(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * A basketball percentage written the way box scores write it, e.g. ".446".
 * Used for FG%/eFG% columns where the leading zero is noise.
 */
export function formatShootingPct(value: number): string {
  return value.toFixed(3).replace(/^0/, "");
}

/** A whole number of attempts, thousands-separated. */
export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

/** A signed whole number of points, e.g. "+135". */
export function formatSignedPoints(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return `${sign}${Math.abs(rounded)}`;
}

/** Feet, e.g. "23.8 ft". */
export function formatFeet(value: number): string {
  return `${value.toFixed(1)} ft`;
}
