import type { ComplexShotType, Shot } from "@/lib/data/types";

/**
 * Inferring a player's offensive role from the shots they took.
 *
 * The dataset has no position, height, or minutes — the players are anonymised —
 * so a positional label would have to be invented. Inferring a *behavioural*
 * archetype instead is both the only defensible option and the more useful one:
 * it describes the role the player actually performed rather than the one their
 * listed position implies, and it re-derives itself when the data is filtered.
 *
 * Why this matters for the insights layer: the same observation means opposite
 * things depending on role. Half of Player C's attempts come from inside 10 feet
 * and that is his job; half of a guard's attempts coming from there is a
 * bail-out. Advice that ignores role is advice a coach will discard.
 *
 * The classifier is deliberately auditable rather than overridable. Every score
 * is a weighted sum of visible shares, the signals that drove the decision are
 * reported alongside the label, and a close call is reported as a hybrid instead
 * of being forced into a bucket. If an archetype looks wrong, the evidence for it
 * is on screen to argue with — which is more useful than a hand-patched label,
 * and avoids importing assumptions the data cannot support.
 */

export type RoleArchetype =
  | "rim_finisher"
  | "floor_spacer"
  | "movement_shooter"
  | "on_ball_creator";

export const ROLE_LABELS: Record<RoleArchetype, string> = {
  rim_finisher: "Rim finisher",
  floor_spacer: "Floor spacer",
  movement_shooter: "Movement shooter",
  on_ball_creator: "On-ball creator",
};

/** What each archetype implies about how the player gets their shots. */
export const ROLE_DESCRIPTIONS: Record<RoleArchetype, string> = {
  rim_finisher:
    "Scores off plays run for him — rolls, cuts, lobs and post-ups — rather than creating his own look.",
  floor_spacer:
    "Stationary perimeter threat. Takes what the defence concedes, mostly standing still.",
  movement_shooter:
    "Generates separation by moving without the ball — screens, relocations, handoffs.",
  on_ball_creator:
    "Manufactures shots off the dribble for himself, usually against a set defence.",
};

/** Shot-profile shares the classifier reasons over. All values are 0–1. */
export interface RoleSignals {
  threeRate: number;
  rimShare: number;
  cornerShare: number;
  /** Attempts from inside the arc but outside the restricted area. */
  interiorNonRimShare: number;
  postShare: number;
  /** Plays finished for him: lobs, tips, cuts, standstill layups. */
  finishShare: number;
  /** Looks he manufactured: pull-ups, step-backs, shake-and-raise. */
  selfCreateShare: number;
  /** Stationary catch-and-shoot. */
  spotUpShare: number;
  /** Shooting on the move: relocations, off-screen catches, over-screen. */
  movementShare: number;
  driveShare: number;
  zeroDribbleShare: number;
  heavyDribbleShare: number;
  assistedRate: number;
  foulRate: number;
  /** Attempts taken with under seven seconds on the shot clock. */
  lateClockShare: number;
}

const FINISH_TYPES: ComplexShotType[] = [
  "lob",
  "tip",
  "cutLayup",
  "standstillLayup",
];
const SELF_CREATE_TYPES: ComplexShotType[] = [
  "pullupJumper",
  "stepback",
  "shakeAndRaise",
];
const MOVEMENT_TYPES: ComplexShotType[] = [
  "catchAndShootRelocating",
  "catchAndShootOnMoveLeft",
  "catchAndShootOnMoveRight",
  "overScreen",
];
const DRIVE_TYPES: ComplexShotType[] = ["drivingLayup", "drivingFloater"];

export function computeRoleSignals(shots: readonly Shot[]): RoleSignals {
  const total = shots.length;
  if (total === 0) {
    return {
      threeRate: 0,
      rimShare: 0,
      cornerShare: 0,
      interiorNonRimShare: 0,
      postShare: 0,
      finishShare: 0,
      selfCreateShare: 0,
      spotUpShare: 0,
      movementShare: 0,
      driveShare: 0,
      zeroDribbleShare: 0,
      heavyDribbleShare: 0,
      assistedRate: 0,
      foulRate: 0,
      lateClockShare: 0,
    };
  }

  const share = (predicate: (shot: Shot) => boolean) =>
    shots.filter(predicate).length / total;
  const typeShare = (types: ComplexShotType[]) =>
    share((shot) => types.includes(shot.complexShotType));

  return {
    threeRate: share((shot) => shot.isThree),
    rimShare: share((shot) => shot.zone === "restricted_area"),
    cornerShare: share((shot) => shot.zone === "corner_3"),
    interiorNonRimShare: share(
      (shot) =>
        !shot.isThree &&
        (shot.zone === "close_range" ||
          shot.zone === "midrange_short" ||
          shot.zone === "midrange_long"),
    ),
    postShare: share((shot) => shot.shotType === "post"),
    finishShare: typeShare(FINISH_TYPES),
    selfCreateShare: typeShare(SELF_CREATE_TYPES),
    spotUpShare: typeShare(["catchAndShoot"]),
    movementShare: typeShare(MOVEMENT_TYPES),
    driveShare: typeShare(DRIVE_TYPES),
    zeroDribbleShare: share((shot) => shot.dribbleBucket === "none"),
    heavyDribbleShare: share((shot) => shot.dribbleBucket === "seven_plus"),
    assistedRate: share((shot) => shot.assisted),
    foulRate: share((shot) => shot.fouled),
    lateClockShare: share(
      (shot) =>
        shot.shotClockBucket === "late" || shot.shotClockBucket === "expiring",
    ),
  };
}

/**
 * Weighted evidence for each archetype.
 *
 * Weights are judgment, not fitted — there are no role labels in the data to fit
 * against. They are chosen so that each archetype leans on the signals that
 * distinguish it from the others rather than on shares many roles share. The
 * classifier's job is to separate twelve players cleanly and to admit when it
 * cannot, not to be precise about a truth nobody can check.
 */
const SCORERS: Record<RoleArchetype, (signals: RoleSignals) => number> = {
  // Volume at the rim plus plays finished for him. Deliberately does not reward
  // "takes few threes" on its own, which would sweep in every slashing guard.
  rim_finisher: (s) =>
    s.finishShare * 0.45 +
    s.rimShare * 0.3 +
    s.postShare * 0.15 +
    s.zeroDribbleShare * 0.1,

  floor_spacer: (s) =>
    s.spotUpShare * 0.35 +
    s.threeRate * 0.25 +
    s.zeroDribbleShare * 0.25 +
    s.cornerShare * 0.15,

  // Movement share carries most of the weight: it is the one signal a stationary
  // spacer cannot accumulate.
  movement_shooter: (s) =>
    s.movementShare * 0.65 + s.threeRate * 0.2 + s.zeroDribbleShare * 0.15,

  on_ball_creator: (s) =>
    s.selfCreateShare * 0.3 +
    s.heavyDribbleShare * 0.25 +
    s.driveShare * 0.3 +
    (1 - s.zeroDribbleShare) * 0.15,
};

/**
 * Score margin below which two archetypes are treated as indistinguishable.
 *
 * Player L is the case this exists for: 43% of his attempts at the rim and 28%
 * finished for him, but also 31% from three and 24% spot-up. Forcing him into one
 * bucket would be false precision — he genuinely does both jobs.
 */
const HYBRID_MARGIN = 0.05;

/** Attempts below which a role claim is reported as provisional. */
const MIN_ATTEMPTS_FOR_ROLE = 100;

export interface RoleInference {
  /** Highest-scoring archetype. */
  archetype: RoleArchetype;
  /** Runner-up, when close enough that the two should be reported together. */
  secondary: RoleArchetype | null;
  /** Display label, naming both archetypes when the call is close. */
  label: string;
  confidence: "high" | "medium" | "low";
  /** Why: the shares that drove the decision, already formatted for display. */
  evidence: string[];
  signals: RoleSignals;
  scores: Record<RoleArchetype, number>;
}

export function inferRole(shots: readonly Shot[]): RoleInference {
  const signals = computeRoleSignals(shots);

  const scores = Object.fromEntries(
    (Object.keys(SCORERS) as RoleArchetype[]).map((archetype) => [
      archetype,
      SCORERS[archetype](signals),
    ]),
  ) as Record<RoleArchetype, number>;

  const ranked = (Object.keys(scores) as RoleArchetype[]).sort(
    (a, b) => scores[b] - scores[a],
  );
  const [top, runnerUp] = ranked;
  const margin = scores[top] - scores[runnerUp];
  const isHybrid = margin < HYBRID_MARGIN;

  const confidence: RoleInference["confidence"] =
    shots.length < MIN_ATTEMPTS_FOR_ROLE
      ? "low"
      : isHybrid
        ? "medium"
        : margin > HYBRID_MARGIN * 2
          ? "high"
          : "medium";

  return {
    archetype: top,
    secondary: isHybrid ? runnerUp : null,
    label: isHybrid
      ? `${ROLE_LABELS[top]} / ${ROLE_LABELS[runnerUp]}`
      : ROLE_LABELS[top],
    confidence,
    evidence: describeEvidence(top, isHybrid ? runnerUp : null, signals),
    signals,
    scores,
  };
}

/**
 * The two or three shares that most distinguish the chosen archetype, phrased so a
 * reader can check the call against the charts rather than take it on trust.
 */
function describeEvidence(
  archetype: RoleArchetype,
  secondary: RoleArchetype | null,
  signals: RoleSignals,
): string[] {
  const percent = (value: number) => `${Math.round(value * 100)}%`;
  const evidence: string[] = [];

  const forArchetype = (role: RoleArchetype): string[] => {
    switch (role) {
      case "rim_finisher":
        return [
          `${percent(signals.finishShare)} of attempts finished off a teammate's play`,
          `${percent(signals.rimShare)} at the rim`,
          `${percent(signals.heavyDribbleShare)} after 7+ dribbles`,
        ];
      case "floor_spacer":
        return [
          `${percent(signals.spotUpShare)} stationary catch-and-shoot`,
          `${percent(signals.zeroDribbleShare)} taken without a dribble`,
          `${percent(signals.threeRate)} from three`,
        ];
      case "movement_shooter":
        return [
          `${percent(signals.movementShare)} shooting on the move`,
          `${percent(signals.threeRate)} from three`,
          `${percent(signals.rimShare)} at the rim`,
        ];
      case "on_ball_creator":
        return [
          `${percent(signals.selfCreateShare)} self-created off the dribble`,
          `${percent(signals.heavyDribbleShare)} after 7+ dribbles`,
          `${percent(signals.driveShare)} driving to the basket`,
        ];
    }
  };

  evidence.push(...forArchetype(archetype));
  if (secondary) {
    // Only the signal that makes the case for the runner-up, to keep it short.
    evidence.push(forArchetype(secondary)[0]);
  }

  return evidence;
}
