import type { Shot } from "@/lib/data/types";
import { buildContextBreakdowns } from "./breakdowns";
import { summarise } from "./metrics";
import { analysePassOrigins, bestOrigin, worstOrigin } from "./passes";
import {
  type PlayerShotProfile,
  buildTeamProfile,
  buildZoneProfiles,
  zonePointsPerShotMap,
} from "./profiles";
import { type RoleInference, inferRole } from "./roles";
import type { CourtZone } from "./zones";

/**
 * The synthesis layer: what a coach should actually do about any of this.
 *
 * Rules rather than prose, for three reasons. They recompute against whatever
 * slice is filtered, so the conclusions stay true to what is on screen; every
 * claim carries the arithmetic that produced it; and each rule is a pure function
 * that can be tested against a fixture instead of proof-read.
 *
 * Two things this layer is careful about:
 *
 *   1. **Role conditions the advice.** Half of Player C's attempts come from
 *      inside ten feet and that is his job; half of a guard's attempts from there
 *      is a bail-out. Rules that fire regardless of role produce advice a coach
 *      discards, so most of them are gated on the inferred archetype.
 *   2. **Every projected gain names its assumption.** A reallocation estimate is
 *      a counterfactual: it assumes the replacement looks are available and that
 *      the player converts them at his demonstrated rate. Those are strong
 *      assumptions and they are printed next to the number, not buried.
 */

export type InsightKind =
  /** Something working that should be protected or scaled up. */
  | "strength"
  /** Something costing points that the player or team controls. */
  | "concern"
  /** A specific, sized change worth making. */
  | "opportunity"
  /** A coaching/usage decision rather than a player decision. */
  | "assignment"
  /** Something this data cannot answer, stated so it is not assumed away. */
  | "limitation";

export interface Insight {
  id: string;
  kind: InsightKind;
  /** The bullet. Written to stand alone. */
  headline: string;
  /** Supporting arithmetic, caveat, or the assumption behind a projection. */
  detail?: string;
  /**
   * Estimated season points at stake, used for ordering. Null where the insight
   * is real but not quantifiable — which is not the same as unimportant.
   */
  points: number | null;
}

/** Zones a perimeter player has no structural reason to shoot from. */
const REPLACEABLE_ZONES: CourtZone[] = ["midrange_short", "midrange_long"];

/** Below this many attempts, a projected reallocation is not worth stating. */
const MIN_ATTEMPTS_TO_PROJECT = 40;

/** Below this, a pass origin is too thin to name as better or worse. */
const MIN_ATTEMPTS_TO_NAME_ORIGIN = 50;

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------

export function buildTeamInsights(
  shots: readonly Shot[],
  profiles: readonly PlayerShotProfile[],
): Insight[] {
  if (shots.length === 0) return [];

  const insights: Insight[] = [];
  const team = buildTeamProfile(shots);
  const zones = new Map(buildZoneProfiles(shots).map((z) => [z.zone, z]));
  const breakdowns = new Map(
    buildContextBreakdowns(shots).map((b) => [b.id, b]),
  );

  // --- Selection: measurable, and the headline answer -----------------------
  if (team.belowAverageAttempts > 0) {
    insights.push({
      id: "team-selection-cost",
      kind: "concern",
      headline: `Shot selection is a real problem: ${fmt(team.belowAverageAttempts)} attempts (${pct1(team.belowAverageShareOfAttempts)}) come from zones worth materially less than an average shot.`,
      detail: `They trail the team's own average by roughly ${Math.abs(Math.round(team.pointsLostToBelowAverageZones))} points across the season.`,
      points: team.pointsLostToBelowAverageZones,
    });
  }

  // --- The corner three, the clearest available lever -----------------------
  const corner = zones.get("corner_3");
  const midShort = zones.get("midrange_short");
  const midLong = zones.get("midrange_long");
  const rim = zones.get("restricted_area");

  if (corner?.split.attempts && rim?.split.attempts && midShort && midLong) {
    const replaceable = midShort.split.attempts + midLong.split.attempts;
    const replaceablePoints = midShort.split.points + midLong.split.points;
    const replaceablePps = replaceable > 0 ? replaceablePoints / replaceable : 0;
    const gain = (corner.split.pointsPerShot - replaceablePps) * replaceable;

    insights.push({
      id: "team-corner-three",
      kind: "opportunity",
      headline: `The corner three returns ${dec(corner.split.pointsPerShot)} — the same as a shot at the rim (${dec(rim.split.pointsPerShot)}) — but is only ${pct(corner.shareOfAttempts)} of the diet, while ${fmt(replaceable)} mid-range attempts return ${dec(replaceablePps)}.`,
      detail: `Turning those mid-range looks into corner threes would be worth about +${Math.round(gain)} points. That is a ceiling, not a forecast: it assumes the looks are generatable and that conversion holds at triple the volume.`,
      points: gain,
    });
  }

  // --- Making: honestly out of reach at team level --------------------------
  const rated = profiles.filter((p) => p.isReliable);
  if (rated.length >= 2) {
    const best = rated.reduce((a, b) =>
      a.shrunkPointsPerShotAboveExpected > b.shrunkPointsPerShotAboveExpected ? a : b,
    );
    const worst = rated.reduce((a, b) =>
      a.shrunkPointsPerShotAboveExpected < b.shrunkPointsPerShotAboveExpected ? a : b,
    );
    const spread =
      best.shrunkPointsPerShotAboveExpected -
      worst.shrunkPointsPerShotAboveExpected;

    insights.push({
      id: "team-making-unmeasurable",
      kind: "limitation",
      headline: `Whether the team as a whole shoots well cannot be answered from this data — the baseline is fitted from these players, so they cannot be above or below themselves.`,
      detail: `What is measurable is the spread within the roster: ${dec(spread)} points per shot between ${best.shooterName} (${signed(best.shrunkPointsPerShotAboveExpected)}) and ${worst.shooterName} (${signed(worst.shrunkPointsPerShotAboveExpected)}). Settling the team-level question needs a league-wide reference this extract does not contain.`,
      points: null,
    });
  }

  // --- Defensive pressure ---------------------------------------------------
  const contest = breakdowns.get("contest");
  const heavy = contest?.buckets.find((b) => b.key === "heavily_contested");
  const open = contest?.buckets.find((b) => b.key === "uncontested");

  if (heavy?.split.attempts && open?.split.attempts) {
    insights.push({
      id: "team-contest-concentration",
      kind: "concern",
      headline: `${pct(heavy.shareOfAttempts)} of all attempts are heavily contested, where the team scores ${dec(heavy.split.pointsPerShot)} — against ${dec(open.split.pointsPerShot)} when open.`,
      detail: `The largest bucket of shots is also the least efficient one, which points at shot creation and separation rather than shooting ability.`,
      points: null,
    });
  }

  // --- The dribble tax ------------------------------------------------------
  const dribbles = breakdowns.get("dribbles");
  const noDribble = dribbles?.buckets.find((b) => b.key === "none");
  const manyDribbles = dribbles?.buckets.find((b) => b.key === "seven_plus");

  if (noDribble?.split.attempts && manyDribbles?.split.attempts) {
    const gap = noDribble.split.pointsPerShot - manyDribbles.split.pointsPerShot;
    insights.push({
      id: "team-dribble-tax",
      kind: "opportunity",
      headline: `Catch-and-shoot attempts return ${dec(noDribble.split.pointsPerShot)}; attempts after 7+ dribbles return ${dec(manyDribbles.split.pointsPerShot)} — a gap of ${dec(gap)} per shot across ${fmt(manyDribbles.split.attempts)} attempts.`,
      detail: `Ball movement is worth more than isolation here. Some of that gap is shot difficulty rather than the dribbling itself, so treat it as an upper bound on what better spacing recovers.`,
      points: gap * manyDribbles.split.attempts,
    });
  }

  // --- Who is absorbing the dead possessions --------------------------------
  const teamLate =
    shots.filter(
      (s) =>
        s.shotClockBucket === "late" || s.shotClockBucket === "expiring",
    ).length / shots.length;

  const lateHeavy = profiles
    .filter((p) => p.isReliable)
    .map((p) => ({
      profile: p,
      share: lateClockShare(shots, p.shooterId),
    }))
    .filter((entry) => entry.share > teamLate * 1.25)
    .sort((a, b) => b.share - a.share);

  if (lateHeavy.length > 0) {
    insights.push({
      id: "team-late-clock-burden",
      kind: "assignment",
      headline: `Late-clock attempts are not evenly shared: ${lateHeavy
        .slice(0, 2)
        .map((e) => `${e.profile.shooterName} (${pct(e.share)})`)
        .join(" and ")} ${lateHeavy.length === 1 ? "takes" : "take"} them far more often than the team average of ${pct(teamLate)}.`,
      detail: `Shots with under seven seconds left return ${dec(lateClockPps(shots))}. ${lateHeavy.length === 1 ? "Part of that player's" : "Part of these players'"} shot quality is a usage decision rather than a choice they made.`,
      points: null,
    });
  }

  // --- How the best shots get created ---------------------------------------
  const cornerPasses = analysePassOrigins(shots, "corner_3");
  const bestFeed = bestOrigin(cornerPasses, MIN_ATTEMPTS_TO_NAME_ORIGIN);
  const worstFeed = worstOrigin(cornerPasses, MIN_ATTEMPTS_TO_NAME_ORIGIN);

  if (
    bestFeed &&
    worstFeed &&
    bestFeed.origin !== worstFeed.origin &&
    bestFeed.split.pointsPerShot - worstFeed.split.pointsPerShot > 0.15
  ) {
    const gap = bestFeed.split.pointsPerShot - worstFeed.split.pointsPerShot;

    insights.push({
      id: "team-pass-origin",
      kind: "opportunity",
      headline: `Corner threes fed from the ${bestFeed.label.toLowerCase()} return ${dec(bestFeed.split.pointsPerShot)}; the same shot fed from the ${worstFeed.label.toLowerCase()} returns ${dec(worstFeed.split.pointsPerShot)}.`,
      detail: `Same shot, different creation — a gap of ${dec(gap)} per attempt, on ${fmt(bestFeed.split.attempts)} and ${fmt(worstFeed.split.attempts)} attempts respectively. The points figure assumes the ${fmt(worstFeed.split.attempts)} worse-fed attempts could instead be generated the better way, which is a coaching question rather than a given. This says how to create the shot the team already under-takes, not merely that it should take more of them. The extract carries no passer identity, so this is pass geometry, not a player-to-player network.`,
      points: gap * worstFeed.split.attempts,
    });
  }

  // --- Is the most efficient scorer getting the ball? -----------------------
  const byEfficiency = [...rated].sort(
    (a, b) => b.split.pointsPerShot - a.split.pointsPerShot,
  );
  const byVolume = [...rated].sort((a, b) => b.split.attempts - a.split.attempts);
  const mostEfficient = byEfficiency[0];

  if (mostEfficient) {
    const volumeRank =
      byVolume.findIndex((p) => p.shooterId === mostEfficient.shooterId) + 1;

    if (volumeRank > 1) {
      insights.push({
        id: "team-efficiency-volume-mismatch",
        kind: "opportunity",
        headline: `${mostEfficient.shooterName} is the roster's most efficient scorer at ${dec(mostEfficient.split.pointsPerShot)} per shot but only ${ordinal(volumeRank)} in attempts.`,
        detail: `Moving attempts toward him is the least speculative gain available — it changes who shoots, not what shot they take.`,
        points: null,
      });
    }
  }

  return sortInsights(insights);
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

export interface PlayerInsightContext {
  /** Every shot in the current slice, all players — for team comparisons. */
  teamShots: readonly Shot[];
  /** Profiles for the same comparison set. */
  teamProfiles: readonly PlayerShotProfile[];
}

export function buildPlayerInsights(
  profile: PlayerShotProfile,
  playerShots: readonly Shot[],
  context: PlayerInsightContext,
): { role: RoleInference; insights: Insight[] } {
  const role = inferRole(playerShots);
  const insights: Insight[] = [];

  if (playerShots.length === 0) return { role, insights };

  const teamZonePps = zonePointsPerShotMap(context.teamShots);
  const teamSplit = summarise(context.teamShots);
  const zones = new Map(
    buildZoneProfiles(playerShots).map((z) => [z.zone, z]),
  );

  // --- The verdict, always first -------------------------------------------
  const meanExpected = attemptWeightedExpected(context.teamProfiles);
  const selection = profile.expectedPointsPerShot - meanExpected;
  const making = profile.pointsPerShotAboveExpected;
  const selectionPoints = selection * profile.split.attempts;
  const makingPoints = making * profile.split.attempts;

  insights.push({
    id: "player-verdict",
    kind: verdictKind(selection, making),
    headline: verdictHeadline(profile.shooterName, selection, making),
    detail: `Shot selection ${signed(selection)} per shot (${signedInt(selectionPoints)} points); shot making ${signed(making)} per shot (${signedInt(makingPoints)} points). Selection is measured against the roster's attempt-weighted average shot quality of ${dec(meanExpected)}.`,
    points: selectionPoints + makingPoints,
  });

  if (!profile.isReliable) {
    insights.push({
      id: "player-small-sample",
      kind: "limitation",
      headline: `Only ${fmt(profile.split.attempts)} attempts in this slice — too few to rate a season.`,
      detail: `The raw difference of ${signed(profile.pointsPerShotAboveExpected)} shrinks to ${signed(profile.shrunkPointsPerShotAboveExpected)} once sample size is accounted for.`,
      points: null,
    });
  }

  // --- Role-conditioned rules ----------------------------------------------
  const isPerimeter =
    role.archetype === "floor_spacer" ||
    role.archetype === "movement_shooter" ||
    role.archetype === "on_ball_creator";

  // Replaceable mid-range, but only for players with no structural reason to be there.
  if (isPerimeter) {
    const replaceable = REPLACEABLE_ZONES.map((zone) => zones.get(zone)).filter(
      (z): z is NonNullable<typeof z> => Boolean(z && z.split.attempts > 0),
    );
    const attempts = replaceable.reduce((t, z) => t + z.split.attempts, 0);
    const points = replaceable.reduce((t, z) => t + z.split.points, 0);

    if (attempts >= MIN_ATTEMPTS_TO_PROJECT) {
      const currentPps = points / attempts;
      const threes = playerShots.filter((s) => s.isThree);
      // His own demonstrated three-point production, which is a fairer
      // replacement value than the team's corner rate.
      const replacementPps =
        threes.length >= 100
          ? summarise(threes).pointsPerShot
          : (teamZonePps.get("corner_3") ?? teamSplit.pointsPerShot);
      const gain = (replacementPps - currentPps) * attempts;

      if (gain > 0) {
        insights.push({
          id: "player-midrange-reallocation",
          kind: "opportunity",
          headline: `${fmt(attempts)} attempts from 10+ feet inside the arc, returning ${dec(currentPps)}. His own three-point attempts return ${dec(replacementPps)}.`,
          detail: `Replacing those looks is worth roughly ${signedInt(gain)} points — assuming equivalent shots exist behind the line and that he converts them at his current rate.`,
          points: gain,
        });
      }
    }
  }

  if (role.archetype === "floor_spacer") {
    const corner = zones.get("corner_3");
    const aboveBreak = zones.get("above_break_3");
    const teamCorner = teamZonePps.get("corner_3");
    const teamAboveBreak = teamZonePps.get("above_break_3");

    if (
      corner &&
      aboveBreak &&
      teamCorner &&
      teamAboveBreak &&
      aboveBreak.split.attempts >= MIN_ATTEMPTS_TO_PROJECT &&
      role.signals.cornerShare < 0.15
    ) {
      const gain =
        (teamCorner - teamAboveBreak) * aboveBreak.split.attempts * 0.5;
      insights.push({
        id: "player-corner-relocation",
        kind: "opportunity",
        headline: `Takes ${pct(role.signals.threeRate)} of his shots from three but only ${pct(role.signals.cornerShare)} from the corner, where the team scores ${dec(teamCorner)} against ${dec(teamAboveBreak)} above the break.`,
        detail: `Relocating half his ${fmt(aboveBreak.split.attempts)} above-the-break attempts to the corner would be worth about ${signedInt(gain)} points. Corner looks depend on the offence generating them, so this is as much a spacing instruction as a personal one.`,
        points: gain,
      });
    }
  }

  if (role.archetype === "rim_finisher") {
    insights.push({
      id: "player-finisher-dependency",
      kind: "assignment",
      headline: `${pct(role.signals.finishShare)} of his attempts are plays finished for him and ${pct(role.signals.heavyDribbleShare)} come after 7+ dribbles — his efficiency is a function of how often he is fed, not what he chooses.`,
      detail: `His shot diet is not a lever a coach can pull on him directly. The levers are entry passes, screening angles, and volume.`,
      points: null,
    });

    if (role.signals.foulRate > summarise(context.teamShots).foulRate * 1.1) {
      insights.push({
        id: "player-foul-drawing",
        kind: "strength",
        headline: `Draws a shooting foul on ${pct1(role.signals.foulRate)} of attempts, against a team rate of ${pct1(teamSplit.foulRate)}.`,
        detail: `Points per shot excludes free throws entirely, so his true efficiency is understated by more than anyone else's on this roster.`,
        points: null,
      });
    }
  }

  if (role.archetype === "on_ball_creator") {
    const teamRimShare =
      context.teamShots.filter((s) => s.zone === "restricted_area").length /
      Math.max(1, context.teamShots.length);

    if (role.signals.rimShare < teamRimShare * 0.7) {
      insights.push({
        id: "player-no-rim-pressure",
        kind: "concern",
        headline: `Only ${pct(role.signals.rimShare)} of his attempts come at the rim, against ${pct(teamRimShare)} for the team — low for a player creating his own shot.`,
        detail: `A creator who does not threaten the rim lets defenders sit on the jumper, which shows up in the ${pct(role.signals.threeRate)} of his shots taken from three and the contest levels he faces.`,
        points: null,
      });
    }

    const teamLate =
      context.teamShots.filter(
        (s) => s.shotClockBucket === "late" || s.shotClockBucket === "expiring",
      ).length / Math.max(1, context.teamShots.length);

    if (role.signals.lateClockShare > teamLate * 1.25) {
      insights.push({
        id: "player-late-clock-load",
        kind: "assignment",
        headline: `${pct(role.signals.lateClockShare)} of his attempts come with under seven seconds on the clock, against ${pct(teamLate)} for the team.`,
        detail: `Some of his depressed shot quality is the offence handing him dead possessions. Judge his selection against that, or redistribute the burden.`,
        points: null,
      });
    }
  }

  if (role.archetype === "movement_shooter" && role.signals.foulRate < 0.05) {
    insights.push({
      id: "player-no-free-throws",
      kind: "concern",
      headline: `Draws a shooting foul on just ${pct1(role.signals.foulRate)} of attempts — the offence gets no free points from him.`,
      detail: `With ${pct(role.signals.threeRate)} of his shots from three and ${pct(role.signals.rimShare)} at the rim, he is a pure jump shooter. Efficient, but every point has to be earned from the field.`,
      points: null,
    });
  }

  // --- Selection strength worth protecting ---------------------------------
  if (selection > 0.05 && making > -0.05) {
    insights.push({
      id: "player-selection-strength",
      kind: "strength",
      headline: `Takes some of the best shots on the roster — ${dec(profile.expectedPointsPerShot)} expected per attempt against a team average of ${dec(meanExpected)}.`,
      detail: `Nothing here suggests changing what he shoots. If more volume is available, this is a safe place to put it.`,
      points: null,
    });
  }

  return { role, insights: sortInsights(insights) };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Biggest lever first.
 *
 * Ordering by category instead put a 598-point opportunity below an unquantified
 * concern, which is backwards — a reader skimming three bullets should get the
 * three that matter most. Quantified insights lead, sorted by points at stake;
 * unquantified ones follow, since a real finding without a number still beats
 * nothing; the verdict is pinned first and limitations last.
 */
function sortInsights(insights: Insight[]): Insight[] {
  const rank = (insight: Insight) => {
    if (insight.id.endsWith("verdict")) return 0;
    if (insight.kind === "limitation") return 3;
    return insight.points === null ? 2 : 1;
  };

  return [...insights].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    return Math.abs(b.points ?? 0) - Math.abs(a.points ?? 0);
  });
}

function verdictKind(selection: number, making: number): InsightKind {
  return selection + making >= 0 ? "strength" : "concern";
}

/**
 * The sentence that answers "selection or making?" for one player.
 *
 * Sign matters as much as magnitude, which an earlier version missed: a player
 * whose selection is +0.07 and whose making is −0.08 was described as having the
 * two "contribute roughly equally", when in fact they pull in opposite directions
 * and the whole story is that he takes good shots and misses them. Opposite signs
 * get their own framing, because that case is the most actionable one — it says
 * which of the two things to work on.
 */
function verdictHeadline(
  name: string,
  selection: number,
  making: number,
): string {
  /** Below this, a component is not meaningfully contributing either way. */
  const MATERIAL = 0.02;
  const total = selection + making;

  if (Math.abs(selection) < MATERIAL && Math.abs(making) < MATERIAL) {
    return `${name} sits close to the roster average on both shot selection and shot making.`;
  }

  const pullingApart =
    Math.abs(selection) >= MATERIAL &&
    Math.abs(making) >= MATERIAL &&
    Math.sign(selection) !== Math.sign(making);

  if (pullingApart) {
    if (total >= 0) {
      return making > 0
        ? `${name} overcomes a below-average shot diet with strong shot making — his shots are harder than his teammates', and he converts them anyway.`
        : `${name} is carried by his shot selection; his conversion is a slight drag on it.`;
    }
    return making < 0
      ? `${name} takes good shots and misses them — the shortfall is shot making, not selection.`
      : `${name} converts well but chooses poorly — the shortfall is shot selection, not making.`;
  }

  const direction = total >= 0 ? "above" : "below";
  const makingShare =
    Math.abs(making) / Math.max(1e-9, Math.abs(selection) + Math.abs(making));

  if (makingShare > 0.66) {
    return `${name} is ${direction} the roster average, mostly through shot making rather than shot selection.`;
  }
  if (makingShare < 0.34) {
    return `${name} is ${direction} the roster average, mostly through shot selection rather than shot making.`;
  }
  return `${name} is ${direction} the roster average, with selection and making contributing about equally.`;
}

function attemptWeightedExpected(
  profiles: readonly PlayerShotProfile[],
): number {
  const attempts = profiles.reduce((t, p) => t + p.split.attempts, 0);
  if (attempts === 0) return 0;
  return (
    profiles.reduce(
      (t, p) => t + p.expectedPointsPerShot * p.split.attempts,
      0,
    ) / attempts
  );
}

function lateClockShare(shots: readonly Shot[], shooterId: string): number {
  const own = shots.filter((s) => s.shooterId === shooterId);
  if (own.length === 0) return 0;
  return (
    own.filter(
      (s) => s.shotClockBucket === "late" || s.shotClockBucket === "expiring",
    ).length / own.length
  );
}

function lateClockPps(shots: readonly Shot[]): number {
  const late = shots.filter(
    (s) => s.shotClockBucket === "late" || s.shotClockBucket === "expiring",
  );
  return late.length > 0 ? summarise(late).pointsPerShot : 0;
}

const fmt = (value: number) => Math.round(value).toLocaleString("en-US");
const dec = (value: number) => value.toFixed(2);
const pct = (value: number) => `${Math.round(value * 100)}%`;
/**
 * One decimal, for rates where whole percents hide the point being made — a
 * 12.0% foul rate against a 9.9% team rate reads as "12% vs 10%" otherwise,
 * which makes a real gap look like rounding.
 */
const pct1 = (value: number) => `${(value * 100).toFixed(1)}%`;
const signed = (value: number) =>
  `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}`;
const signedInt = (value: number) =>
  `${value >= 0 ? "+" : "−"}${Math.abs(Math.round(value)).toLocaleString("en-US")}`;

function ordinal(n: number): string {
  const suffix = ["th", "st", "nd", "rd"][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10];
  return `${n}${suffix}`;
}
