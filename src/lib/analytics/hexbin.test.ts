import { describe, expect, it } from "vitest";
import { makeShot, makeShots } from "@/lib/test/factories";
import {
  DEFAULT_HEX_RADIUS_FEET,
  binShots,
  hexPath,
  nearestHexCenter,
} from "./hexbin";

describe("nearestHexCenter", () => {
  it("returns the true nearest centre, not just the nearest row", () => {
    // Brute-force check against a dense sweep of candidate centres.
    const radius = 1.5;
    const dx = radius * Math.sqrt(3);
    const dy = radius * 1.5;

    for (let i = 0; i < 200; i += 1) {
      const point = { x: -47 + Math.random() * 47, y: -25 + Math.random() * 50 };
      const chosen = nearestHexCenter(point, radius);

      let bestDistance = Number.POSITIVE_INFINITY;
      for (let row = -20; row <= 20; row += 1) {
        const offset = (((row % 2) + 2) % 2) * 0.5;
        for (let column = -25; column <= 5; column += 1) {
          const x = (column + offset) * dx;
          const y = row * dy;
          bestDistance = Math.min(
            bestDistance,
            (point.x - x) ** 2 + (point.y - y) ** 2,
          );
        }
      }

      const chosenDistance =
        (point.x - chosen.x) ** 2 + (point.y - chosen.y) ** 2;
      expect(chosenDistance).toBeCloseTo(bestDistance, 8);
    }
  });

  it("is stable: a centre maps to itself", () => {
    const centre = nearestHexCenter({ x: -30, y: 7 });
    const again = nearestHexCenter({ x: centre.x, y: centre.y });

    expect(again.column).toBe(centre.column);
    expect(again.row).toBe(centre.row);
  });

  it("puts nearby shots in the same bin and distant shots in different bins", () => {
    const a = nearestHexCenter({ x: -30, y: 0 });
    const near = nearestHexCenter({ x: -30.1, y: 0.1 });
    const far = nearestHexCenter({ x: -20, y: 0 });

    expect(near).toEqual(a);
    expect(far.column).not.toBe(a.column);
  });
});

describe("binShots", () => {
  it("counts attempts and makes per bin", () => {
    const hexes = binShots([
      makeShot({ x: -30, y: 0, made: true }),
      makeShot({ x: -30, y: 0, made: false }),
      makeShot({ x: -30.05, y: 0.05, made: true }),
    ]);

    expect(hexes).toHaveLength(1);
    expect(hexes[0].attempts).toBe(3);
    expect(hexes[0].makes).toBe(2);
  });

  it("drops empty cells rather than emitting a full grid", () => {
    const hexes = binShots(makeShots(5, { x: -30, y: 0 }));
    expect(hexes).toHaveLength(1);
  });

  it("preserves every attempt across bins", () => {
    const shots = [
      ...makeShots(40, { x: -41.75, y: 0 }),
      ...makeShots(25, { x: -28, y: 10 }),
      ...makeShots(15, { x: -39, y: -23 }),
    ];

    const hexes = binShots(shots);
    const binned = hexes.reduce((total, hex) => total + hex.attempts, 0);

    expect(binned).toBe(shots.length);
  });

  it("colours a bin by the zone its shots actually came from", () => {
    // A bin straddling the corner three-point line, with most shots behind it.
    const hexes = binShots([
      ...makeShots(9, { x: -39, y: -22.4 }),
      makeShot({ x: -39, y: -21.9 }),
    ]);

    expect(hexes[0].zone).toBe("corner_3");
  });

  it("handles an empty input", () => {
    expect(binShots([])).toEqual([]);
  });

  it("produces coarser bins at a larger radius", () => {
    const shots = Array.from({ length: 300 }, () =>
      makeShot({ x: -47 + Math.random() * 30, y: -20 + Math.random() * 40 }),
    );

    expect(binShots(shots, 1).length).toBeGreaterThan(
      binShots(shots, 4).length,
    );
  });
});

describe("hexPath", () => {
  it("draws a closed six-sided path", () => {
    const path = hexPath(DEFAULT_HEX_RADIUS_FEET);

    expect(path.startsWith("M")).toBe(true);
    expect(path.endsWith("Z")).toBe(true);
    expect(path.match(/L/g)).toHaveLength(5);
  });

  it("scales with radius", () => {
    expect(hexPath(2)).not.toBe(hexPath(1));
  });
});
