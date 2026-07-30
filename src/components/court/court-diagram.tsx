import {
  BASELINE_X,
  CORNER_THREE_ARC_BREAK_OFFSET,
  CORNER_THREE_Y,
  FREE_THROW_CIRCLE_RADIUS,
  FREE_THROW_LINE_X,
  LANE_HALF_WIDTH,
  RESTRICTED_AREA_RADIUS,
  RIM,
  SIDELINE_Y,
  THREE_POINT_ARC_RADIUS,
} from "@/lib/analytics/court";
import {
  RIM_SVG,
  VIEW_HEIGHT,
  VIEW_WIDTH,
  toSvgX,
  toSvgY,
} from "@/lib/viz/court-projection";

/**
 * Court markings, drawn from the same geometry constants the analytics layer uses.
 *
 * Nothing here is a hand-tuned pixel value: if the rim moves, the three-point arc
 * and the restricted-area arc move with it. That is worth the small amount of
 * trigonometry — a shot chart whose lines disagree with its bins is worse than no
 * chart, and the two cannot drift when they read the same constants.
 *
 * Stateless and dataless, so React re-renders of the shot layer never touch it.
 */

/** Rim radius. Only used for drawing. */
const RIM_RADIUS = 0.75;
/** Backboard: 6 ft wide, 4 ft in from the baseline. */
const BACKBOARD_HALF_WIDTH = 3;
const BACKBOARD_INSET = 4;

/** Distance bands the zone classifier uses, drawn as faint guides. */
const DISTANCE_BAND_RADII = [10, 16] as const;

const LINE_WIDTH = 0.16;

export function CourtDiagram() {
  const laneLeft = toSvgX(-LANE_HALF_WIDTH);
  const laneRight = toSvgX(LANE_HALF_WIDTH);
  const baselineY = toSvgY(BASELINE_X);
  const freeThrowY = toSvgY(FREE_THROW_LINE_X);

  // Where the corner's straight line meets the arc.
  const cornerBreakY = toSvgY(RIM.x + CORNER_THREE_ARC_BREAK_OFFSET);
  const cornerLeftX = toSvgX(-CORNER_THREE_Y);
  const cornerRightX = toSvgX(CORNER_THREE_Y);

  return (
    <g
      stroke="var(--court-line)"
      strokeWidth={LINE_WIDTH}
      fill="none"
      strokeLinecap="round"
    >
      {/* Clip everything to the drawn area so arcs do not spill past the baseline. */}
      <defs>
        <clipPath id="court-clip">
          <rect x={0} y={0} width={VIEW_WIDTH} height={VIEW_HEIGHT} />
        </clipPath>
      </defs>

      <g clipPath="url(#court-clip)">
        {/* Distance bands: solid hairlines, not dashed — dashing reads as a
            threshold when this is only a guide. */}
        <g stroke="var(--gridline)" strokeWidth={LINE_WIDTH * 0.75}>
          {DISTANCE_BAND_RADII.map((radius) => (
            <circle key={radius} cx={RIM_SVG.x} cy={RIM_SVG.y} r={radius} />
          ))}
        </g>

        {/* Boundary */}
        <line x1={0} y1={baselineY} x2={VIEW_WIDTH} y2={baselineY} />
        <line x1={toSvgX(-SIDELINE_Y)} y1={baselineY} x2={toSvgX(-SIDELINE_Y)} y2={0} />
        <line x1={toSvgX(SIDELINE_Y)} y1={baselineY} x2={toSvgX(SIDELINE_Y)} y2={0} />

        {/* Painted lane and free-throw line */}
        <rect
          x={laneLeft}
          y={freeThrowY}
          width={laneRight - laneLeft}
          height={baselineY - freeThrowY}
        />
        <circle
          cx={RIM_SVG.x}
          cy={freeThrowY}
          r={FREE_THROW_CIRCLE_RADIUS}
        />

        {/* Restricted area: a semicircle opening toward the baseline. */}
        <path
          d={`M ${RIM_SVG.x - RESTRICTED_AREA_RADIUS} ${RIM_SVG.y}
              A ${RESTRICTED_AREA_RADIUS} ${RESTRICTED_AREA_RADIUS} 0 0 1
                ${RIM_SVG.x + RESTRICTED_AREA_RADIUS} ${RIM_SVG.y}`}
        />

        {/* Backboard and rim */}
        <line
          x1={toSvgX(-BACKBOARD_HALF_WIDTH)}
          y1={toSvgY(BASELINE_X + BACKBOARD_INSET)}
          x2={toSvgX(BACKBOARD_HALF_WIDTH)}
          y2={toSvgY(BASELINE_X + BACKBOARD_INSET)}
          strokeWidth={LINE_WIDTH * 1.75}
        />
        <circle cx={RIM_SVG.x} cy={RIM_SVG.y} r={RIM_RADIUS} />

        {/* Three-point line: straight in the corners, arc above the break. */}
        <line x1={cornerLeftX} y1={baselineY} x2={cornerLeftX} y2={cornerBreakY} />
        <line x1={cornerRightX} y1={baselineY} x2={cornerRightX} y2={cornerBreakY} />
        <path
          d={`M ${cornerLeftX} ${cornerBreakY}
              A ${THREE_POINT_ARC_RADIUS} ${THREE_POINT_ARC_RADIUS} 0 0 1
                ${cornerRightX} ${cornerBreakY}`}
        />
      </g>
    </g>
  );
}
