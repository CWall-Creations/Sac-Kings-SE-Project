import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { parseShotsCsv } from "@/lib/data/pipeline";
import type { Shot } from "@/lib/data/types";
import { makeShots } from "@/lib/test/factories";
import { computeRoleSignals, inferRole } from "./roles";

const RIM = { x: -41.75, y: 0 } as const;
const CORNER = { x: -39, y: -23 } as const;
const TOP = { x: -16, y: 0 } as const;
const MIDRANGE = { x: -28, y: 0 } as const;

describe("computeRoleSignals", () => {
  it("returns zeroed signals for no shots rather than NaN", () => {
    const signals = computeRoleSignals([]);
    expect(signals.threeRate).toBe(0);
    expect(Object.values(signals).every((v) => Number.isFinite(v))).toBe(true);
  });

  it("measures the shares the classifier reasons over", () => {
    const signals = computeRoleSignals([
      ...makeShots(30, { ...RIM, shotType: "layup", complexShotType: "lob", dribblesBefore: 0 }),
      ...makeShots(70, { ...CORNER, complexShotType: "catchAndShoot", dribblesBefore: 0 }),
    ]);

    expect(signals.finishShare).toBeCloseTo(0.3);
    expect(signals.spotUpShare).toBeCloseTo(0.7);
    expect(signals.zeroDribbleShare).toBeCloseTo(1);
    expect(signals.cornerShare).toBeCloseTo(0.7);
  });
});

describe("inferRole", () => {
  it("identifies a rim finisher from plays finished for him", () => {
    const role = inferRole([
      ...makeShots(60, { ...RIM, shotType: "layup", complexShotType: "cutLayup", dribblesBefore: 0 }),
      ...makeShots(30, { ...RIM, shotType: "layup", complexShotType: "lob", dribblesBefore: 0 }),
      ...makeShots(30, { ...MIDRANGE, shotType: "post", complexShotType: "postLeft", dribblesBefore: 1 }),
    ]);

    expect(role.archetype).toBe("rim_finisher");
    expect(role.secondary).toBeNull();
  });

  it("identifies a stationary floor spacer", () => {
    const role = inferRole([
      ...makeShots(90, { ...CORNER, complexShotType: "catchAndShoot", dribblesBefore: 0 }),
      ...makeShots(40, { ...TOP, complexShotType: "catchAndShoot", dribblesBefore: 0 }),
    ]);

    expect(role.archetype).toBe("floor_spacer");
  });

  it("separates a movement shooter from a stationary one", () => {
    const stationary = inferRole(
      makeShots(120, { ...CORNER, complexShotType: "catchAndShoot", dribblesBefore: 0 }),
    );
    const moving = inferRole(
      makeShots(120, { ...TOP, complexShotType: "overScreen", dribblesBefore: 0 }),
    );

    expect(stationary.archetype).toBe("floor_spacer");
    expect(moving.archetype).toBe("movement_shooter");
  });

  it("identifies an on-ball creator from self-created looks off the dribble", () => {
    const role = inferRole([
      ...makeShots(70, { ...TOP, complexShotType: "stepback", dribblesBefore: 8 }),
      ...makeShots(60, { ...RIM, shotType: "layup", complexShotType: "drivingLayup", dribblesBefore: 5 }),
    ]);

    expect(role.archetype).toBe("on_ball_creator");
  });

  it("reports a hybrid instead of forcing a bucket when two roles are close", () => {
    // 60/40 finishing-to-spot-up is where the two scores meet: the rim score is
    // 0.75f + 0.10 and the spacer score is 1.0 − 0.75f, which are equal at
    // f = 0.6. An even 50/50 split is not a tie — it favours the spacer 0.63 to
    // 0.48, because a spot-up shooter accumulates three separate signals.
    const role = inferRole([
      ...makeShots(72, { ...RIM, shotType: "layup", complexShotType: "cutLayup", dribblesBefore: 0 }),
      ...makeShots(48, { ...CORNER, complexShotType: "catchAndShoot", dribblesBefore: 0 }),
    ]);

    expect(role.secondary).not.toBeNull();
    expect(role.label).toContain("/");
    expect(role.confidence).not.toBe("high");
  });

  it("flags a thin sample as low confidence", () => {
    const role = inferRole(
      makeShots(20, { ...CORNER, complexShotType: "catchAndShoot", dribblesBefore: 0 }),
    );
    expect(role.confidence).toBe("low");
  });

  it("always explains itself", () => {
    const role = inferRole(
      makeShots(200, { ...RIM, shotType: "layup", complexShotType: "lob", dribblesBefore: 0 }),
    );

    expect(role.evidence.length).toBeGreaterThanOrEqual(3);
    expect(role.evidence.every((line) => /\d+%/.test(line))).toBe(true);
  });

  it("survives an empty shot list", () => {
    expect(() => inferRole([])).not.toThrow();
    expect(inferRole([]).confidence).toBe("low");
  });
});

/**
 * The classifier has no ground truth to be scored against — there are no role
 * labels in the data. What can be checked is that it separates the roster the way
 * the shot profiles plainly imply, and that it declines to commit where the
 * profile genuinely straddles two roles.
 */
describe("the real roster", () => {
  let byName: Map<string, Shot[]>;

  beforeAll(() => {
    const csv = readFileSync(
      resolve(__dirname, "../../../data/raw/shots.csv"),
      "utf8",
    );
    byName = new Map();
    for (const shot of parseShotsCsv(csv).shots) {
      const list = byName.get(shot.shooterName) ?? [];
      list.push(shot);
      byName.set(shot.shooterName, list);
    }
  });

  it("calls the 0%-from-three, 50%-at-the-rim player a rim finisher, confidently", () => {
    const role = inferRole(byName.get("Player C")!);

    expect(role.archetype).toBe("rim_finisher");
    expect(role.confidence).toBe("high");
    expect(role.secondary).toBeNull();
  });

  it("calls the 69%-from-three, 39%-on-the-move player a movement shooter", () => {
    expect(inferRole(byName.get("Player A")!).archetype).toBe("movement_shooter");
  });

  it("groups the stationary shooters together", () => {
    for (const name of ["Player B", "Player H", "Player G"]) {
      expect(inferRole(byName.get(name)!).archetype).toBe("floor_spacer");
    }
  });

  it("groups the off-the-dribble players together", () => {
    for (const name of ["Player E", "Player D", "Player I", "Player F"]) {
      expect(inferRole(byName.get(name)!).archetype).toBe("on_ball_creator");
    }
  });

  it("declines to commit on the two genuinely hybrid profiles", () => {
    // Player L: 43% at the rim AND 31% from three. Player K: creates off the
    // dribble AND spots up. Forcing either into one bucket would be false
    // precision.
    for (const name of ["Player L", "Player K"]) {
      expect(inferRole(byName.get(name)!).secondary).not.toBeNull();
    }
  });

  it("marks the 32-attempt player as low confidence", () => {
    expect(inferRole(byName.get("Player J")!).confidence).toBe("low");
  });
});
