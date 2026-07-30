import type { DribbleBucket, ShotClockBucket } from "@/lib/data/types";

/**
 * Bucketing for the situational dimensions of a shot.
 *
 * The cut points are conventions, not rules in the data, so they live here as
 * named constants instead of being scattered through comparisons. Each is chosen
 * to describe an offensive state a coach would recognise rather than to split the
 * data evenly.
 */

/** A possession still running its first action. */
const EARLY_SHOT_CLOCK_MIN = 18;
/** Below this the offense is hunting a shot rather than choosing one. */
const LATE_SHOT_CLOCK_MAX = 7;
/** Below this it is effectively a forced attempt. */
const EXPIRING_SHOT_CLOCK_MAX = 4;

export function classifyShotClockBucket(shotClock: number): ShotClockBucket {
  if (shotClock >= EARLY_SHOT_CLOCK_MIN) return "early";
  if (shotClock >= LATE_SHOT_CLOCK_MAX) return "middle";
  if (shotClock >= EXPIRING_SHOT_CLOCK_MAX) return "late";
  return "expiring";
}

export function classifyDribbleBucket(dribblesBefore: number): DribbleBucket {
  if (dribblesBefore === 0) return "none";
  if (dribblesBefore <= 2) return "one_to_two";
  if (dribblesBefore <= 6) return "three_to_six";
  return "seven_plus";
}

/** Earliest period counted as clutch. */
const CLUTCH_MIN_PERIOD = 4;
/** Seconds left in the period at or below which a shot counts as clutch. */
const CLUTCH_MAX_SECONDS_REMAINING = 300;

/**
 * The standard "last five minutes of the fourth or later" window. Score margin
 * is part of the usual definition but is not in this dataset, so this is a
 * time-only approximation and is labelled as such in the UI.
 */
export function isClutchShot(period: number, secondsRemaining: number): boolean {
  return (
    period >= CLUTCH_MIN_PERIOD &&
    secondsRemaining <= CLUTCH_MAX_SECONDS_REMAINING
  );
}
