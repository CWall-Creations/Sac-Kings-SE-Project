import {
  classifyDribbleBucket,
  classifyShotClockBucket,
  isClutchShot,
} from "@/lib/analytics/context";
import { distanceFromRim, isThreePointAttempt, shotValue } from "@/lib/analytics/court";
import { classifySide, classifyZone } from "@/lib/analytics/zones";
import type { RawShotRow } from "./schema";
import type {
  ComplexShotType,
  ContestLevel,
  Shot,
  ShotType,
} from "./types";

/**
 * Turn a validated CSV row into the shape the dashboard consumes.
 *
 * All geometry and bucketing happens here, at build time, so the client can
 * filter and aggregate 8,800 rows without recomputing trigonometry on every
 * keystroke. The function is pure, which is what makes it testable and what
 * would let the same code run inside a database-backed pipeline later.
 */
export function enrichShot(row: RawShotRow): Shot {
  const point = { x: row.x, y: row.y };
  const isThree = isThreePointAttempt(point);
  const value = shotValue(point);
  // The schema guarantees the two passer coordinates are null together, so one
  // check settles both.
  const hadPass = row.passer_x !== null && row.passer_y !== null;

  return {
    shooterId: row.shooter_id,
    shooterName: row.shooter_name,
    gameDate: toIsoDate(row.year, row.month, row.day),
    period: row.period,
    startGameClock: row.start_game_clock,
    endGameClock: row.end_game_clock,
    shotClock: row.shot_clock,
    x: row.x,
    y: row.y,
    made: row.outcome,
    passerX: row.passer_x,
    passerY: row.passer_y,
    assisted: row.assisted,
    astOpp: row.ast_opp,
    blocked: row.blocked,
    fouled: row.fouled,
    shotType: row.shot_type as ShotType,
    complexShotType: row.complex_shot_type as ComplexShotType,
    contested: row.contested,
    contestLevel: row.contest_level as ContestLevel,
    dribblesBefore: row.dribbles_before,

    distance: round(distanceFromRim(point), 2),
    zone: classifyZone(point),
    side: classifySide(point),
    isThree,
    shotValue: value,
    points: row.outcome ? value : 0,
    shotClockBucket: classifyShotClockBucket(row.shot_clock),
    dribbleBucket: classifyDribbleBucket(row.dribbles_before),
    isClutch: isClutchShot(row.period, row.start_game_clock),
    hadPass,
    passDistance: hadPass
      ? round(Math.hypot(row.x - row.passer_x!, row.y - row.passer_y!), 2)
      : null,
  };
}

/**
 * `catch_and_shoot` is deliberately not carried onto `Shot`: the schema asserts
 * it equals `dribblesBefore === 0`, so `dribbleBucket === "none"` already says
 * it. Dropping the duplicate keeps one fewer field in sync per row.
 */

function toIsoDate(year: number, month: number, day: number): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
