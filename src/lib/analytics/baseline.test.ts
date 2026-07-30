import { describe, expect, it } from "vitest";
import { makeShot, makeShots, makeShotsWithRate } from "@/lib/test/factories";
import {
  BASELINE_SHRINKAGE_ATTEMPTS,
  buildBaseline,
  buildLeaveOnePlayerOutBaselines,
  expectedPointsPerShot,
  isChosenShot,
  shrinkTowardZero,
} from "./baseline";

/** A rim attempt and a mid-range attempt, for building contrasting samples. */
const RIM = { x: -41.75, y: 0 } as const;
const MIDRANGE = { x: -28, y: 0 } as const;

describe("isChosenShot", () => {
  it("excludes heaves and backcourt attempts", () => {
    expect(isChosenShot(makeShot({ shotType: "heave" }))).toBe(false);
    expect(isChosenShot(makeShot({ x: 10, y: 0 }))).toBe(false);
  });

  it("keeps ordinary attempts", () => {
    expect(isChosenShot(makeShot({ ...RIM, shotType: "layup" }))).toBe(true);
  });
});

describe("buildBaseline", () => {
  it("rates a zone the team shoots well above one it shoots badly", () => {
    const baseline = buildBaseline([
      ...makeShotsWithRate(400, 0.65, { ...RIM, shotType: "layup" }),
      ...makeShotsWithRate(400, 0.38, MIDRANGE),
    ]);

    const rim = baseline.expectedPointsPerShot("restricted_area", "lightly_contested");
    const mid = baseline.expectedPointsPerShot("midrange_short", "lightly_contested");

    expect(rim).toBeGreaterThan(mid);
    expect(rim).toBeCloseTo(1.3, 1);
  });

  it("falls back to the overall mean for a zone with no attempts", () => {
    const baseline = buildBaseline(makeShotsWithRate(200, 0.5, MIDRANGE));

    // Nothing was ever shot from the corner, so it inherits the global rate.
    expect(
      baseline.expectedPointsPerShot("corner_3", "uncontested"),
    ).toBeCloseTo(baseline.overallPointsPerShot);
  });

  it("shrinks a thin cell toward its zone instead of trusting it", () => {
    const shots = [
      // A big, average-shooting mid-range sample against light contest.
      ...makeShotsWithRate(500, 0.4, { ...MIDRANGE, contestLevel: "lightly_contested" }),
      // A tiny uncontested cell where every attempt happened to go in.
      ...makeShots(4, { ...MIDRANGE, contestLevel: "uncontested", made: true }),
    ];

    const baseline = buildBaseline(shots);
    const thinCell = baseline.expectedPointsPerShot("midrange_short", "uncontested");

    // The raw cell rate is 2.00 PPS. Shrinkage must pull it most of the way back
    // to the zone's ~0.80, or four lucky attempts would define the cell.
    expect(thinCell).toBeLessThan(1.0);
    expect(thinCell).toBeGreaterThan(0.75);
  });

  it("barely moves a cell that carries real volume", () => {
    const heavy = buildBaseline(
      makeShotsWithRate(2000, 0.6, { ...RIM, shotType: "layup" }),
    ).expectedPointsPerShot("restricted_area", "lightly_contested");

    // 2,000 attempts at 1.20 PPS should survive a prior worth 50 attempts.
    expect(heavy).toBeCloseTo(1.2, 1);
  });

  it("ignores heaves when fitting", () => {
    const withoutHeaves = buildBaseline(makeShotsWithRate(200, 0.5, MIDRANGE));
    const withHeaves = buildBaseline([
      ...makeShotsWithRate(200, 0.5, MIDRANGE),
      ...makeShots(50, { ...MIDRANGE, shotType: "heave", made: false }),
    ]);

    expect(withHeaves.attempts).toBe(withoutHeaves.attempts);
    expect(withHeaves.overallPointsPerShot).toBeCloseTo(
      withoutHeaves.overallPointsPerShot,
    );
  });
});

describe("buildLeaveOnePlayerOutBaselines", () => {
  it("matches a baseline rebuilt from scratch without that player", () => {
    const shots = [
      ...makeShotsWithRate(300, 0.65, { ...RIM, shooterId: "a", shotType: "layup" }),
      ...makeShotsWithRate(300, 0.35, { ...MIDRANGE, shooterId: "b" }),
      ...makeShotsWithRate(200, 0.5, { ...MIDRANGE, shooterId: "c" }),
    ];

    const looBaselines = buildLeaveOnePlayerOutBaselines(shots);

    // The subtraction trick must produce exactly what a full recompute would.
    for (const shooterId of ["a", "b", "c"]) {
      const bruteForce = buildBaseline(
        shots.filter((shot) => shot.shooterId !== shooterId),
      );
      const incremental = looBaselines.get(shooterId)!;

      expect(incremental.attempts).toBe(bruteForce.attempts);
      expect(incremental.overallPointsPerShot).toBeCloseTo(
        bruteForce.overallPointsPerShot,
        10,
      );
      expect(
        incremental.expectedPointsPerShot("midrange_short", "lightly_contested"),
      ).toBeCloseTo(
        bruteForce.expectedPointsPerShot("midrange_short", "lightly_contested"),
        10,
      );
    }
  });

  it("does not let a player influence their own expectation", () => {
    // One player shoots the mid-range far better than everyone else.
    const shots = [
      ...makeShotsWithRate(100, 0.75, { ...MIDRANGE, shooterId: "hot" }),
      ...makeShotsWithRate(600, 0.35, { ...MIDRANGE, shooterId: "rest" }),
    ];

    const baselines = buildLeaveOnePlayerOutBaselines(shots);
    const hotShots = shots.filter((shot) => shot.shooterId === "hot");

    const looExpectation = expectedPointsPerShot(
      hotShots,
      baselines.get("hot")!,
    );
    const inSampleExpectation = expectedPointsPerShot(
      hotShots,
      buildBaseline(shots),
    );

    // Grading in-sample drags the bar up toward the hot player's own rate,
    // understating how far above the team they actually shot.
    expect(looExpectation).toBeLessThan(inSampleExpectation);
  });

  it("falls back to the full sample when removing the player leaves nothing", () => {
    // The slice a single-player filter produces. Without a floor this yields a
    // baseline of zero attempts, an expected value of 0, and a difference equal
    // to the player's entire scoring rate.
    const shots = makeShotsWithRate(200, 0.45, { ...MIDRANGE, shooterId: "solo" });

    const baseline = buildLeaveOnePlayerOutBaselines(shots).get("solo")!;

    expect(baseline.attempts).toBe(200);
    expect(baseline.excludesGradedPlayer).toBe(false);
    expect(baseline.overallPointsPerShot).toBeCloseTo(0.9, 2);

    // And the resulting difference is near zero rather than the whole rate.
    const expectation = expectedPointsPerShot(shots, baseline);
    expect(expectation).toBeGreaterThan(0.8);
    expect(Math.abs(0.9 - expectation)).toBeLessThan(0.05);
  });

  it("marks a genuine leave-one-out baseline as out-of-sample", () => {
    const shots = [
      ...makeShotsWithRate(300, 0.5, { ...MIDRANGE, shooterId: "a" }),
      ...makeShotsWithRate(300, 0.4, { ...MIDRANGE, shooterId: "b" }),
    ];

    expect(
      buildLeaveOnePlayerOutBaselines(shots).get("a")!.excludesGradedPlayer,
    ).toBe(true);
  });

  it("survives a player who is the only shooter in a cell", () => {
    const shots = [
      ...makeShots(10, { ...RIM, shooterId: "only", contestLevel: "uncontested", made: true }),
      ...makeShotsWithRate(200, 0.4, { ...MIDRANGE, shooterId: "other" }),
    ];

    const baseline = buildLeaveOnePlayerOutBaselines(shots).get("only")!;
    const expectation = baseline.expectedPointsPerShot(
      "restricted_area",
      "uncontested",
    );

    // With their own attempts removed the cell is empty, so the estimate must
    // fall back rather than divide by zero.
    expect(Number.isFinite(expectation)).toBe(true);
    expect(expectation).toBeGreaterThan(0);
  });
});

describe("shrinkTowardZero", () => {
  it("leaves a large sample essentially untouched", () => {
    expect(shrinkTowardZero(0.1, 5000)).toBeCloseTo(0.1, 2);
  });

  it("halves a difference at the prior weight", () => {
    expect(shrinkTowardZero(0.2, BASELINE_SHRINKAGE_ATTEMPTS)).toBeCloseTo(0.1);
  });

  it("pulls a small sample most of the way to zero", () => {
    // The 32-attempt player: a raw -0.24 should not outrank a full season.
    expect(Math.abs(shrinkTowardZero(-0.24, 32))).toBeLessThan(0.1);
  });

  it("returns zero for no attempts", () => {
    expect(shrinkTowardZero(0.5, 0)).toBe(0);
  });

  it("preserves sign", () => {
    expect(shrinkTowardZero(-0.3, 100)).toBeLessThan(0);
    expect(shrinkTowardZero(0.3, 100)).toBeGreaterThan(0);
  });
});

describe("expectedPointsPerShot", () => {
  it("is zero for an empty set", () => {
    expect(expectedPointsPerShot([], buildBaseline(makeShots(10)))).toBe(0);
  });

  it("rises when a player shifts their diet to better zones", () => {
    const league = [
      ...makeShotsWithRate(500, 0.65, { ...RIM, shotType: "layup" }),
      ...makeShotsWithRate(500, 0.38, MIDRANGE),
    ];
    const baseline = buildBaseline(league);

    const rimDiet = expectedPointsPerShot(
      makeShots(50, { ...RIM, shotType: "layup" }),
      baseline,
    );
    const midDiet = expectedPointsPerShot(makeShots(50, MIDRANGE), baseline);

    expect(rimDiet).toBeGreaterThan(midDiet);
  });
});
