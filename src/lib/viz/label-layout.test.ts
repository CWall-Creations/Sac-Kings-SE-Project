import { describe, expect, it } from "vitest";
import { spreadVertically } from "./label-layout";

const BOUNDS = { min: 0, max: 300 };

describe("spreadVertically", () => {
  it("leaves well-separated labels alone", () => {
    const result = spreadVertically([10, 50, 100], 12, BOUNDS);

    expect(result.positions).toEqual([10, 50, 100]);
    expect(result.adjusted).toBe(false);
  });

  it("separates overlapping labels by at least the minimum gap", () => {
    const result = spreadVertically([100, 102, 104, 106], 12, BOUNDS);

    expect(result.adjusted).toBe(true);
    const sorted = [...result.positions].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(12 - 1e-9);
    }
  });

  it("returns positions in input order, not sorted order", () => {
    const result = spreadVertically([200, 100, 150], 12, BOUNDS);

    // Input order preserved: the first entry is still the lowest on screen.
    expect(result.positions[0]).toBeGreaterThan(result.positions[2]);
    expect(result.positions[2]).toBeGreaterThan(result.positions[1]);
  });

  it("preserves the relative order of the labels", () => {
    const desired = [140, 141, 142, 143, 144, 145];
    const result = spreadVertically(desired, 14, BOUNDS);

    for (let i = 1; i < result.positions.length; i += 1) {
      expect(result.positions[i]).toBeGreaterThan(result.positions[i - 1]);
    }
  });

  it("stays inside the bounds when the block would overflow the bottom", () => {
    // Six labels needing 14px each, all crowded near the bottom edge.
    const result = spreadVertically([290, 292, 294, 296, 298, 299], 14, BOUNDS);

    expect(Math.max(...result.positions)).toBeLessThanOrEqual(BOUNDS.max + 1e-9);
    expect(Math.min(...result.positions)).toBeGreaterThanOrEqual(
      BOUNDS.min - 1e-9,
    );
  });

  it("respects the upper bound when labels crowd the top", () => {
    const result = spreadVertically([0, 1, 2], 12, BOUNDS);

    expect(Math.min(...result.positions)).toBeGreaterThanOrEqual(
      BOUNDS.min - 1e-9,
    );
  });

  it("handles the degenerate cases", () => {
    expect(spreadVertically([], 12, BOUNDS)).toEqual({
      positions: [],
      adjusted: false,
    });
    expect(spreadVertically([42], 12, BOUNDS).positions).toEqual([42]);
  });

  it("is deterministic across calls", () => {
    const desired = [100, 101, 108, 120, 121, 122];
    const first = spreadVertically(desired, 13, BOUNDS);
    const second = spreadVertically(desired, 13, BOUNDS);

    expect(first.positions).toEqual(second.positions);
  });
});
