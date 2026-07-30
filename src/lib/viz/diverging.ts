/**
 * The diverging colour scale, as CSS custom-property names.
 *
 * Returning a `var(--…)` reference rather than a hex is deliberate: the browser
 * resolves it per theme, so the same mark is correct in light and dark without
 * any JavaScript knowing which theme is active. It also keeps every colour value
 * in one stylesheet instead of split across CSS and TS.
 *
 * Seven classes — three steps each side of a neutral middle. Discrete rather than
 * continuous because adjacent classes stop being distinguishable past about seven,
 * and because a class boundary makes "is this meaningfully different?" a visible
 * question rather than a judgment the reader has to make from a gradient.
 */

/** Class boundaries, in points per shot, for the absolute difference. */
const CLASS_BREAKS = [0.05, 0.15, 0.3] as const;

export type DivergingClass =
  | "below-3"
  | "below-2"
  | "below-1"
  | "0"
  | "above-1"
  | "above-2"
  | "above-3";

/**
 * Bucket a points-per-shot difference into a colour class.
 *
 * The innermost break matches `MATERIAL_POINTS_PER_SHOT_GAP`, so anything the
 * analytics layer treats as "around average" also *looks* neutral. Keeping the two
 * in step matters: a zone described as average in the table but tinted red on the
 * map would undermine both.
 */
export function divergingClass(difference: number): DivergingClass {
  const magnitude = Math.abs(difference);
  const direction = difference < 0 ? "below" : "above";

  if (magnitude < CLASS_BREAKS[0]) return "0";
  if (magnitude < CLASS_BREAKS[1]) return `${direction}-1` as DivergingClass;
  if (magnitude < CLASS_BREAKS[2]) return `${direction}-2` as DivergingClass;
  return `${direction}-3` as DivergingClass;
}

/** CSS colour reference for a diverging class. */
export function divergingColor(className: DivergingClass): string {
  return `var(--diverge-${className})`;
}

/** Colour for a difference, in one step. */
export function colorForDifference(difference: number): string {
  return divergingColor(divergingClass(difference));
}

/**
 * The scale's classes from most-below to most-above, for building a legend.
 * A legend is not optional here: colour is the only channel carrying efficiency.
 */
export const DIVERGING_LEGEND: ReadonlyArray<{
  className: DivergingClass;
  /** Inclusive lower bound of the class, or null for the open-ended end. */
  from: number | null;
  to: number | null;
}> = [
  { className: "below-3", from: null, to: -CLASS_BREAKS[2] },
  { className: "below-2", from: -CLASS_BREAKS[2], to: -CLASS_BREAKS[1] },
  { className: "below-1", from: -CLASS_BREAKS[1], to: -CLASS_BREAKS[0] },
  { className: "0", from: -CLASS_BREAKS[0], to: CLASS_BREAKS[0] },
  { className: "above-1", from: CLASS_BREAKS[0], to: CLASS_BREAKS[1] },
  { className: "above-2", from: CLASS_BREAKS[1], to: CLASS_BREAKS[2] },
  { className: "above-3", from: CLASS_BREAKS[2], to: null },
];
