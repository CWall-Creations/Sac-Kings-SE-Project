import type { Shot } from "@/lib/data/types";
import {
  type Baseline,
  buildBaseline,
  buildLeaveOnePlayerOutBaselines,
  expectedPointsPerShot,
  isChosenShot,
  shrinkTowardZero,
} from "./baseline";
import {
  MATERIAL_POINTS_PER_SHOT_GAP,
  MIN_ATTEMPTS_FOR_PLAYER_RATING,
  type ShootingSplit,
  pointsPerShotStandardError,
  summarise,
  summariseBy,
} from "./metrics";
import { COURT_ZONES, type CourtZone } from "./zones";

/**
 * Player- and zone-level rollups, which are what the three dashboard views read.
 *
 * Nothing here touches React: these are plain functions over arrays so they can
 * be unit tested, reused by a future server-side aggregation layer, and reasoned
 * about without a browser.
 */

export interface PlayerShotProfile {
  shooterId: string;
  shooterName: string;
  split: ShootingSplit;
  /** Average quality of the shots this player chose. */
  expectedPointsPerShot: number;
  /** Actual minus expected: shot making, in points per shot. */
  pointsPerShotAboveExpected: number;
  /** The same difference, pulled toward zero by sample size. Use this to rank. */
  shrunkPointsPerShotAboveExpected: number;
  /** Total points gained or lost against expectation across the season. */
  pointsAboveExpected: number;
  /** Standard error on this player's points per shot, for error bars. */
  standardError: number;
  /** Whether the sample clears `MIN_ATTEMPTS_FOR_PLAYER_RATING`. */
  isReliable: boolean;
  /** Attempts excluded as unchosen (heaves, backcourt), for transparency. */
  excludedAttempts: number;
}

/**
 * Build one profile per player, each graded against a baseline fit without that
 * player's own attempts.
 *
 * Ordered by shrunk difference, descending, so the ranking a reader sees is the
 * sample-size-aware one rather than whichever low-volume player got hot.
 */
export function buildPlayerProfiles(
  shots: readonly Shot[],
): PlayerShotProfile[] {
  const baselines = buildLeaveOnePlayerOutBaselines(shots);
  const byPlayer = new Map<string, Shot[]>();

  for (const shot of shots) {
    const existing = byPlayer.get(shot.shooterId);
    if (existing) existing.push(shot);
    else byPlayer.set(shot.shooterId, [shot]);
  }

  const profiles: PlayerShotProfile[] = [];

  for (const [shooterId, playerShots] of byPlayer) {
    // Unchosen attempts are dropped from the comparison but still counted, so
    // the UI can say why a player's totals do not match their raw attempts.
    const chosen = playerShots.filter(isChosenShot);
    if (chosen.length === 0) continue;

    const baseline = baselines.get(shooterId);
    if (!baseline) continue;

    const split = summarise(chosen);
    const expected = expectedPointsPerShot(chosen, baseline);
    const difference = split.pointsPerShot - expected;

    profiles.push({
      shooterId,
      shooterName: playerShots[0].shooterName,
      split,
      expectedPointsPerShot: expected,
      pointsPerShotAboveExpected: difference,
      shrunkPointsPerShotAboveExpected: shrinkTowardZero(
        difference,
        chosen.length,
      ),
      pointsAboveExpected: difference * chosen.length,
      standardError: pointsPerShotStandardError(chosen),
      isReliable: split.attempts >= MIN_ATTEMPTS_FOR_PLAYER_RATING,
      excludedAttempts: playerShots.length - chosen.length,
    });
  }

  return profiles.sort(
    (a, b) =>
      b.shrunkPointsPerShotAboveExpected - a.shrunkPointsPerShotAboveExpected,
  );
}

export interface ZoneProfile {
  zone: CourtZone;
  split: ShootingSplit;
  /** Share of the filtered attempts taken from this zone. */
  shareOfAttempts: number;
  /**
   * The value this zone is being judged against — either the same zone's team
   * rate, or the overall rate of the shots passed in. See `buildZoneProfiles`.
   */
  referencePointsPerShot: number;
  /** Points per shot above (positive) or below (negative) the reference. */
  pointsPerShotVsReference: number;
}

/**
 * Summarise attempts by court zone.
 *
 * The `reference` argument decides what the diverging colour on the court map
 * means, and the two modes answer different questions:
 *
 *   - `null` compares each zone to the overall rate of the same shots, i.e.
 *     "which of these shots are worth more than an average one?". This is the
 *     team-level efficiency view, where the mid-range sits ~0.25 points below
 *     average and the corner three ~0.20 above.
 *   - A zone map (usually the whole team's rates from `zonePointsPerShotMap`)
 *     compares a filtered subset to the team, i.e. "is this player better or
 *     worse than the team from here?". This is the individual-vs-team view.
 */
export function buildZoneProfiles(
  shots: readonly Shot[],
  reference: ReadonlyMap<CourtZone, number> | null = null,
): ZoneProfile[] {
  const splits = summariseBy(shots, (shot) => shot.zone);
  const overall = summarise(shots);

  return COURT_ZONES.map((zone) => {
    const split = splits.get(zone) ?? summarise([]);
    const referencePointsPerShot =
      reference?.get(zone) ?? overall.pointsPerShot;

    return {
      zone,
      split,
      shareOfAttempts:
        overall.attempts > 0 ? split.attempts / overall.attempts : 0,
      referencePointsPerShot,
      // A zone with no attempts has no difference to report.
      pointsPerShotVsReference:
        split.attempts > 0 ? split.pointsPerShot - referencePointsPerShot : 0,
    };
  });
}

/** Points per shot by zone, for use as a reference in `buildZoneProfiles`. */
export function zonePointsPerShotMap(
  shots: readonly Shot[],
): Map<CourtZone, number> {
  const splits = summariseBy(shots, (shot) => shot.zone);
  const map = new Map<CourtZone, number>();

  for (const zone of COURT_ZONES) {
    const split = splits.get(zone);
    if (split && split.attempts > 0) map.set(zone, split.pointsPerShot);
  }

  return map;
}

export interface TeamProfile {
  split: ShootingSplit;
  zones: ZoneProfile[];
  baseline: Baseline;
  /**
   * Attempts from zones worth materially less than the team's own average, and
   * what they cost relative to it. The headline framing of the efficiency view:
   * a third of this team's attempts come from below-average locations.
   *
   * "Materially" matters here — see `MATERIAL_POINTS_PER_SHOT_GAP`. On a plain
   * sign test the wing three (0.005 PPS under average) would join this group and
   * push the figure from 34% to 50%, which would overstate the case.
   */
  belowAverageAttempts: number;
  belowAverageShareOfAttempts: number;
  pointsLostToBelowAverageZones: number;
  /** Zones within the materiality band of average, counted as neither. */
  aroundAverageAttempts: number;
}

/** Roll the whole filtered set up into one team-level summary. */
export function buildTeamProfile(shots: readonly Shot[]): TeamProfile {
  const split = summarise(shots);
  const zones = buildZoneProfiles(shots);

  const shotZones = zones.filter((zone) => zone.split.attempts > 0);
  const belowAverage = shotZones.filter(
    (zone) => zone.pointsPerShotVsReference <= -MATERIAL_POINTS_PER_SHOT_GAP,
  );
  const aroundAverage = shotZones.filter(
    (zone) =>
      Math.abs(zone.pointsPerShotVsReference) < MATERIAL_POINTS_PER_SHOT_GAP,
  );

  const attemptsIn = (group: ZoneProfile[]) =>
    group.reduce((total, zone) => total + zone.split.attempts, 0);
  const belowAverageAttempts = attemptsIn(belowAverage);

  return {
    split,
    zones,
    baseline: buildBaseline(shots),
    belowAverageAttempts,
    belowAverageShareOfAttempts:
      split.attempts > 0 ? belowAverageAttempts / split.attempts : 0,
    pointsLostToBelowAverageZones: belowAverage.reduce(
      (total, zone) =>
        total + zone.pointsPerShotVsReference * zone.split.attempts,
      0,
    ),
    aroundAverageAttempts: attemptsIn(aroundAverage),
  };
}
