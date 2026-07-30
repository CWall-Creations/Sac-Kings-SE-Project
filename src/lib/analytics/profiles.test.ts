import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { parseShotsCsv } from "@/lib/data/pipeline";
import type { Shot } from "@/lib/data/types";
import { makeShots, makeShotsWithRate } from "@/lib/test/factories";
import {
  buildPlayerProfiles,
  buildTeamProfile,
  buildZoneProfiles,
  zonePointsPerShotMap,
} from "./profiles";

const RIM = { x: -41.75, y: 0 } as const;
const MIDRANGE = { x: -28, y: 0 } as const;
const CORNER = { x: -39, y: -23 } as const;

describe("buildPlayerProfiles", () => {
  it("separates shot selection from shot making", () => {
    const shots = [
      // Takes good shots, converts them at the expected rate.
      ...makeShotsWithRate(300, 0.6, { ...RIM, shooterId: "selector", shotType: "layup" }),
      // Takes bad shots, converts them at the expected rate.
      ...makeShotsWithRate(300, 0.4, { ...MIDRANGE, shooterId: "chucker" }),
      // Ballast so each player has a baseline fit from others' attempts.
      ...makeShotsWithRate(300, 0.6, { ...RIM, shooterId: "filler", shotType: "layup" }),
      ...makeShotsWithRate(300, 0.4, { ...MIDRANGE, shooterId: "filler" }),
    ];

    const profiles = buildPlayerProfiles(shots);
    const selector = profiles.find((p) => p.shooterId === "selector")!;
    const chucker = profiles.find((p) => p.shooterId === "chucker")!;

    // Selection differs a lot...
    expect(selector.expectedPointsPerShot).toBeGreaterThan(
      chucker.expectedPointsPerShot + 0.3,
    );
    // ...while making is near zero for both, because each shot their diet's rate.
    expect(Math.abs(selector.pointsPerShotAboveExpected)).toBeLessThan(0.06);
    expect(Math.abs(chucker.pointsPerShotAboveExpected)).toBeLessThan(0.06);
  });

  it("credits a player who beats expectation on the same shots", () => {
    const shots = [
      ...makeShotsWithRate(300, 0.55, { ...MIDRANGE, shooterId: "sniper" }),
      ...makeShotsWithRate(600, 0.35, { ...MIDRANGE, shooterId: "rest" }),
    ];

    const sniper = buildPlayerProfiles(shots).find(
      (p) => p.shooterId === "sniper",
    )!;

    expect(sniper.pointsPerShotAboveExpected).toBeGreaterThan(0.3);
    expect(sniper.pointsAboveExpected).toBeGreaterThan(90);
  });

  it("ranks by the shrunk difference so a tiny sample cannot lead", () => {
    const shots = [
      // 10 attempts, all made: a huge raw difference on no evidence.
      ...makeShots(10, { ...MIDRANGE, shooterId: "fluke", made: true }),
      // 800 attempts, solidly above the baseline.
      ...makeShotsWithRate(800, 0.5, { ...MIDRANGE, shooterId: "real" }),
      ...makeShotsWithRate(800, 0.35, { ...MIDRANGE, shooterId: "rest" }),
    ];

    const profiles = buildPlayerProfiles(shots);
    const fluke = profiles.find((p) => p.shooterId === "fluke")!;
    const real = profiles.find((p) => p.shooterId === "real")!;

    expect(fluke.pointsPerShotAboveExpected).toBeGreaterThan(
      real.pointsPerShotAboveExpected,
    );
    expect(real.shrunkPointsPerShotAboveExpected).toBeGreaterThan(
      fluke.shrunkPointsPerShotAboveExpected,
    );
    expect(profiles[0].shooterId).toBe("real");
    expect(fluke.isReliable).toBe(false);
  });

  it("counts unchosen attempts separately instead of grading them", () => {
    const shots = [
      ...makeShotsWithRate(100, 0.4, { ...MIDRANGE, shooterId: "a" }),
      ...makeShots(5, { ...MIDRANGE, shooterId: "a", shotType: "heave", made: false }),
      ...makeShotsWithRate(200, 0.4, { ...MIDRANGE, shooterId: "b" }),
    ];

    const profile = buildPlayerProfiles(shots).find((p) => p.shooterId === "a")!;

    expect(profile.split.attempts).toBe(100);
    expect(profile.excludedAttempts).toBe(5);
  });
});

describe("buildZoneProfiles", () => {
  it("compares each zone to the overall rate when no reference is given", () => {
    const zones = buildZoneProfiles([
      ...makeShotsWithRate(100, 0.6, { ...RIM, shotType: "layup" }),
      ...makeShotsWithRate(100, 0.4, MIDRANGE),
    ]);

    const rim = zones.find((z) => z.zone === "restricted_area")!;
    const mid = zones.find((z) => z.zone === "midrange_short")!;

    expect(rim.pointsPerShotVsReference).toBeGreaterThan(0);
    expect(mid.pointsPerShotVsReference).toBeLessThan(0);
    expect(rim.shareOfAttempts).toBeCloseTo(0.5);
  });

  it("compares to the team when a reference map is given", () => {
    const team = [
      ...makeShotsWithRate(400, 0.35, CORNER),
      ...makeShotsWithRate(400, 0.5, { ...RIM, shotType: "layup" }),
    ];
    const reference = zonePointsPerShotMap(team);

    // A player who shoots the corner better than the team.
    const player = makeShotsWithRate(100, 0.45, CORNER);
    const corner = buildZoneProfiles(player, reference).find(
      (z) => z.zone === "corner_3",
    )!;

    expect(corner.pointsPerShotVsReference).toBeGreaterThan(0.2);
  });

  it("returns every zone, with zeroed splits for the empty ones", () => {
    const zones = buildZoneProfiles(makeShots(10, MIDRANGE));

    expect(zones).toHaveLength(7);
    const corner = zones.find((z) => z.zone === "corner_3")!;
    expect(corner.split.attempts).toBe(0);
    expect(corner.pointsPerShotVsReference).toBe(0);
    expect(Number.isNaN(corner.split.pointsPerShot)).toBe(false);
  });

  it("handles an empty shot list without dividing by zero", () => {
    const zones = buildZoneProfiles([]);
    expect(zones).toHaveLength(7);
    expect(zones.every((z) => z.shareOfAttempts === 0)).toBe(true);
  });
});

describe("buildTeamProfile", () => {
  it("quantifies what the below-average zones cost", () => {
    const profile = buildTeamProfile([
      ...makeShotsWithRate(600, 0.6, { ...RIM, shotType: "layup" }),
      ...makeShotsWithRate(400, 0.38, MIDRANGE),
    ]);

    expect(profile.belowAverageAttempts).toBe(400);
    expect(profile.belowAverageShareOfAttempts).toBeCloseTo(0.4);
    // Cost is negative: these attempts trail the team's own average.
    expect(profile.pointsLostToBelowAverageZones).toBeLessThan(0);
  });
});

/**
 * The model applied to the real extract.
 *
 * These expectations were derived independently (in a throwaway Python script)
 * before the TypeScript existed, so they check the implementation against an
 * outside answer rather than against itself.
 */
describe("the real dataset", () => {
  let shots: Shot[];

  beforeAll(() => {
    const csv = readFileSync(
      resolve(__dirname, "../../../data/raw/shots.csv"),
      "utf8",
    );
    shots = parseShotsCsv(csv).shots;
  });

  it("finds the mid-range and close-range problem", () => {
    const zones = buildZoneProfiles(shots);
    const byZone = new Map(zones.map((zone) => [zone.zone, zone]));

    expect(byZone.get("restricted_area")!.split.pointsPerShot).toBeCloseTo(1.25, 2);
    expect(byZone.get("corner_3")!.split.pointsPerShot).toBeCloseTo(1.25, 2);
    expect(byZone.get("close_range")!.split.pointsPerShot).toBeCloseTo(0.82, 2);
    expect(byZone.get("midrange_short")!.split.pointsPerShot).toBeCloseTo(0.76, 2);

    // The corner three and the layup are worth the same, and the shots in
    // between are worth a third less.
    expect(byZone.get("corner_3")!.split.pointsPerShot).toBeGreaterThan(
      byZone.get("close_range")!.split.pointsPerShot + 0.35,
    );
  });

  it("shows the team taking a third of its shots from below-average spots", () => {
    const profile = buildTeamProfile(shots);

    expect(profile.split.pointsPerShot).toBeCloseTo(1.041, 3);
    // The three two-point zones outside the restricted area: 3,039 attempts.
    expect(profile.belowAverageAttempts).toBe(3039);
    expect(profile.belowAverageShareOfAttempts).toBeCloseTo(0.345, 3);
    // Those attempts trail the team's own average by roughly 750 points.
    expect(profile.pointsLostToBelowAverageZones).toBeLessThan(-600);
  });

  it("does not count the wing three, which sits on the team average, as a problem", () => {
    const profile = buildTeamProfile(shots);
    const wing = profile.zones.find((zone) => zone.zone === "wing_3")!;

    // 0.005 PPS below average: inside the materiality band, so it lands in
    // neither the below- nor above-average group.
    expect(Math.abs(wing.pointsPerShotVsReference)).toBeLessThan(0.05);
    expect(profile.aroundAverageAttempts).toBeGreaterThanOrEqual(
      wing.split.attempts,
    );
  });

  it("ranks the same players as the reference implementation", () => {
    const profiles = buildPlayerProfiles(shots);
    const byName = new Map(profiles.map((p) => [p.shooterName, p]));

    // Player C: no threes, half their shots at the rim, well above expectation.
    const best = byName.get("Player C")!;
    expect(best.split.threePointRate).toBeLessThan(0.01);
    expect(best.pointsPerShotAboveExpected).toBeGreaterThan(0.1);

    // Player D: high volume, three-heavy, below expectation on both counts.
    const worst = byName.get("Player D")!;
    expect(worst.split.pointsPerShot).toBeCloseTo(0.88, 2);
    expect(worst.pointsPerShotAboveExpected).toBeLessThan(-0.08);
    expect(worst.pointsAboveExpected).toBeLessThan(-80);

    // Player C leads and Player D trails, on the shrunk ranking.
    expect(profiles[0].shooterName).toBe("Player C");
    expect(profiles.at(-1)!.shooterName).toBe("Player D");

    // Every player is accounted for.
    expect(profiles).toHaveLength(12);
  });

  it("keeps the 32-attempt player out of the extremes after shrinkage", () => {
    const profiles = buildPlayerProfiles(shots);
    const sparse = profiles.find((p) => p.split.attempts < 50)!;

    // 32 attempts clears the 25-attempt floor for plotting a cell but is
    // nowhere near enough to rate a season, which is why player ratings use a
    // separate, much higher threshold.
    expect(sparse.split.attempts).toBe(32);
    expect(sparse.isReliable).toBe(false);
    expect(Math.abs(sparse.shrunkPointsPerShotAboveExpected)).toBeLessThan(
      Math.abs(sparse.pointsPerShotAboveExpected),
    );
    // They are neither the best nor the worst once sample size is respected.
    expect(profiles[0].shooterId).not.toBe(sparse.shooterId);
    expect(profiles.at(-1)!.shooterId).not.toBe(sparse.shooterId);
  });
});
