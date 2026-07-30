import { z } from "zod";
import { BASELINE_X, SIDELINE_Y } from "@/lib/analytics/court";
import {
  COMPLEX_SHOT_TYPES,
  CONTEST_LEVELS,
  SHOT_TYPES,
} from "./types";

/**
 * Validation for the raw `shots.csv`.
 *
 * The brief says the data is clean, and it is — this schema found zero bad rows
 * across all 8,816 attempts. It exists anyway because it is the only place that
 * pins down what "clean" means: if a future extract renames an enum value,
 * flips a boolean encoding, or ships a coordinate off the floor, the build fails
 * with a row number instead of the dashboard rendering quietly wrong numbers.
 *
 * Every field arrives as a string from the CSV parser, so numerics are coerced
 * and booleans are decoded from the literal `TRUE`/`FALSE` the file uses.
 */

/** The CSV writes booleans as unquoted TRUE/FALSE rather than 0/1 or true/false. */
const csvBoolean = z
  .enum(["TRUE", "FALSE"])
  .transform((value) => value === "TRUE");

/** Seconds remaining on a clock: never negative, never above the clock's length. */
const secondsRemaining = (max: number) => z.coerce.number().min(0).max(max);

/**
 * A shooter is on the floor, give or take a step over the line: exactly one
 * attempt in the dataset is released from behind the baseline.
 */
const SHOOTER_OUT_OF_BOUNDS_SLACK = 3;

/**
 * A passer, by contrast, is routinely out of bounds — every inbounds pass is
 * thrown from there. 85 passes come from behind the baseline and 144 from past a
 * sideline, reaching about 5.6 ft out, so these bounds are deliberately looser
 * than the shooter's. They still catch a coordinate that is nowhere near a
 * basketball court.
 */
const PASSER_OUT_OF_BOUNDS_SLACK = 8;

const coordinatePair = (slack: number) => ({
  x: z.coerce.number().min(BASELINE_X - slack).max(-BASELINE_X + slack),
  y: z.coerce.number().min(-SIDELINE_Y - slack).max(SIDELINE_Y + slack),
});

const shooterCoordinate = coordinatePair(SHOOTER_OUT_OF_BOUNDS_SLACK);
const passerCoordinate = coordinatePair(PASSER_OUT_OF_BOUNDS_SLACK);

/**
 * Passer coordinates, which the CSV writes as the literal string `NULL` when no
 * pass preceded the shot — 838 rows, every one of them unassisted, and including
 * 209 of the 212 tip-ins (a putback off a rebound has no passer by definition).
 *
 * These are decoded to `null` rather than 0, which would place a phantom passer
 * at center court and quietly skew any pass-origin aggregate.
 */
const nullableCoordinate = (bounds: z.ZodType<number>) =>
  z.preprocess(
    (value) => (value === "NULL" || value === "" ? null : value),
    bounds.nullable(),
  );

export const rawShotRowSchema = z
  .object({
    shooter_id: z.string().min(1),
    shooter_name: z.string().min(1),
    year: z.coerce.number().int().min(2000).max(2100),
    month: z.coerce.number().int().min(1).max(12),
    day: z.coerce.number().int().min(1).max(31),
    // Regulation is 1-4; anything higher is overtime. The dataset reaches 6.
    period: z.coerce.number().int().min(1).max(10),
    // Regulation periods are 12 minutes, overtime 5, so 720s bounds both.
    start_game_clock: secondsRemaining(720),
    end_game_clock: secondsRemaining(720),
    shot_clock: secondsRemaining(24),
    x: shooterCoordinate.x,
    y: shooterCoordinate.y,
    outcome: csvBoolean,
    passer_x: nullableCoordinate(passerCoordinate.x),
    passer_y: nullableCoordinate(passerCoordinate.y),
    assisted: csvBoolean,
    ast_opp: csvBoolean,
    blocked: csvBoolean,
    fouled: csvBoolean,
    shot_type: z.enum(SHOT_TYPES as [string, ...string[]]),
    complex_shot_type: z.enum(COMPLEX_SHOT_TYPES as [string, ...string[]]),
    contested: csvBoolean,
    contest_level: z.enum(CONTEST_LEVELS as [string, ...string[]]),
    catch_and_shoot: csvBoolean,
    dribbles_before: z.coerce.number().int().min(0).max(60),
  })
  // The ball cannot reach the rim before it is released.
  .refine((row) => row.end_game_clock <= row.start_game_clock, {
    message: "end_game_clock is later than start_game_clock",
    path: ["end_game_clock"],
  })
  /**
   * `catch_and_shoot` is exactly `dribbles_before === 0` in all 8,816 rows, so
   * it carries no information the dribble count does not already have. The
   * assertion is here so that if the two ever diverge in a future extract we
   * find out at build time rather than after shipping a chart built on the
   * assumption that they agree.
   */
  .refine((row) => row.catch_and_shoot === (row.dribbles_before === 0), {
    message:
      "catch_and_shoot disagrees with dribbles_before === 0; the columns are no longer redundant",
    path: ["catch_and_shoot"],
  })
  // A passer is either fully known or fully absent; one coordinate without the
  // other would mean the extract lost data mid-row.
  .refine((row) => (row.passer_x === null) === (row.passer_y === null), {
    message: "passer_x and passer_y disagree about whether a passer exists",
    path: ["passer_x"],
  })
  /**
   * No passer implies no assist. This holds for all 838 passer-less rows and is
   * the invariant that lets `hadPass` be trusted as "a teammate passed to the
   * shooter", so it is enforced rather than assumed.
   */
  .refine((row) => row.passer_x !== null || !row.assisted, {
    message: "row is marked assisted but has no passer coordinates",
    path: ["assisted"],
  });

export type RawShotRow = z.infer<typeof rawShotRowSchema>;
