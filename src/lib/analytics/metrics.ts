import type { Shot } from "@/lib/data/types";

/**
 * Shooting rates for any set of attempts.
 *
 * Points per shot (PPS) is the metric the dashboard leads with, because it is the
 * only one that lets a 37% three and a 55% layup be compared directly. FG% is
 * kept alongside it precisely because it misleads on its own: this team shoots
 * 41.8% on corner threes and 41.0% on 4–10 footers, which looks like a tie and is
 * really a gap of nearly half a point per attempt.
 *
 * IMPORTANT: points here are field-goal points only. The dataset has no free
 * throws, so a shooting foul contributes 0 to PPS even though it is usually worth
 * about 1.5 points in reality. 9.9% of these attempts drew a foul and the rate
 * varies a lot by player (12% for the most frequent driver, 3% for the most
 * three-heavy shooter), so PPS systematically understates attacking the rim.
 * `foulRate` is exposed on every split so the gap stays visible; see README.
 */
export interface ShootingSplit {
  attempts: number;
  makes: number;
  /** Field-goal points only; excludes free throws. */
  points: number;
  /** Makes / attempts. */
  fieldGoalPct: number;
  /** Counts a three as 1.5 makes, so it is comparable across shot values. */
  effectiveFieldGoalPct: number;
  /** Points per shot: the headline efficiency number. */
  pointsPerShot: number;
  threePointAttempts: number;
  /** Share of attempts taken from behind the arc. */
  threePointRate: number;
  /** Share of attempts that drew a shooting foul. */
  foulRate: number;
  /** Share of attempts that were blocked. */
  blockRate: number;
  /** Share of attempts credited with an assist. */
  assistedRate: number;
}

/** A split with no attempts. Every rate is 0, and `attempts` is the guard. */
export const EMPTY_SPLIT: ShootingSplit = {
  attempts: 0,
  makes: 0,
  points: 0,
  fieldGoalPct: 0,
  effectiveFieldGoalPct: 0,
  pointsPerShot: 0,
  threePointAttempts: 0,
  threePointRate: 0,
  foulRate: 0,
  blockRate: 0,
  assistedRate: 0,
};

/**
 * Reduce a set of shots to its shooting rates in a single pass.
 *
 * Returns `EMPTY_SPLIT` for an empty input rather than throwing or producing
 * NaN: filter combinations that match nothing are a normal state in the UI, and
 * every consumer already has to check `attempts` before trusting a rate.
 */
export function summarise(shots: readonly Shot[]): ShootingSplit {
  if (shots.length === 0) return EMPTY_SPLIT;

  let makes = 0;
  let points = 0;
  let threePointAttempts = 0;
  let threePointMakes = 0;
  let fouled = 0;
  let blocked = 0;
  let assisted = 0;

  for (const shot of shots) {
    if (shot.made) makes += 1;
    points += shot.points;
    if (shot.isThree) {
      threePointAttempts += 1;
      if (shot.made) threePointMakes += 1;
    }
    if (shot.fouled) fouled += 1;
    if (shot.blocked) blocked += 1;
    if (shot.assisted) assisted += 1;
  }

  const attempts = shots.length;

  return {
    attempts,
    makes,
    points,
    fieldGoalPct: makes / attempts,
    effectiveFieldGoalPct: (makes + 0.5 * threePointMakes) / attempts,
    pointsPerShot: points / attempts,
    threePointAttempts,
    threePointRate: threePointAttempts / attempts,
    foulRate: fouled / attempts,
    blockRate: blocked / attempts,
    assistedRate: assisted / attempts,
  };
}

/**
 * Group shots by a derived key, preserving first-seen order.
 *
 * A plain `Map` rather than an object so keys keep their type and insertion order
 * is stable, which chart axes depend on.
 */
export function groupBy<K>(
  shots: readonly Shot[],
  keyOf: (shot: Shot) => K,
): Map<K, Shot[]> {
  const groups = new Map<K, Shot[]>();

  for (const shot of shots) {
    const key = keyOf(shot);
    const existing = groups.get(key);
    if (existing) {
      existing.push(shot);
    } else {
      groups.set(key, [shot]);
    }
  }

  return groups;
}

/** Group shots by a key and summarise each group. */
export function summariseBy<K>(
  shots: readonly Shot[],
  keyOf: (shot: Shot) => K,
): Map<K, ShootingSplit> {
  const splits = new Map<K, ShootingSplit>();
  for (const [key, group] of groupBy(shots, keyOf)) {
    splits.set(key, summarise(group));
  }
  return splits;
}

/**
 * Minimum attempts before a rate is presented as a finding rather than a
 * curiosity. Below this the UI shows the value greyed out with its sample size.
 *
 * 25 is a judgment call, not a derived threshold: the 95% interval on a 40%
 * shooter over 25 attempts is still roughly ±19 points of percentage, so this is
 * the floor for "worth looking at", not for "reliable". Shrinkage, not this
 * constant, is what keeps small samples from dominating the rankings.
 */
export const MIN_ATTEMPTS_FOR_CONFIDENCE = 25;

export function hasEnoughAttempts(split: ShootingSplit): boolean {
  return split.attempts >= MIN_ATTEMPTS_FOR_CONFIDENCE;
}

/**
 * Minimum attempts before a *season-long player rating* is presented without a
 * caveat. Deliberately far above `MIN_ATTEMPTS_FOR_CONFIDENCE`: 25 attempts is
 * enough to plot a single zone cell, but rating a player's shot making off 32
 * attempts — as one player in this dataset would have — is not a finding.
 */
export const MIN_ATTEMPTS_FOR_PLAYER_RATING = 100;

/**
 * Smallest points-per-shot gap treated as a real difference rather than noise.
 *
 * Needed because classifying zones as above or below average on the raw sign of
 * the difference is unstable near the mean: this team's wing threes land 0.005
 * PPS under the team average, which is a rounding error, but a sign test would
 * file all 1,363 of those attempts under "below average" and inflate the problem
 * from a third of the offence to a half.
 */
export const MATERIAL_POINTS_PER_SHOT_GAP = 0.05;

/**
 * Standard error of a points-per-shot estimate, used for the error bars on the
 * player scatter. Treats each attempt as an independent draw, which slightly
 * understates the true uncertainty (shots within a game are correlated) but is
 * the right order of magnitude and is honest about direction.
 */
export function pointsPerShotStandardError(shots: readonly Shot[]): number {
  if (shots.length < 2) return 0;

  const mean = shots.reduce((total, shot) => total + shot.points, 0) / shots.length;
  const variance =
    shots.reduce((total, shot) => total + (shot.points - mean) ** 2, 0) /
    (shots.length - 1);

  return Math.sqrt(variance / shots.length);
}
