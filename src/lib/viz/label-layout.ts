/**
 * Vertical label spreading for directly-labelled scatter points.
 *
 * Needed because direct labels are not optional on this chart: with twelve
 * entities, colour cannot carry identity (a scatter is an all-pairs form, where
 * any two marks can end up adjacent, and no palette keeps twelve hues apart under
 * colour-vision deficiency). So every point wears its name — and six of these
 * players sit within 0.054 points per shot of each other, which at any sensible
 * plot height overlaps.
 *
 * The result is paired with a leader line from each mark to its label, so moving a
 * label never breaks the association with its point.
 */

export interface SpreadResult {
  /** Adjusted position, in the same order as the input. */
  positions: number[];
  /** True if anything had to move, i.e. leader lines are needed. */
  adjusted: boolean;
}

/**
 * Push labels apart so consecutive positions are at least `minGap` apart, staying
 * within `[min, max]`.
 *
 * Sweeps downward first, then, if the block overflows the bottom, sweeps back up
 * from the lower bound. Two passes is enough for the label counts this chart deals
 * with and keeps the result deterministic, which matters for tests and for a
 * chart that should not reshuffle itself between renders.
 */
export function spreadVertically(
  desired: readonly number[],
  minGap: number,
  bounds: { min: number; max: number },
): SpreadResult {
  if (desired.length === 0) return { positions: [], adjusted: false };

  // Work in ascending order, remembering where each value came from.
  const order = desired
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);

  const placed = new Array<number>(desired.length);

  // Downward pass: never place a label above its predecessor's minimum gap.
  let previous = Number.NEGATIVE_INFINITY;
  for (const item of order) {
    const position = Math.max(item.value, previous + minGap, bounds.min);
    placed[item.index] = position;
    previous = position;
  }

  // If that pushed the last label past the bottom, compress upward instead.
  if (previous > bounds.max) {
    let next = bounds.max + minGap;
    for (let i = order.length - 1; i >= 0; i -= 1) {
      const item = order[i];
      const position = Math.min(placed[item.index], next - minGap);
      placed[item.index] = position;
      next = position;
    }
  }

  const adjusted = placed.some(
    (position, index) => Math.abs(position - desired[index]) > 0.01,
  );

  return { positions: placed, adjusted };
}
