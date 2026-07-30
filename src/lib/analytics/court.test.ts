import { describe, expect, it } from "vitest";
import {
  CORNER_THREE_ARC_BREAK_OFFSET,
  RIM,
  distanceFromRim,
  isBackcourtShot,
  isThreePointAttempt,
  shotValue,
} from "./court";

describe("rim placement", () => {
  it("sits 5.25 ft inside the baseline, not on it", () => {
    expect(RIM.x).toBe(-41.75);
    expect(RIM.y).toBe(0);
  });

  it("agrees with where the dataset's layups actually cluster", () => {
    // Median layup in shots.csv is (-40.36, -0.19); a rim placed on the baseline
    // would put the typical layup 6+ ft from the hoop.
    expect(distanceFromRim({ x: -40.36, y: -0.19 })).toBeLessThan(1.5);
  });
});

describe("distanceFromRim", () => {
  it("is zero at the rim", () => {
    expect(distanceFromRim(RIM)).toBe(0);
  });

  it("measures straight-line distance in feet", () => {
    expect(distanceFromRim({ x: RIM.x + 3, y: 4 })).toBeCloseTo(5);
  });
});

describe("isThreePointAttempt", () => {
  it("treats the arc as a radius from the rim, not from the baseline", () => {
    expect(isThreePointAttempt({ x: RIM.x + 23.8, y: 0 })).toBe(true);
    expect(isThreePointAttempt({ x: RIM.x + 23.7, y: 0 })).toBe(false);
  });

  it("uses the sideline distance in the corner, where the line is straight", () => {
    // Deep in the corner, 22.5 ft from the midline: only 22.6 ft from the rim,
    // so an arc-radius test would wrongly call this a two.
    const deepCorner = { x: RIM.x + 2, y: -22.5 };
    expect(distanceFromRim(deepCorner)).toBeLessThan(23.75);
    expect(isThreePointAttempt(deepCorner)).toBe(true);
  });

  it("keeps shots inside the corner line as twos", () => {
    expect(isThreePointAttempt({ x: RIM.x + 2, y: 21 })).toBe(false);
  });

  it("switches from the corner rule to the arc past the break", () => {
    // Just past the break, the corner rule no longer applies; the arc governs.
    const pastBreak = { x: RIM.x + CORNER_THREE_ARC_BREAK_OFFSET + 4, y: 20 };
    expect(isThreePointAttempt(pastBreak)).toBe(
      distanceFromRim(pastBreak) >= 23.75,
    );
  });

  it("counts the arc itself as a three", () => {
    expect(isThreePointAttempt({ x: RIM.x + 23.75, y: 0 })).toBe(true);
  });
});

describe("shotValue", () => {
  it("is 2 at the rim and 3 from deep", () => {
    expect(shotValue(RIM)).toBe(2);
    expect(shotValue({ x: 0, y: 0 })).toBe(3);
  });
});

describe("court predicates", () => {
  it("flags shots released past half court", () => {
    expect(isBackcourtShot({ x: 5, y: 0 })).toBe(true);
    expect(isBackcourtShot({ x: -5, y: 0 })).toBe(false);
  });

});
