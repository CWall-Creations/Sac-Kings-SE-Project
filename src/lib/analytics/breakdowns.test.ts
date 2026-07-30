import { describe, expect, it } from "vitest";
import { makeShots, makeShotsWithRate } from "@/lib/test/factories";
import { buildContextBreakdowns, maxPointsPerShot } from "./breakdowns";

const RIM = { x: -41.75, y: 0 } as const;
const MIDRANGE = { x: -28, y: 0 } as const;

function dimension(id: string, shots: Parameters<typeof buildContextBreakdowns>[0]) {
  return buildContextBreakdowns(shots).find((entry) => entry.id === id)!;
}

describe("buildContextBreakdowns", () => {
  it("covers the four situational dimensions", () => {
    const ids = buildContextBreakdowns(makeShots(10)).map((entry) => entry.id);
    expect(ids).toEqual(["contest", "shot-clock", "dribbles", "shot-type"]);
  });

  it("keeps buckets in their canonical order, not sorted by value", () => {
    // Uncontested shoots best here, but must still come first.
    const contest = dimension("contest", [
      ...makeShotsWithRate(50, 0.3, { ...MIDRANGE, contestLevel: "heavily_contested" }),
      ...makeShotsWithRate(50, 0.7, { ...MIDRANGE, contestLevel: "uncontested" }),
    ]);

    expect(contest.buckets.map((bucket) => bucket.key)).toEqual([
      "uncontested",
      "lightly_contested",
      "heavily_contested",
    ]);
  });

  it("keeps empty buckets so panels do not change shape as filters narrow", () => {
    const contest = dimension(
      "contest",
      makeShots(20, { contestLevel: "uncontested" }),
    );

    expect(contest.buckets).toHaveLength(3);
    const empty = contest.buckets.find((b) => b.key === "heavily_contested")!;
    expect(empty.split.attempts).toBe(0);
    expect(empty.split.pointsPerShot).toBe(0);
  });

  it("computes each bucket's share of the slice", () => {
    const contest = dimension("contest", [
      ...makeShots(30, { contestLevel: "uncontested" }),
      ...makeShots(10, { contestLevel: "heavily_contested" }),
    ]);

    const uncontested = contest.buckets.find((b) => b.key === "uncontested")!;
    expect(uncontested.shareOfAttempts).toBeCloseTo(0.75);
  });

  it("reports the reference series when one is supplied", () => {
    const player = makeShotsWithRate(40, 0.6, {
      ...MIDRANGE,
      contestLevel: "heavily_contested",
    });
    const team = makeShotsWithRate(400, 0.35, {
      ...MIDRANGE,
      contestLevel: "heavily_contested",
    });

    const contest = buildContextBreakdowns(player, team).find(
      (entry) => entry.id === "contest",
    )!;
    const heavy = contest.buckets.find((b) => b.key === "heavily_contested")!;

    expect(heavy.split.pointsPerShot).toBeCloseTo(1.2, 1);
    expect(heavy.referencePointsPerShot).toBeCloseTo(0.7, 1);
  });

  it("reports a null reference rather than zero where the team never shot", () => {
    const contest = buildContextBreakdowns(
      makeShots(10, { contestLevel: "uncontested" }),
      makeShots(10, { contestLevel: "heavily_contested" }),
    ).find((entry) => entry.id === "contest")!;

    const uncontested = contest.buckets.find((b) => b.key === "uncontested")!;
    expect(uncontested.referencePointsPerShot).toBeNull();
  });

  it("has no reference at all when none is supplied", () => {
    const contest = dimension("contest", makeShots(10));
    expect(
      contest.buckets.every((b) => b.referencePointsPerShot === null),
    ).toBe(true);
  });

  it("handles an empty slice without dividing by zero", () => {
    const breakdowns = buildContextBreakdowns([]);

    expect(breakdowns).toHaveLength(4);
    for (const breakdown of breakdowns) {
      expect(breakdown.buckets.every((b) => b.shareOfAttempts === 0)).toBe(true);
      expect(
        breakdown.buckets.every((b) => Number.isFinite(b.split.pointsPerShot)),
      ).toBe(true);
    }
  });

  it("separates shots by dribble bucket", () => {
    const dribbles = dimension("dribbles", [
      ...makeShots(10, { dribblesBefore: 0 }),
      ...makeShots(10, { dribblesBefore: 2 }),
      ...makeShots(10, { dribblesBefore: 5 }),
      ...makeShots(10, { dribblesBefore: 9 }),
    ]);

    expect(dribbles.buckets.map((b) => b.split.attempts)).toEqual([
      10, 10, 10, 10,
    ]);
  });
});

describe("maxPointsPerShot", () => {
  it("spans every bucket so panels share one scale", () => {
    const breakdowns = buildContextBreakdowns([
      ...makeShotsWithRate(100, 0.7, { ...RIM, shotType: "layup" }),
      ...makeShotsWithRate(100, 0.3, MIDRANGE),
    ]);

    // The layup bucket is the tallest bar anywhere in the set.
    expect(maxPointsPerShot(breakdowns)).toBeCloseTo(1.4, 1);
  });

  it("includes the reference series in the scale", () => {
    const breakdowns = buildContextBreakdowns(
      makeShotsWithRate(50, 0.2, MIDRANGE),
      makeShotsWithRate(50, 0.9, { ...RIM, shotType: "layup" }),
    );

    expect(maxPointsPerShot(breakdowns)).toBeGreaterThan(1.5);
  });

  it("never collapses to zero on an empty slice", () => {
    expect(maxPointsPerShot(buildContextBreakdowns([]))).toBeGreaterThanOrEqual(1);
  });
});
