import type { ContestLevel, Shot } from "@/lib/data/types";
import { isBackcourtShot } from "./court";
import { COURT_ZONES, type CourtZone } from "./zones";

/**
 * The shot-quality baseline: what a shot from a given spot, against a given
 * level of defence, is worth on average.
 *
 * This is what separates "we take bad shots" from "we miss good shots". A
 * player's expected PPS describes the shots they choose; the gap between actual
 * and expected describes how well they shoot them. Both are needed — the two
 * highest-volume shooters in this dataset sit 0.24 points per shot apart, and
 * roughly half of that gap is selection rather than making.
 *
 * Design decisions worth knowing:
 *
 *   - Features are court zone x contest level (21 cells). Adding shot type
 *     splinters the cells without adding much: contest level and location
 *     already carry most of the signal, and a model with cells of n=6 is worse
 *     than a coarse one with cells of n=300.
 *   - The baseline is fit from this dataset, because no league-wide reference is
 *     provided. So it answers "compared to how this team shoots these shots",
 *     not "compared to the NBA". That is the right question for comparing
 *     teammates and the wrong one for judging the team in absolute terms.
 *   - Cell rates are shrunk toward their zone, and zones toward the overall
 *     mean, so a thin cell (34 uncontested 4-10 footers) cannot swing anyone's
 *     rating.
 *   - Each player is graded against a baseline fit *without* their own shots.
 *     Without this, the highest-volume shooter is partly compared to themselves,
 *     which flattens exactly the differences the view exists to show.
 */

/** Composite key for a baseline cell. */
type BaselineCellKey = `${CourtZone}|${ContestLevel}`;

function cellKey(zone: CourtZone, contestLevel: ContestLevel): BaselineCellKey {
  return `${zone}|${contestLevel}`;
}

interface Totals {
  attempts: number;
  points: number;
}

/**
 * Weight of the prior when shrinking a rate toward its parent, in attempts. A
 * cell with 50 attempts lands halfway between its own rate and its zone's.
 *
 * 50 is chosen so that the thinnest cells lean on their zone while the cells
 * that carry real volume (most hold 300+) are barely moved.
 */
export const BASELINE_SHRINKAGE_ATTEMPTS = 50;

export interface Baseline {
  /** Expected points for one attempt with this profile. */
  expectedPointsPerShot(zone: CourtZone, contestLevel: ContestLevel): number;
  /** Expected points for one specific attempt. */
  expectedPointsFor(shot: Shot): number;
  /** Mean points per shot across every attempt the baseline was fit on. */
  readonly overallPointsPerShot: number;
  /** Attempts the baseline was fit on. */
  readonly attempts: number;
}

/**
 * Whether an attempt reflects a shot-selection decision.
 *
 * Heaves (17 attempts, all missed) and the 8 shots released in the backcourt are
 * artefacts of an expiring clock rather than chosen shots. Including them would
 * penalise whoever happened to be holding the ball, so they are excluded from
 * both fitting the baseline and grading players against it.
 */
export function isChosenShot(shot: Shot): boolean {
  return shot.shotType !== "heave" && !isBackcourtShot(shot);
}

/** Fit a baseline from a set of attempts. */
export function buildBaseline(shots: readonly Shot[]): Baseline {
  const cells = new Map<BaselineCellKey, Totals>();
  const overall: Totals = { attempts: 0, points: 0 };

  for (const shot of shots) {
    if (!isChosenShot(shot)) continue;
    addTo(cells, cellKey(shot.zone, shot.contestLevel), shot);
    overall.attempts += 1;
    overall.points += shot.points;
  }

  return fromTotals(cells, overall);
}

/**
 * Fit one baseline per player, each excluding that player's own attempts.
 *
 * Computed by subtracting a player's cell totals from the league-wide totals
 * rather than by re-scanning the data 12 times, so the whole set costs one pass
 * over the shots plus a handful of arithmetic per player.
 */
export function buildLeaveOnePlayerOutBaselines(
  shots: readonly Shot[],
): Map<string, Baseline> {
  const allCells = new Map<BaselineCellKey, Totals>();
  const overall: Totals = { attempts: 0, points: 0 };
  const perPlayerCells = new Map<string, Map<BaselineCellKey, Totals>>();
  const perPlayerOverall = new Map<string, Totals>();

  for (const shot of shots) {
    if (!isChosenShot(shot)) continue;
    const key = cellKey(shot.zone, shot.contestLevel);

    addTo(allCells, key, shot);
    overall.attempts += 1;
    overall.points += shot.points;

    let playerCells = perPlayerCells.get(shot.shooterId);
    if (!playerCells) {
      playerCells = new Map();
      perPlayerCells.set(shot.shooterId, playerCells);
      perPlayerOverall.set(shot.shooterId, { attempts: 0, points: 0 });
    }
    addTo(playerCells, key, shot);

    const playerOverall = perPlayerOverall.get(shot.shooterId)!;
    playerOverall.attempts += 1;
    playerOverall.points += shot.points;
  }

  const baselines = new Map<string, Baseline>();

  for (const [shooterId, playerCells] of perPlayerCells) {
    const remainingCells = new Map<BaselineCellKey, Totals>();

    for (const [key, totals] of allCells) {
      const own = playerCells.get(key);
      const attempts = totals.attempts - (own?.attempts ?? 0);
      // A cell the player was the only shooter in leaves nothing behind; it
      // falls back to its zone (and then the overall mean) via shrinkage.
      if (attempts > 0) {
        remainingCells.set(key, {
          attempts,
          points: totals.points - (own?.points ?? 0),
        });
      }
    }

    const own = perPlayerOverall.get(shooterId)!;
    baselines.set(
      shooterId,
      fromTotals(remainingCells, {
        attempts: overall.attempts - own.attempts,
        points: overall.points - own.points,
      }),
    );
  }

  return baselines;
}

/**
 * Sum of expected points over a set of attempts, divided by the count: the
 * average quality of the shots a player chose to take.
 */
export function expectedPointsPerShot(
  shots: readonly Shot[],
  baseline: Baseline,
): number {
  const chosen = shots.filter(isChosenShot);
  if (chosen.length === 0) return 0;

  const total = chosen.reduce(
    (sum, shot) => sum + baseline.expectedPointsFor(shot),
    0,
  );
  return total / chosen.length;
}

/**
 * Pull an estimated difference toward zero in proportion to how little data
 * supports it, so that a 32-attempt player cannot outrank a 1,389-attempt one on
 * noise alone.
 *
 * This is the standard `n / (n + k)` shrinkage, with the same prior weight the
 * baseline cells use. It changes the ranking on purpose: raw differences are
 * still reported alongside, because a coach should see both the estimate and how
 * much of it survives accounting for sample size.
 */
export function shrinkTowardZero(
  difference: number,
  attempts: number,
  priorWeight = BASELINE_SHRINKAGE_ATTEMPTS,
): number {
  if (attempts <= 0) return 0;
  return difference * (attempts / (attempts + priorWeight));
}

function addTo(
  cells: Map<BaselineCellKey, Totals>,
  key: BaselineCellKey,
  shot: Shot,
): void {
  const existing = cells.get(key);
  if (existing) {
    existing.attempts += 1;
    existing.points += shot.points;
  } else {
    cells.set(key, { attempts: 1, points: shot.points });
  }
}

/**
 * Turn raw totals into a queryable baseline, shrinking each level toward its
 * parent: cell -> zone -> overall.
 */
function fromTotals(
  cells: Map<BaselineCellKey, Totals>,
  overall: Totals,
): Baseline {
  const overallPointsPerShot =
    overall.attempts > 0 ? overall.points / overall.attempts : 0;

  // Zone totals, summed from the cells so there is a single source of truth.
  const zoneTotals = new Map<CourtZone, Totals>();
  for (const [key, totals] of cells) {
    const zone = key.split("|")[0] as CourtZone;
    const existing = zoneTotals.get(zone);
    if (existing) {
      existing.attempts += totals.attempts;
      existing.points += totals.points;
    } else {
      zoneTotals.set(zone, { ...totals });
    }
  }

  const zonePointsPerShot = new Map<CourtZone, number>();
  for (const zone of COURT_ZONES) {
    const totals = zoneTotals.get(zone);
    zonePointsPerShot.set(
      zone,
      shrink(totals, overallPointsPerShot),
    );
  }

  const cellPointsPerShot = new Map<BaselineCellKey, number>();
  for (const [key, totals] of cells) {
    const zone = key.split("|")[0] as CourtZone;
    const prior = zonePointsPerShot.get(zone) ?? overallPointsPerShot;
    cellPointsPerShot.set(key, shrink(totals, prior));
  }

  function expectedPointsPerShotFor(
    zone: CourtZone,
    contestLevel: ContestLevel,
  ): number {
    return (
      cellPointsPerShot.get(cellKey(zone, contestLevel)) ??
      zonePointsPerShot.get(zone) ??
      overallPointsPerShot
    );
  }

  return {
    expectedPointsPerShot: expectedPointsPerShotFor,
    expectedPointsFor: (shot) =>
      expectedPointsPerShotFor(shot.zone, shot.contestLevel),
    overallPointsPerShot,
    attempts: overall.attempts,
  };
}

/** Blend an observed rate with a prior, weighted by sample size. */
function shrink(totals: Totals | undefined, prior: number): number {
  if (!totals || totals.attempts === 0) return prior;
  return (
    (totals.points + BASELINE_SHRINKAGE_ATTEMPTS * prior) /
    (totals.attempts + BASELINE_SHRINKAGE_ATTEMPTS)
  );
}
