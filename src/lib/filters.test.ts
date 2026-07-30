import { describe, expect, it } from "vitest";
import { makeShot, makeShots } from "@/lib/test/factories";
import {
  EMPTY_FILTERS,
  activeFilterCount,
  applyFilters,
  hasActiveFilters,
  selectedPlayerId,
} from "./filters";

describe("applyFilters", () => {
  const shots = [
    makeShot({ shooterId: "a", contestLevel: "uncontested", shotType: "layup" }),
    makeShot({ shooterId: "a", contestLevel: "heavily_contested", shotType: "jumper" }),
    makeShot({ shooterId: "b", contestLevel: "uncontested", shotType: "jumper" }),
  ];

  it("returns everything when no constraint is set", () => {
    expect(applyFilters(shots, EMPTY_FILTERS)).toHaveLength(3);
  });

  it("combines values within a dimension with OR", () => {
    const result = applyFilters(shots, {
      ...EMPTY_FILTERS,
      contestLevels: ["uncontested", "heavily_contested"],
    });
    expect(result).toHaveLength(3);
  });

  it("combines dimensions with AND", () => {
    const result = applyFilters(shots, {
      ...EMPTY_FILTERS,
      playerIds: ["a"],
      contestLevels: ["uncontested"],
    });

    expect(result).toHaveLength(1);
    expect(result[0].shotType).toBe("layup");
  });

  it("filters by shot type", () => {
    expect(
      applyFilters(shots, { ...EMPTY_FILTERS, shotTypes: ["layup"] }),
    ).toHaveLength(1);
  });

  it("filters the clutch window", () => {
    const mixed = [
      makeShot({ period: 4, startGameClock: 100 }),
      makeShot({ period: 4, startGameClock: 600 }),
      makeShot({ period: 1, startGameClock: 100 }),
    ];

    const result = applyFilters(mixed, { ...EMPTY_FILTERS, clutchOnly: true });
    expect(result).toHaveLength(1);
  });

  it("filters to shots that came off a pass", () => {
    const mixed = [
      makeShot({ passerX: -30, passerY: 5 }),
      makeShot({ passerX: null, passerY: null }),
    ];

    const result = applyFilters(mixed, { ...EMPTY_FILTERS, assistedOnly: true });
    expect(result).toHaveLength(1);
    expect(result[0].hadPass).toBe(true);
  });

  it("can return an empty result, which is a valid UI state", () => {
    const result = applyFilters(shots, {
      ...EMPTY_FILTERS,
      playerIds: ["nobody"],
    });
    expect(result).toEqual([]);
  });

  it("does not mutate the input", () => {
    const input = makeShots(5, { shooterId: "a" });
    const copy = [...input];
    applyFilters(input, { ...EMPTY_FILTERS, playerIds: ["a"] });
    expect(input).toEqual(copy);
  });
});

describe("hasActiveFilters", () => {
  it("is false for the default state", () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
  });

  it("is true once any dimension is constrained", () => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, playerIds: ["a"] })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, clutchOnly: true })).toBe(true);
  });
});

describe("activeFilterCount", () => {
  it("counts every selected value, not every dimension", () => {
    expect(
      activeFilterCount({
        ...EMPTY_FILTERS,
        playerIds: ["a", "b"],
        contestLevels: ["uncontested"],
        clutchOnly: true,
      }),
    ).toBe(4);
  });
});

describe("selectedPlayerId", () => {
  it("identifies a single-player selection", () => {
    expect(selectedPlayerId({ ...EMPTY_FILTERS, playerIds: ["a"] })).toBe("a");
  });

  it("is null for the team view and for multi-select", () => {
    expect(selectedPlayerId(EMPTY_FILTERS)).toBeNull();
    expect(selectedPlayerId({ ...EMPTY_FILTERS, playerIds: ["a", "b"] })).toBeNull();
  });
});
