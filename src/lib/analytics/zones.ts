import {
  CORNER_THREE_ARC_BREAK_OFFSET,
  CORNER_THREE_Y,
  RESTRICTED_AREA_RADIUS,
  type CourtPoint,
  depthFromRim,
  distanceFromRim,
  isThreePointAttempt,
} from "./court";

/**
 * The court zones the dashboard aggregates over.
 *
 * These are distance bands rather than pixel-level bins, and that is a
 * deliberate tradeoff. Hex-binning the raw coordinates looks better, but once a
 * user filters to one player and one context the median hex holds roughly ten
 * attempts — far too few to estimate a shooting percentage from. Zones keep
 * every cell interpretable under realistic filter states, so the court map sizes
 * hexes by volume (a count, which is honest at any n) and colors them by the
 * efficiency of the zone they fall in. See README for the numbers behind this.
 *
 * Left/right is tracked separately as `CourtSide` so that side is orthogonal to
 * zone instead of doubling the number of zones.
 */
export type CourtZone =
  | "restricted_area"
  | "close_range"
  | "midrange_short"
  | "midrange_long"
  | "corner_3"
  | "wing_3"
  | "above_break_3";

export const COURT_ZONES: readonly CourtZone[] = [
  "restricted_area",
  "close_range",
  "midrange_short",
  "midrange_long",
  "corner_3",
  "wing_3",
  "above_break_3",
] as const;

/** Human-readable zone labels for axes, legends, and tooltips. */
export const COURT_ZONE_LABELS: Record<CourtZone, string> = {
  restricted_area: "Restricted area",
  close_range: "Close range (4–10 ft)",
  midrange_short: "Mid-range (10–16 ft)",
  midrange_long: "Mid-range (16+ ft)",
  corner_3: "Corner 3",
  wing_3: "Wing 3",
  above_break_3: "Above the break 3",
} as const;

/** Upper bound (exclusive) of each two-point distance band, in feet. */
const CLOSE_RANGE_MAX_DISTANCE = 10;
const MIDRANGE_SHORT_MAX_DISTANCE = 16;

/**
 * Angle off the straight-on axis that separates an above-the-break three from a
 * wing three, in degrees. Unlike the corner break this is a convention, not a
 * painted line: the arc is continuous, and different shot charts cut it in
 * different places. 30° splits this dataset into three buckets that all hold
 * enough attempts to read.
 */
const WING_ANGLE_THRESHOLD_DEGREES = 30;

/**
 * Half-width of the band around the midline treated as neither left nor right.
 * Keeps straight-on attempts from being assigned a side by coordinate noise.
 */
const CENTER_BAND_HALF_WIDTH = 2;

export type CourtSide = "left" | "center" | "right";

/**
 * Angle of a shot relative to straight-on, in degrees, measured at the rim.
 * 0° points from the rim toward half court; ±90° points along the baseline.
 * Sign follows y, so it carries the same left/right meaning as `classifySide`.
 */
export function angleFromRim(point: CourtPoint): number {
  return (Math.atan2(point.y, depthFromRim(point)) * 180) / Math.PI;
}

/**
 * Which side of the floor a shot came from.
 *
 * ASSUMPTION: y < 0 is treated as the offense's left. The data dictionary fixes
 * the axes but not which sideline is which, and the shot-type labels
 * (`postLeft`, `catchAndShootOnMoveLeft`) describe body mechanics rather than
 * court side, so they cannot settle it either. Nothing downstream depends on
 * getting this right — the two sides are simply swapped if the provider's
 * convention is the opposite, which is a one-line change here.
 */
export function classifySide(point: CourtPoint): CourtSide {
  if (Math.abs(point.y) <= CENTER_BAND_HALF_WIDTH) return "center";
  return point.y < 0 ? "left" : "right";
}

/** Assign a shot to exactly one court zone. */
export function classifyZone(point: CourtPoint): CourtZone {
  if (isThreePointAttempt(point)) return classifyThreeZone(point);

  const distance = distanceFromRim(point);
  if (distance < RESTRICTED_AREA_RADIUS) return "restricted_area";
  if (distance < CLOSE_RANGE_MAX_DISTANCE) return "close_range";
  if (distance < MIDRANGE_SHORT_MAX_DISTANCE) return "midrange_short";
  return "midrange_long";
}

function classifyThreeZone(point: CourtPoint): CourtZone {
  // The corner is defined by the painted geometry: closer to the baseline than
  // the point where the straight line meets the arc.
  if (
    depthFromRim(point) <= CORNER_THREE_ARC_BREAK_OFFSET &&
    Math.abs(point.y) >= CORNER_THREE_Y
  ) {
    return "corner_3";
  }
  return Math.abs(angleFromRim(point)) >= WING_ANGLE_THRESHOLD_DEGREES
    ? "wing_3"
    : "above_break_3";
}

/** Whether a zone is behind the arc. Useful for grouping and for axis labels. */
export function isThreePointZone(zone: CourtZone): boolean {
  return zone === "corner_3" || zone === "wing_3" || zone === "above_break_3";
}
