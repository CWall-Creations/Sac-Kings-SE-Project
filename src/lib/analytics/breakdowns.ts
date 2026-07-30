import {
  CONTEST_LEVELS,
  CONTEST_LEVEL_LABELS,
  DRIBBLE_BUCKETS,
  DRIBBLE_BUCKET_LABELS,
  SHOT_CLOCK_BUCKETS,
  SHOT_CLOCK_BUCKET_LABELS,
  SHOT_TYPES,
  type Shot,
} from "@/lib/data/types";
import { type ShootingSplit, summarise, summariseBy } from "./metrics";

/**
 * Shooting broken down by the situational dimensions of a shot.
 *
 * All four dimensions are *ordered* — a defender does more as contest level
 * rises, the clock only runs down — so buckets always appear in their canonical
 * order rather than sorted by value. Re-ordering them by efficiency would destroy
 * the thing that makes the view readable: whether the trend is monotonic.
 *
 * Each dimension can carry a reference series (normally the whole team under the
 * same non-player filters), which is what turns "this player shoots 0.9 when
 * heavily contested" into "…and the team shoots 1.0".
 */

export interface ContextBucketSummary {
  key: string;
  label: string;
  split: ShootingSplit;
  /** Comparison value for this bucket, or null when nothing to compare to. */
  referencePointsPerShot: number | null;
  /** Share of the dimension's attempts that fall in this bucket. */
  shareOfAttempts: number;
}

export interface ContextBreakdown {
  id: string;
  label: string;
  /** What a reader should take from this dimension. */
  question: string;
  buckets: ContextBucketSummary[];
}

interface DimensionDefinition<T extends string> {
  id: string;
  label: string;
  question: string;
  /** Canonical bucket order. */
  values: readonly T[];
  labelOf: (value: T) => string;
  keyOf: (shot: Shot) => T;
}

/**
 * Summarise one dimension, keeping every bucket even when empty so panels do not
 * change shape as filters narrow — a row that vanishes reads as a rendering bug,
 * while a row showing zero attempts reads as information.
 */
function summariseDimension<T extends string>(
  shots: readonly Shot[],
  reference: readonly Shot[] | null,
  definition: DimensionDefinition<T>,
): ContextBreakdown {
  const splits = summariseBy(shots, definition.keyOf);
  const referenceSplits = reference
    ? summariseBy(reference, definition.keyOf)
    : null;
  const total = shots.length;

  return {
    id: definition.id,
    label: definition.label,
    question: definition.question,
    buckets: definition.values.map((value) => {
      const split = splits.get(value) ?? summarise([]);
      const referenceSplit = referenceSplits?.get(value);

      return {
        key: value,
        label: definition.labelOf(value),
        split,
        // A reference with no attempts is not a comparison, so report null
        // rather than a zero that would draw as "the team scores nothing here".
        referencePointsPerShot:
          referenceSplit && referenceSplit.attempts > 0
            ? referenceSplit.pointsPerShot
            : null,
        shareOfAttempts: total > 0 ? split.attempts / total : 0,
      };
    }),
  };
}

/**
 * Build every context breakdown.
 *
 * @param shots the current slice
 * @param reference optional comparison set, normally the full team under the
 *   same non-player filters. Pass null when the slice already is the team, since
 *   comparing it to itself would draw a marker on top of every bar.
 */
export function buildContextBreakdowns(
  shots: readonly Shot[],
  reference: readonly Shot[] | null = null,
): ContextBreakdown[] {
  return [
    summariseDimension(shots, reference, {
      id: "contest",
      label: "Defensive pressure",
      question: "How much does a contest cost?",
      values: CONTEST_LEVELS,
      labelOf: (value) => CONTEST_LEVEL_LABELS[value],
      keyOf: (shot) => shot.contestLevel,
    }),
    summariseDimension(shots, reference, {
      id: "shot-clock",
      label: "Shot clock",
      question: "Is the offence choosing shots or settling for them?",
      values: SHOT_CLOCK_BUCKETS,
      labelOf: (value) => SHOT_CLOCK_BUCKET_LABELS[value],
      keyOf: (shot) => shot.shotClockBucket,
    }),
    summariseDimension(shots, reference, {
      id: "dribbles",
      label: "Dribbles before the shot",
      question: "Catch-and-shoot, or created off the bounce?",
      values: DRIBBLE_BUCKETS,
      labelOf: (value) => DRIBBLE_BUCKET_LABELS[value],
      keyOf: (shot) => shot.dribbleBucket,
    }),
    summariseDimension(shots, reference, {
      id: "shot-type",
      label: "Shot type",
      question: "Which kinds of shot pay?",
      values: SHOT_TYPES,
      labelOf: (value) => value.charAt(0).toUpperCase() + value.slice(1),
      keyOf: (shot) => shot.shotType,
    }),
  ];
}

/**
 * Largest points-per-shot value across every bucket, including references.
 *
 * Small multiples are only comparable if they share one scale, so the panels are
 * all drawn against this single maximum rather than each normalising to its own.
 */
export function maxPointsPerShot(
  breakdowns: readonly ContextBreakdown[],
): number {
  let max = 0;

  for (const breakdown of breakdowns) {
    for (const bucket of breakdown.buckets) {
      max = Math.max(max, bucket.split.pointsPerShot);
      if (bucket.referencePointsPerShot !== null) {
        max = Math.max(max, bucket.referencePointsPerShot);
      }
    }
  }

  // A floor keeps the axis stable when a narrow filter leaves only weak buckets.
  return Math.max(max, 1);
}
