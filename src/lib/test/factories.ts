import { enrichShot } from "@/lib/data/enrich";
import type { RawShotRow } from "@/lib/data/schema";
import type { Shot } from "@/lib/data/types";

/**
 * Test fixtures.
 *
 * Shots are built by running a raw row through the real `enrichShot`, so a
 * fixture can never disagree with production about what zone a coordinate is in
 * or what a shot is worth. Overrides are applied to the raw row where possible
 * and to the enriched result otherwise, which keeps `makeShot({ x, y })` honest:
 * the derived geometry updates to match.
 */

const BASE_ROW: RawShotRow = {
  shooter_id: "player-a",
  shooter_name: "Player A",
  year: 2025,
  month: 1,
  day: 15,
  period: 1,
  start_game_clock: 500,
  end_game_clock: 499,
  shot_clock: 12,
  x: -20,
  y: 0,
  outcome: false,
  passer_x: -30,
  passer_y: 5,
  assisted: false,
  ast_opp: false,
  blocked: false,
  fouled: false,
  shot_type: "jumper",
  complex_shot_type: "pullupJumper",
  contested: true,
  contest_level: "lightly_contested",
  catch_and_shoot: false,
  dribbles_before: 2,
};

/** Fields that map straight onto a raw CSV column. */
type RawOverrides = Partial<{
  shooterId: string;
  shooterName: string;
  x: number;
  y: number;
  made: boolean;
  period: number;
  shotClock: number;
  startGameClock: number;
  dribblesBefore: number;
  assisted: boolean;
  blocked: boolean;
  fouled: boolean;
  contestLevel: RawShotRow["contest_level"];
  shotType: RawShotRow["shot_type"];
  complexShotType: RawShotRow["complex_shot_type"];
  passerX: number | null;
  passerY: number | null;
}>;

/**
 * Build one enriched shot. Every override is routed through the raw row so
 * derived fields (zone, distance, shotValue, points, buckets) stay consistent.
 */
export function makeShot(overrides: RawOverrides = {}): Shot {
  const row: RawShotRow = {
    ...BASE_ROW,
    ...(overrides.shooterId !== undefined && { shooter_id: overrides.shooterId }),
    ...(overrides.shooterName !== undefined && {
      shooter_name: overrides.shooterName,
    }),
    ...(overrides.x !== undefined && { x: overrides.x }),
    ...(overrides.y !== undefined && { y: overrides.y }),
    ...(overrides.made !== undefined && { outcome: overrides.made }),
    ...(overrides.period !== undefined && { period: overrides.period }),
    ...(overrides.shotClock !== undefined && { shot_clock: overrides.shotClock }),
    ...(overrides.startGameClock !== undefined && {
      start_game_clock: overrides.startGameClock,
      end_game_clock: overrides.startGameClock - 1,
    }),
    ...(overrides.dribblesBefore !== undefined && {
      dribbles_before: overrides.dribblesBefore,
      catch_and_shoot: overrides.dribblesBefore === 0,
    }),
    ...(overrides.assisted !== undefined && { assisted: overrides.assisted }),
    ...(overrides.blocked !== undefined && { blocked: overrides.blocked }),
    ...(overrides.fouled !== undefined && { fouled: overrides.fouled }),
    ...(overrides.contestLevel !== undefined && {
      contest_level: overrides.contestLevel,
    }),
    ...(overrides.shotType !== undefined && { shot_type: overrides.shotType }),
    ...(overrides.complexShotType !== undefined && {
      complex_shot_type: overrides.complexShotType,
    }),
    ...(overrides.passerX !== undefined && { passer_x: overrides.passerX }),
    ...(overrides.passerY !== undefined && { passer_y: overrides.passerY }),
  };

  return enrichShot(row);
}

/** Build `count` identical shots. Useful for hitting sample-size thresholds. */
export function makeShots(count: number, overrides: RawOverrides = {}): Shot[] {
  return Array.from({ length: count }, () => makeShot(overrides));
}

/**
 * Build a run of shots with a given make rate, deterministically: the first
 * `round(count * makeRate)` go in. Avoids flaky tests while still producing a
 * realistic-looking split.
 */
export function makeShotsWithRate(
  count: number,
  makeRate: number,
  overrides: RawOverrides = {},
): Shot[] {
  const makes = Math.round(count * makeRate);
  return Array.from({ length: count }, (_, index) =>
    makeShot({ ...overrides, made: index < makes }),
  );
}
