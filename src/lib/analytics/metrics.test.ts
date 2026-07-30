import { describe, expect, it } from "vitest";
import { makeShot } from "@/lib/test/factories";
import {
  EMPTY_SPLIT,
  groupBy,
  hasEnoughAttempts,
  pointsPerShotStandardError,
  summarise,
  summariseBy,
} from "./metrics";

describe("summarise", () => {
  it("returns a zeroed split for no attempts rather than NaN", () => {
    expect(summarise([])).toEqual(EMPTY_SPLIT);
    expect(Number.isNaN(summarise([]).pointsPerShot)).toBe(false);
  });

  it("counts points by shot value, not by makes", () => {
    const split = summarise([
      makeShot({ x: -20, y: 0, made: true }), // two
      makeShot({ x: 0, y: 0, made: true }), // three
      makeShot({ x: -20, y: 0, made: false }),
    ]);

    expect(split.attempts).toBe(3);
    expect(split.makes).toBe(2);
    expect(split.points).toBe(5);
    expect(split.fieldGoalPct).toBeCloseTo(2 / 3);
    expect(split.pointsPerShot).toBeCloseTo(5 / 3);
  });

  it("weights a made three as 1.5 makes in eFG%", () => {
    const twos = summarise([
      makeShot({ x: -20, y: 0, made: true }),
      makeShot({ x: -20, y: 0, made: false }),
    ]);
    const threes = summarise([
      makeShot({ x: 0, y: 0, made: true }),
      makeShot({ x: 0, y: 0, made: false }),
    ]);

    expect(twos.fieldGoalPct).toBeCloseTo(threes.fieldGoalPct);
    expect(twos.effectiveFieldGoalPct).toBeCloseTo(0.5);
    expect(threes.effectiveFieldGoalPct).toBeCloseTo(0.75);
  });

  it("reports contextual rates so the free-throw gap stays visible", () => {
    const split = summarise([
      makeShot({ fouled: true, blocked: false, assisted: true }),
      makeShot({ fouled: false, blocked: true, assisted: false }),
      makeShot({ fouled: false, blocked: false, assisted: false }),
      makeShot({ fouled: false, blocked: false, assisted: false }),
    ]);

    expect(split.foulRate).toBeCloseTo(0.25);
    expect(split.blockRate).toBeCloseTo(0.25);
    expect(split.assistedRate).toBeCloseTo(0.25);
  });
});

describe("groupBy", () => {
  it("preserves first-seen key order, which chart axes depend on", () => {
    const shots = [
      makeShot({ shooterName: "B" }),
      makeShot({ shooterName: "A" }),
      makeShot({ shooterName: "B" }),
    ];

    const groups = groupBy(shots, (shot) => shot.shooterName);

    expect([...groups.keys()]).toEqual(["B", "A"]);
    expect(groups.get("B")).toHaveLength(2);
  });
});

describe("summariseBy", () => {
  it("summarises each group independently", () => {
    const splits = summariseBy(
      [
        makeShot({ shooterName: "A", made: true, x: -20, y: 0 }),
        makeShot({ shooterName: "A", made: false, x: -20, y: 0 }),
        makeShot({ shooterName: "B", made: true, x: -20, y: 0 }),
      ],
      (shot) => shot.shooterName,
    );

    expect(splits.get("A")?.fieldGoalPct).toBeCloseTo(0.5);
    expect(splits.get("B")?.fieldGoalPct).toBeCloseTo(1);
  });
});

describe("hasEnoughAttempts", () => {
  it("draws the line at 25 attempts", () => {
    expect(hasEnoughAttempts({ ...EMPTY_SPLIT, attempts: 24 })).toBe(false);
    expect(hasEnoughAttempts({ ...EMPTY_SPLIT, attempts: 25 })).toBe(true);
  });
});

describe("pointsPerShotStandardError", () => {
  it("is zero when there is nothing to vary", () => {
    expect(pointsPerShotStandardError([])).toBe(0);
    expect(pointsPerShotStandardError([makeShot({ made: true })])).toBe(0);
  });

  it("shrinks as the sample grows", () => {
    const shot = () => makeShot({ x: -20, y: 0, made: Math.random() < 0.5 });
    const small = pointsPerShotStandardError(
      Array.from({ length: 20 }, shot),
    );
    const large = pointsPerShotStandardError(
      Array.from({ length: 2000 }, shot),
    );

    expect(large).toBeLessThan(small);
  });
});
