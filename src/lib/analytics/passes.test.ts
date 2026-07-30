import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { parseShotsCsv } from "@/lib/data/pipeline";
import type { Shot } from "@/lib/data/types";
import { makeShot, makeShots } from "@/lib/test/factories";
import { RIM } from "./court";
import {
  analysePassOrigins,
  bestOrigin,
  classifyPassOrigin,
  withPassOrigins,
  worstOrigin,
} from "./passes";

describe("classifyPassOrigin", () => {
  it("puts a pass from under the basket in the paint", () => {
    expect(classifyPassOrigin({ x: RIM.x + 2, y: 1 })).toBe("paint");
  });

  it("puts a pass from the drive lane in the mid-range", () => {
    expect(classifyPassOrigin({ x: RIM.x + 14, y: 4 })).toBe("midrange");
  });

  it("distinguishes the corner, wing and top behind the arc", () => {
    expect(classifyPassOrigin({ x: RIM.x + 2, y: -23 })).toBe("corner");
    expect(classifyPassOrigin({ x: RIM.x + 14, y: -20 })).toBe("wing");
    expect(classifyPassOrigin({ x: RIM.x + 25, y: 1 })).toBe("top");
  });

  it("calls a long frontcourt pass deep rather than a swing from the top", () => {
    expect(classifyPassOrigin({ x: RIM.x + 34, y: 0 })).toBe("deep");
  });

  it("calls a pass from the offence's own half a backcourt pass", () => {
    expect(classifyPassOrigin({ x: 12, y: 0 })).toBe("backcourt");
    // Out of bounds behind the defensive baseline is still backcourt.
    expect(classifyPassOrigin({ x: 46, y: 20 })).toBe("backcourt");
  });

  it("handles an inbounds pass from behind the offensive baseline", () => {
    // Out of bounds under the basket the offence is attacking.
    expect(classifyPassOrigin({ x: -48, y: 4 })).toBe("paint");
  });
});

describe("withPassOrigins", () => {
  it("skips shots that had no pass rather than inventing an origin", () => {
    const paired = withPassOrigins([
      makeShot({ passerX: -30, passerY: 5 }),
      makeShot({ passerX: null, passerY: null }),
    ]);

    expect(paired).toHaveLength(1);
    expect(paired[0].passer).toEqual({ x: -30, y: 5 });
  });

  it("returns an empty list for an empty input", () => {
    expect(withPassOrigins([])).toEqual([]);
  });
});

describe("analysePassOrigins", () => {
  it("holds the shot zone fixed so origin is the only thing varying", () => {
    const analysis = analysePassOrigins(
      [
        ...makeShots(50, { x: -39, y: -23, passerX: -30, passerY: 0, made: true }),
        // A different zone entirely; must not be counted.
        ...makeShots(50, { x: -41.75, y: 0, shotType: "layup", passerX: -30, passerY: 0 }),
      ],
      "corner_3",
    );

    expect(analysis.selectionAttempts).toBe(50);
    expect(analysis.passed).toHaveLength(50);
  });

  it("compares each origin to the selection's own rate, not to all shots", () => {
    const analysis = analysePassOrigins(
      [
        // Corner threes fed from the mid-range, all made.
        ...makeShots(40, { x: -39, y: -23, passerX: -30, passerY: 2, made: true }),
        // Corner threes fed from the top, all missed.
        ...makeShots(40, { x: -39, y: -23, passerX: -18, passerY: 0, made: false }),
      ],
      "corner_3",
    );

    const midrange = analysis.origins.find((o) => o.origin === "midrange")!;
    const top = analysis.origins.find((o) => o.origin === "top")!;

    expect(analysis.selectionPointsPerShot).toBeCloseTo(1.5);
    expect(midrange.pointsPerShotVsSelection).toBeCloseTo(1.5);
    expect(top.pointsPerShotVsSelection).toBeCloseTo(-1.5);
    expect(midrange.shareOfPassed).toBeCloseTo(0.5);
  });

  it("counts shots with no pass separately instead of dropping them", () => {
    const analysis = analysePassOrigins(
      [
        ...makeShots(30, { x: -39, y: -23, passerX: -30, passerY: 0 }),
        ...makeShots(10, { x: -39, y: -23, passerX: null, passerY: null }),
      ],
      "corner_3",
    );

    expect(analysis.selectionAttempts).toBe(40);
    expect(analysis.passed).toHaveLength(30);
    expect(analysis.unpassedAttempts).toBe(10);
  });

  it("returns every origin so the table does not change shape", () => {
    const analysis = analysePassOrigins(
      makeShots(20, { x: -39, y: -23, passerX: -30, passerY: 0 }),
      "corner_3",
    );

    expect(analysis.origins).toHaveLength(7);
    const empty = analysis.origins.find((o) => o.origin === "backcourt")!;
    expect(empty.split.attempts).toBe(0);
    expect(empty.pointsPerShotVsSelection).toBe(0);
  });

  it("handles a zone with no shots at all", () => {
    const analysis = analysePassOrigins(makeShots(10, { x: -41.75, y: 0 }), "corner_3");

    expect(analysis.selectionAttempts).toBe(0);
    expect(analysis.origins.every((o) => o.shareOfPassed === 0)).toBe(true);
    expect(Number.isFinite(analysis.selectionPointsPerShot)).toBe(true);
  });
});

describe("bestOrigin and worstOrigin", () => {
  it("ignore origins below the attempt floor", () => {
    const analysis = analysePassOrigins(
      [
        ...makeShots(80, { x: -39, y: -23, passerX: -30, passerY: 2, made: false }),
        // A three-attempt fluke that must not be reported as the best origin.
        ...makeShots(3, { x: -39, y: -23, passerX: -18, passerY: 0, made: true }),
      ],
      "corner_3",
    );

    expect(bestOrigin(analysis, 40)?.origin).toBe("midrange");
  });

  it("return null when nothing clears the floor", () => {
    const analysis = analysePassOrigins(
      makeShots(5, { x: -39, y: -23, passerX: -30, passerY: 0 }),
      "corner_3",
    );

    expect(bestOrigin(analysis, 40)).toBeNull();
    expect(worstOrigin(analysis, 40)).toBeNull();
  });
});

/**
 * The finding this view exists for, asserted against the real extract so a
 * refactor cannot quietly change what the dashboard claims.
 */
describe("the real dataset", () => {
  let shots: Shot[];

  beforeAll(() => {
    shots = parseShotsCsv(
      readFileSync(resolve(__dirname, "../../../data/raw/shots.csv"), "utf8"),
    ).shots;
  });

  it("shows kick-outs creating far better corner threes than swings from the top", () => {
    const analysis = analysePassOrigins(shots, "corner_3");
    const midrange = analysis.origins.find((o) => o.origin === "midrange")!;
    const top = analysis.origins.find((o) => o.origin === "top")!;

    expect(midrange.split.attempts).toBe(408);
    expect(midrange.split.pointsPerShot).toBeCloseTo(1.33, 2);
    expect(top.split.pointsPerShot).toBeCloseTo(0.99, 2);
    // The gap is the point: same shot, different creation.
    expect(midrange.split.pointsPerShot - top.split.pointsPerShot).toBeGreaterThan(
      0.3,
    );
  });

  it("shows the paint kick-out helping the corner but hurting the wing", () => {
    const corner = analysePassOrigins(shots, "corner_3").origins.find(
      (o) => o.origin === "paint",
    )!;
    const wing = analysePassOrigins(shots, "wing_3").origins.find(
      (o) => o.origin === "paint",
    )!;

    expect(corner.split.pointsPerShot).toBeGreaterThan(1.1);
    expect(wing.split.pointsPerShot).toBeLessThan(0.9);
  });

  it("finds a passer for the great majority of attempts", () => {
    const analysis = analysePassOrigins(shots, null);
    expect(analysis.passed).toHaveLength(7978);
    expect(analysis.unpassedAttempts).toBe(838);
  });
});
