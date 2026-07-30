import type { CourtSide, CourtZone } from "@/lib/analytics/zones";

/** Coarse shot families, straight from the data dictionary. */
export type ShotType = "heave" | "jumper" | "post" | "floater" | "layup";

export const SHOT_TYPES: readonly ShotType[] = [
  "layup",
  "jumper",
  "floater",
  "post",
  "heave",
] as const;

/** Fine-grained shot descriptors, straight from the data dictionary. */
export type ComplexShotType =
  | "heave"
  | "catchAndShoot"
  | "catchAndShootRelocating"
  | "catchAndShootOnMoveLeft"
  | "catchAndShootOnMoveRight"
  | "pullupJumper"
  | "stepback"
  | "shakeAndRaise"
  | "overScreen"
  | "drivingFloater"
  | "cutFloater"
  | "postLeft"
  | "postRight"
  | "drivingLayup"
  | "cutLayup"
  | "standstillLayup"
  | "lob"
  | "tip";

export const COMPLEX_SHOT_TYPES: readonly ComplexShotType[] = [
  "catchAndShoot",
  "catchAndShootRelocating",
  "catchAndShootOnMoveLeft",
  "catchAndShootOnMoveRight",
  "pullupJumper",
  "stepback",
  "shakeAndRaise",
  "overScreen",
  "drivingFloater",
  "cutFloater",
  "drivingLayup",
  "cutLayup",
  "standstillLayup",
  "lob",
  "tip",
  "postLeft",
  "postRight",
  "heave",
] as const;

export type ContestLevel =
  | "uncontested"
  | "lightly_contested"
  | "heavily_contested";

/** Ordered least- to most-contested, which is the order charts should use. */
export const CONTEST_LEVELS: readonly ContestLevel[] = [
  "uncontested",
  "lightly_contested",
  "heavily_contested",
] as const;

export const CONTEST_LEVEL_LABELS: Record<ContestLevel, string> = {
  uncontested: "Uncontested",
  lightly_contested: "Lightly contested",
  heavily_contested: "Heavily contested",
} as const;

/**
 * How much time was left on the shot clock. Buckets rather than raw seconds
 * because the interesting question is "early, in rhythm, or bailing out?".
 */
export type ShotClockBucket = "early" | "middle" | "late" | "expiring";

export const SHOT_CLOCK_BUCKETS: readonly ShotClockBucket[] = [
  "early",
  "middle",
  "late",
  "expiring",
] as const;

export const SHOT_CLOCK_BUCKET_LABELS: Record<ShotClockBucket, string> = {
  early: "Early (24–18s)",
  middle: "Middle (18–7s)",
  late: "Late (7–4s)",
  expiring: "Expiring (<4s)",
} as const;

/** How much the shooter dribbled before rising up. */
export type DribbleBucket = "none" | "one_to_two" | "three_to_six" | "seven_plus";

export const DRIBBLE_BUCKETS: readonly DribbleBucket[] = [
  "none",
  "one_to_two",
  "three_to_six",
  "seven_plus",
] as const;

export const DRIBBLE_BUCKET_LABELS: Record<DribbleBucket, string> = {
  none: "0 dribbles",
  one_to_two: "1–2 dribbles",
  three_to_six: "3–6 dribbles",
  seven_plus: "7+ dribbles",
} as const;

/**
 * A single shot attempt after validation and enrichment.
 *
 * Raw columns keep their meaning from the data dictionary; everything below the
 * `--- derived ---` marker is computed by the build-time ETL so the browser
 * never recomputes geometry for 8,800 rows on every filter change.
 */
export interface Shot {
  shooterId: string;
  shooterName: string;
  /** Calendar date of the game, as an ISO `YYYY-MM-DD` string. */
  gameDate: string;
  period: number;
  /** Seconds left in the period when the shot was released. */
  startGameClock: number;
  /** Seconds left in the period when the ball reached the rim. */
  endGameClock: number;
  shotClock: number;
  x: number;
  y: number;
  made: boolean;
  /** Passer's position, or null when no pass preceded the shot. */
  passerX: number | null;
  passerY: number | null;
  assisted: boolean;
  astOpp: boolean;
  blocked: boolean;
  fouled: boolean;
  shotType: ShotType;
  complexShotType: ComplexShotType;
  contested: boolean;
  contestLevel: ContestLevel;
  dribblesBefore: number;

  // --- derived ---
  /** Feet from the center of the rim. */
  distance: number;
  zone: CourtZone;
  side: CourtSide;
  isThree: boolean;
  /** Points the attempt was worth: 2 or 3. */
  shotValue: 2 | 3;
  /** Points actually scored on the attempt: 0, 2, or 3. Excludes free throws. */
  points: number;
  shotClockBucket: ShotClockBucket;
  dribbleBucket: DribbleBucket;
  /** Period 4 or later with under five minutes to play. */
  isClutch: boolean;
  /**
   * Whether a teammate passed to the shooter. Broader than `assisted`, which is
   * only true when the play-by-play credited an assist: 5,392 shots had a pass
   * but no assist.
   */
  hadPass: boolean;
  /** Feet from the passer to the shooter, or null when there was no pass. */
  passDistance: number | null;
}

/**
 * Everything the dashboard loads at startup: the enriched shots plus the
 * metadata the UI needs to build filters without rescanning the rows.
 */
export interface ShotDataset {
  /** ISO timestamp of the build that produced this file. */
  generatedAt: string;
  shots: Shot[];
  players: PlayerSummary[];
  /** Inclusive date range covered by the dataset. */
  dateRange: { from: string; to: string };
}

export interface PlayerSummary {
  shooterId: string;
  shooterName: string;
  attempts: number;
}
