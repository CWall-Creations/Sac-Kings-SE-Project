/**
 * Court geometry, in feet, for the coordinate system described in the data dictionary:
 *
 *   - Origin (0, 0) is center court.
 *   - The x-axis runs baseline-to-baseline; the y-axis runs sideline-to-sideline.
 *   - Negative x is always the offense's half, so nearly every shot has x < 0
 *     and the only basket we care about is the one at negative x.
 *
 * The data dictionary marks the baseline at x = -47, but the rim is not on the
 * baseline: it sits 5.25 ft inside it. Using x = -47 as the hoop would inflate
 * every shot distance by more than five feet and misclassify whole zones, so the
 * rim is derived explicitly below. (Sanity check against the dataset: the median
 * layup lands at x = -40.4, y = -0.2, which is right on top of RIM.)
 */

/** Half the court's length; the offense's baseline. */
export const BASELINE_X = -47;

/** Half the court's width; |y| beyond this is out of bounds. */
export const SIDELINE_Y = 25;

/** Distance from the baseline to the center of the rim. */
export const RIM_INSET_FROM_BASELINE = 5.25;

/** Center of the rim the offense is attacking. */
export const RIM = {
  x: BASELINE_X + RIM_INSET_FROM_BASELINE, // -41.75
  y: 0,
} as const;

/** Radius of the three-point arc, measured from the center of the rim. */
export const THREE_POINT_ARC_RADIUS = 23.75;

/**
 * The corner three is a straight line parallel to the sideline rather than part
 * of the arc, so it sits closer to the rim than the arc does.
 */
export const CORNER_THREE_Y = 22;

/**
 * Where the corner's straight line meets the arc, as an offset from the rim
 * toward half court. Anything closer to the baseline than this is "in the
 * corner" and is judged against CORNER_THREE_Y instead of the arc radius.
 *
 * Derived rather than hard-coded so the two constants above can never drift out
 * of sync with it: sqrt(23.75^2 - 22^2) ≈ 8.948.
 */
export const CORNER_THREE_ARC_BREAK_OFFSET = Math.sqrt(
  THREE_POINT_ARC_RADIUS ** 2 - CORNER_THREE_Y ** 2,
);

/** Radius of the restricted-area arc under the basket. */
export const RESTRICTED_AREA_RADIUS = 4;

/** Half-width of the painted lane. */
export const LANE_HALF_WIDTH = 8;

/** Distance from the baseline to the free-throw line. */
export const FREE_THROW_LINE_X = BASELINE_X + 19;

/** Radius of the free-throw circle, centered on the free-throw line. */
export const FREE_THROW_CIRCLE_RADIUS = 6;

/** A point on the floor. The only shape the geometry helpers need. */
export interface CourtPoint {
  x: number;
  y: number;
}

/** Straight-line distance from the center of the rim, in feet. */
export function distanceFromRim(point: CourtPoint): number {
  return Math.hypot(point.x - RIM.x, point.y - RIM.y);
}

/**
 * Signed distance from the rim toward half court. Positive means "further from
 * the baseline than the rim", which is where all but a handful of shots live.
 */
export function depthFromRim(point: CourtPoint): number {
  return point.x - RIM.x;
}

/**
 * Whether a shot is behind the three-point line.
 *
 * Boundary cases resolve as makes-it-a-three, matching the rule that the line
 * itself belongs to the two-point area only if the shooter is *inside* it. In
 * practice tracking coordinates land exactly on the line about never, so this
 * choice is about test determinism rather than real attempts.
 */
export function isThreePointAttempt(point: CourtPoint): boolean {
  const inCorner = depthFromRim(point) <= CORNER_THREE_ARC_BREAK_OFFSET;
  return inCorner
    ? Math.abs(point.y) >= CORNER_THREE_Y
    : distanceFromRim(point) >= THREE_POINT_ARC_RADIUS;
}

/** Points a shot is worth if it goes in. */
export function shotValue(point: CourtPoint): 2 | 3 {
  return isThreePointAttempt(point) ? 3 : 2;
}

/**
 * True for shots released in the backcourt (the offense's own half is negative
 * x, so positive x means the shooter was past half court). There are 8 such
 * attempts in the dataset and all are desperation heaves.
 */
export function isBackcourtShot(point: CourtPoint): boolean {
  return point.x > 0;
}
