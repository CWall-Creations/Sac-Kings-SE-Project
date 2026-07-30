import type { Shot } from "@/lib/data/types";
import {
  CORNER_THREE_ARC_BREAK_OFFSET,
  CORNER_THREE_Y,
  type CourtPoint,
  depthFromRim,
  distanceFromRim,
  isThreePointAttempt,
} from "./court";
import { type ShootingSplit, summarise } from "./metrics";
import { type CourtZone, angleFromRim } from "./zones";

/**
 * Where the pass that created a shot came from, and what those shots were worth.
 *
 * IMPORTANT — this is not an assist network, and cannot be. The extract carries
 * `passer_x`/`passer_y` but no passer *identity*, so who passed to whom is
 * unrecoverable. Attributing passes to players by matching origins against each
 * player's operating areas was considered and rejected: it would produce a named
 * network that reads as fact with no way to validate it.
 *
 * What is recoverable is the geometry, and it turns out to carry real signal once
 * you condition on where the shot was taken from. Corner threes created by a
 * kick-out from inside the arc are worth substantially more than the same shot
 * created by a swing pass from the top of the key — which is a coachable finding
 * about *how* to generate the shot, not merely that the team should take more of
 * them.
 */

export type PassOrigin =
  | "paint"
  | "midrange"
  | "corner"
  | "wing"
  | "top"
  | "deep"
  | "backcourt";

export const PASS_ORIGINS: readonly PassOrigin[] = [
  "paint",
  "midrange",
  "corner",
  "wing",
  "top",
  "deep",
  "backcourt",
] as const;

export const PASS_ORIGIN_LABELS: Record<PassOrigin, string> = {
  paint: "Paint",
  midrange: "Mid-range",
  corner: "Corner",
  wing: "Wing",
  top: "Top of the key",
  deep: "Beyond 30 ft",
  backcourt: "Backcourt",
};

/** Descriptions of the action each origin usually represents. */
export const PASS_ORIGIN_DESCRIPTIONS: Record<PassOrigin, string> = {
  paint: "Kick-out from under the basket — a drive or post-up drawing help",
  midrange: "Kick-out from the drive lane, elbow or short corner",
  corner: "Pass along the baseline or out of the corner",
  wing: "Swing pass from the wing",
  top: "Swing pass from the top of the key",
  deep: "Long frontcourt pass, usually in transition",
  backcourt: "Outlet or inbounds pass from the defensive half",
};

/** Radius around the rim treated as the paint, for pass origins. */
const PAINT_RADIUS = 8;
/** Beyond this from the rim, a frontcourt pass is a transition outlet. */
const DEEP_DISTANCE = 30;
/** Angle separating a wing pass from one at the top of the key. */
const WING_ANGLE_DEGREES = 30;

/**
 * Classify where a pass came from.
 *
 * `isThreePointAttempt` is reused here for its geometry rather than its meaning —
 * a passer does not take a shot, but "behind the arc" is exactly the line being
 * tested, and reusing it keeps the two definitions from drifting apart.
 */
export function classifyPassOrigin(point: CourtPoint): PassOrigin {
  // Positive x is the offence's own half: an outlet or inbounds pass.
  if (point.x > 0) return "backcourt";

  const distance = distanceFromRim(point);
  if (distance > DEEP_DISTANCE) return "deep";
  if (distance < PAINT_RADIUS) return "paint";
  if (!isThreePointAttempt(point)) return "midrange";

  if (
    Math.abs(point.y) >= CORNER_THREE_Y &&
    depthFromRim(point) <= CORNER_THREE_ARC_BREAK_OFFSET
  ) {
    return "corner";
  }

  return Math.abs(angleFromRim(point)) >= WING_ANGLE_DEGREES ? "wing" : "top";
}

/** A shot that came off a pass, with the passer's position resolved. */
export interface PassedShot {
  shot: Shot;
  passer: CourtPoint;
  origin: PassOrigin;
}

/** Pair each shot that had a pass with where that pass came from. */
export function withPassOrigins(shots: readonly Shot[]): PassedShot[] {
  const passed: PassedShot[] = [];

  for (const shot of shots) {
    if (shot.passerX === null || shot.passerY === null) continue;
    const passer = { x: shot.passerX, y: shot.passerY };
    passed.push({ shot, passer, origin: classifyPassOrigin(passer) });
  }

  return passed;
}

export interface PassOriginSummary {
  origin: PassOrigin;
  label: string;
  split: ShootingSplit;
  /** Share of the passed shots in the selection that came from here. */
  shareOfPassed: number;
  /**
   * Points per shot against the overall rate for the shots being traced. This is
   * the comparison that matters: it holds shot location fixed, so the difference
   * is attributable to how the shot was created rather than to where it was taken.
   */
  pointsPerShotVsSelection: number;
}

export interface PassOriginAnalysis {
  /** The shot zone being traced back from, or null for every shot. */
  targetZone: CourtZone | null;
  origins: PassOriginSummary[];
  passed: PassedShot[];
  /** Shots in the selection that had no pass at all. */
  unpassedAttempts: number;
  /** Overall points per shot for the selection, the reference for the colours. */
  selectionPointsPerShot: number;
  selectionAttempts: number;
}

/**
 * Trace a set of shots back to where the passes that created them came from.
 *
 * @param targetZone restrict to one shot zone. Passing null analyses everything,
 *   which mixes locations and is much less interpretable — the whole point is to
 *   hold the shot fixed and vary how it was created.
 */
export function analysePassOrigins(
  shots: readonly Shot[],
  targetZone: CourtZone | null,
): PassOriginAnalysis {
  const selection = targetZone
    ? shots.filter((shot) => shot.zone === targetZone)
    : [...shots];

  const passed = withPassOrigins(selection);
  const selectionSplit = summarise(selection);

  const byOrigin = new Map<PassOrigin, Shot[]>();
  for (const entry of passed) {
    const list = byOrigin.get(entry.origin) ?? [];
    list.push(entry.shot);
    byOrigin.set(entry.origin, list);
  }

  const origins = PASS_ORIGINS.map((origin) => {
    const group = byOrigin.get(origin) ?? [];
    const split = summarise(group);

    return {
      origin,
      label: PASS_ORIGIN_LABELS[origin],
      split,
      shareOfPassed: passed.length > 0 ? group.length / passed.length : 0,
      // An origin with no attempts has no difference to report.
      pointsPerShotVsSelection:
        group.length > 0
          ? split.pointsPerShot - selectionSplit.pointsPerShot
          : 0,
    };
  });

  return {
    targetZone,
    origins,
    passed,
    unpassedAttempts: selection.length - passed.length,
    selectionPointsPerShot: selectionSplit.pointsPerShot,
    selectionAttempts: selection.length,
  };
}

/**
 * The origin that created the most efficient version of a shot, among those with
 * enough attempts to be worth naming. Used by the insights layer.
 */
export function bestOrigin(
  analysis: PassOriginAnalysis,
  minimumAttempts: number,
): PassOriginSummary | null {
  const eligible = analysis.origins.filter(
    (origin) => origin.split.attempts >= minimumAttempts,
  );
  if (eligible.length === 0) return null;

  return eligible.reduce((best, candidate) =>
    candidate.split.pointsPerShot > best.split.pointsPerShot ? candidate : best,
  );
}

/** The least efficient origin with enough attempts to be worth naming. */
export function worstOrigin(
  analysis: PassOriginAnalysis,
  minimumAttempts: number,
): PassOriginSummary | null {
  const eligible = analysis.origins.filter(
    (origin) => origin.split.attempts >= minimumAttempts,
  );
  if (eligible.length === 0) return null;

  return eligible.reduce((worst, candidate) =>
    candidate.split.pointsPerShot < worst.split.pointsPerShot ? candidate : worst,
  );
}
