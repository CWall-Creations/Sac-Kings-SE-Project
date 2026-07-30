import { describe, expect, it } from "vitest";
import { RIM, isThreePointAttempt } from "./court";
import {
  COURT_ZONES,
  angleFromRim,
  classifySide,
  classifyZone,
  isThreePointZone,
} from "./zones";

describe("classifyZone", () => {
  const cases: Array<[string, { x: number; y: number }, string]> = [
    ["a dunk", { x: RIM.x, y: 0 }, "restricted_area"],
    ["a 6 ft floater", { x: RIM.x + 6, y: 0 }, "close_range"],
    ["a 12 ft pull-up", { x: RIM.x + 12, y: 0 }, "midrange_short"],
    ["a 20 ft two", { x: RIM.x + 20, y: 2 }, "midrange_long"],
    ["a corner three", { x: RIM.x + 3, y: -23 }, "corner_3"],
    ["a wing three", { x: RIM.x + 14, y: -20 }, "wing_3"],
    ["a top-of-key three", { x: RIM.x + 25, y: 1 }, "above_break_3"],
  ];

  it.each(cases)("puts %s in %s", (_label, point, expected) => {
    expect(classifyZone(point)).toBe(expected);
  });

  it("assigns every zone a distinct label and covers the full enum", () => {
    expect(new Set(COURT_ZONES).size).toBe(COURT_ZONES.length);
    const assigned = new Set(cases.map(([, , zone]) => zone));
    expect(assigned).toEqual(new Set(COURT_ZONES));
  });

  it("never disagrees with the shot-value geometry about what is a three", () => {
    // Sweep the offensive half on a 1 ft grid. `isThreePointAttempt` and the
    // zone enum are reached by different code paths, so any divergence means one
    // of the two has drifted.
    for (let x = -47; x <= 0; x += 1) {
      for (let y = -25; y <= 25; y += 1) {
        const point = { x, y };
        expect(isThreePointZone(classifyZone(point))).toBe(
          isThreePointAttempt(point),
        );
      }
    }
  });
});

describe("angleFromRim", () => {
  it("is 0 straight out from the rim and ±90 along the baseline", () => {
    expect(angleFromRim({ x: RIM.x + 20, y: 0 })).toBeCloseTo(0);
    expect(angleFromRim({ x: RIM.x, y: 10 })).toBeCloseTo(90);
    expect(angleFromRim({ x: RIM.x, y: -10 })).toBeCloseTo(-90);
  });
});

describe("classifySide", () => {
  it("treats a band around the midline as center", () => {
    expect(classifySide({ x: -30, y: 0 })).toBe("center");
    expect(classifySide({ x: -30, y: 1.9 })).toBe("center");
  });

  it("splits the floor outside that band", () => {
    expect(classifySide({ x: -30, y: -10 })).toBe("left");
    expect(classifySide({ x: -30, y: 10 })).toBe("right");
  });
});
