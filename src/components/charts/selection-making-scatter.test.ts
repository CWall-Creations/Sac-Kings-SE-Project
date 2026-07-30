import { describe, expect, it } from "vitest";
import type { PlayerShotProfile } from "@/lib/analytics/profiles";
import { EMPTY_SPLIT } from "@/lib/analytics/metrics";
import { selectLabelledPlayers } from "./selection-making-scatter";

/**
 * Only the label-selection rule is unit tested here — it is the piece with real
 * branching, and it decides what a reader can identify without hovering.
 */

function profile(
  overrides: Partial<{
    id: string;
    attempts: number;
    shrunkDiff: number;
    expected: number;
  }> = {},
): PlayerShotProfile {
  const attempts = overrides.attempts ?? 500;

  return {
    shooterId: overrides.id ?? "p",
    shooterName: overrides.id ?? "p",
    split: { ...EMPTY_SPLIT, attempts },
    expectedPointsPerShot: overrides.expected ?? 1.0,
    pointsPerShotAboveExpected: overrides.shrunkDiff ?? 0,
    shrunkPointsPerShotAboveExpected: overrides.shrunkDiff ?? 0,
    pointsAboveExpected: 0,
    standardError: 0.03,
    isReliable: attempts >= 100,
    excludedAttempts: 0,
    gradedOutOfSample: true,
  };
}

const ROSTER = [
  profile({ id: "best-making", shrunkDiff: 0.2, expected: 1.0 }),
  profile({ id: "worst-making", shrunkDiff: -0.2, expected: 1.0 }),
  profile({ id: "best-selection", shrunkDiff: 0, expected: 1.2 }),
  profile({ id: "worst-selection", shrunkDiff: 0, expected: 0.9 }),
  profile({ id: "middle-1", shrunkDiff: 0.01, expected: 1.05 }),
  profile({ id: "middle-2", shrunkDiff: -0.01, expected: 1.04 }),
  profile({ id: "middle-3", shrunkDiff: 0.02, expected: 1.03 }),
];

describe("selectLabelledPlayers", () => {
  it("names the extremes of shot making and shot selection", () => {
    const labelled = selectLabelledPlayers(ROSTER, [], null);

    expect(labelled.has("best-making")).toBe(true);
    expect(labelled.has("worst-making")).toBe(true);
    expect(labelled.has("best-selection")).toBe(true);
    expect(labelled.has("worst-selection")).toBe(true);
  });

  it("leaves the middle of the pack to the table and the tooltip", () => {
    const labelled = selectLabelledPlayers(ROSTER, [], null);

    expect(labelled.has("middle-1")).toBe(false);
    expect(labelled.has("middle-2")).toBe(false);
    expect(labelled.has("middle-3")).toBe(false);
  });

  it("always names a small-sample player, so the caveat stays with the mark", () => {
    const roster = [...ROSTER, profile({ id: "sparse", attempts: 32 })];
    expect(selectLabelledPlayers(roster, [], null).has("sparse")).toBe(true);
  });

  it("names the selected player even if unremarkable", () => {
    const labelled = selectLabelledPlayers(ROSTER, ["middle-2"], null);
    expect(labelled.has("middle-2")).toBe(true);
  });

  it("names the hovered player", () => {
    const labelled = selectLabelledPlayers(ROSTER, [], "middle-3");
    expect(labelled.has("middle-3")).toBe(true);
  });

  it("keeps the label count well under the roster size", () => {
    expect(selectLabelledPlayers(ROSTER, [], null).size).toBeLessThan(
      ROSTER.length,
    );
  });

  it("handles an empty roster", () => {
    expect(selectLabelledPlayers([], [], null).size).toBe(0);
  });

  it("does not crash on a single player", () => {
    const labelled = selectLabelledPlayers([profile({ id: "solo" })], [], null);
    expect(labelled.has("solo")).toBe(true);
  });
});
