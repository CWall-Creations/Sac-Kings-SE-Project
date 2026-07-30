import { BASELINE_X, RIM, SIDELINE_Y } from "@/lib/analytics/court";

/**
 * Projection from court feet to SVG user units.
 *
 * The court map is drawn with the basket at the bottom and half court at the top,
 * which is the orientation every shot chart uses. The SVG viewBox is expressed in
 * feet, so every marking and every shot position is placed with real dimensions
 * and no magic pixel numbers; sizing to the container is left to CSS.
 *
 * The far edge crops well short of half court. The offensive half is 47 ft deep,
 * but attempts past ~40 ft from the baseline are heaves, and including the empty
 * remainder would shrink everything that matters to make room for nothing.
 */

/** Distance from the baseline to the top of the drawn area, in feet. */
const VIEW_DEPTH_FEET = 40;

/** Court x-coordinate at the top edge of the drawn area. */
export const FAR_X = BASELINE_X + VIEW_DEPTH_FEET;

/** Court dimensions of the drawn area, in feet. */
export const VIEW_WIDTH = SIDELINE_Y * 2;
export const VIEW_HEIGHT = VIEW_DEPTH_FEET;

/**
 * Slack around the court inside the viewBox.
 *
 * Without it, marks on the boundary are sliced in half by the edge of the SVG:
 * corner-three shooters stand within a foot of the sideline, so a hex centred
 * there extends past it. The bottom needs more room than the sides because a
 * handful of attempts are released from behind the baseline (the deepest is at
 * x = -49.5, two and a half feet out).
 */
const PADDING = 2;
const PADDING_BOTTOM = 4;

export const VIEW_BOX = [
  -PADDING,
  -PADDING,
  VIEW_WIDTH + PADDING * 2,
  VIEW_HEIGHT + PADDING + PADDING_BOTTOM,
].join(" ");

/**
 * Court y (sideline to sideline) to SVG x.
 * Court y increases to the right of the drawn court.
 */
export function toSvgX(courtY: number): number {
  return courtY + SIDELINE_Y;
}

/**
 * Court x (baseline to baseline) to SVG y.
 * The baseline lands at the bottom edge; half court is off the top.
 */
export function toSvgY(courtX: number): number {
  return FAR_X - courtX;
}

/** The rim, in SVG units. Most markings are positioned relative to it. */
export const RIM_SVG = {
  x: toSvgX(RIM.y),
  y: toSvgY(RIM.x),
} as const;

/**
 * Whether a court position falls inside the drawn area.
 *
 * Shots released from behind the baseline are kept — there are a few, and there
 * is room for them. What this excludes is attempts from beyond `FAR_X`: the 17
 * heaves and 8 backcourt releases, which would either stretch the view to fit a
 * rounding error's worth of attempts or be drawn on top of the arc.
 */
export function isWithinView(point: { x: number; y: number }): boolean {
  return (
    point.x <= FAR_X &&
    point.x >= BASELINE_X - PADDING_BOTTOM &&
    Math.abs(point.y) <= SIDELINE_Y + PADDING
  );
}
