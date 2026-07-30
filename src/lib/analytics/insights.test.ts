import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { parseShotsCsv } from "@/lib/data/pipeline";
import type { Shot } from "@/lib/data/types";
import { buildPlayerInsights, buildTeamInsights } from "./insights";
import { type PlayerShotProfile, buildPlayerProfiles } from "./profiles";

describe("insights over the real dataset", () => {
  let shots: Shot[];
  let profiles: PlayerShotProfile[];
  let byId: Map<string, Shot[]>;

  beforeAll(() => {
    const csv = readFileSync(
      resolve(__dirname, "../../../data/raw/shots.csv"),
      "utf8",
    );
    shots = parseShotsCsv(csv).shots;
    profiles = buildPlayerProfiles(shots);
    byId = new Map();
    for (const shot of shots) {
      const list = byId.get(shot.shooterId) ?? [];
      list.push(shot);
      byId.set(shot.shooterId, list);
    }
  });

  const forPlayer = (name: string) => {
    const profile = profiles.find((p) => p.shooterName === name)!;
    return buildPlayerInsights(profile, byId.get(profile.shooterId)!, {
      teamShots: shots,
      teamProfiles: profiles,
    });
  };

  describe("team", () => {
    it("names shot selection as a measurable problem, with a cost", () => {
      const selection = buildTeamInsights(shots, profiles).find(
        (i) => i.id === "team-selection-cost",
      )!;

      expect(selection.headline).toContain("3,039");
      expect(selection.headline).toContain("34.5%");
      expect(selection.points).toBeLessThan(-600);
    });

    it("refuses to claim a team-level shot-making verdict", () => {
      const limitation = buildTeamInsights(shots, profiles).find(
        (i) => i.id === "team-making-unmeasurable",
      )!;

      expect(limitation.kind).toBe("limitation");
      expect(limitation.headline).toMatch(/cannot be answered/i);
      // But it still reports what IS measurable.
      expect(limitation.detail).toContain("0.29");
    });

    it("leads with the biggest lever rather than the first category", () => {
      const insights = buildTeamInsights(shots, profiles);
      const quantified = insights.filter((i) => i.points !== null);

      // Descending by magnitude, and ahead of every unquantified insight.
      for (let i = 1; i < quantified.length; i += 1) {
        expect(Math.abs(quantified[i].points!)).toBeLessThanOrEqual(
          Math.abs(quantified[i - 1].points!),
        );
      }
      expect(insights.indexOf(quantified.at(-1)!)).toBeLessThan(
        insights.findIndex((i) => i.points === null),
      );
    });

    it("puts the limitation last", () => {
      const insights = buildTeamInsights(shots, profiles);
      expect(insights.at(-1)!.kind).toBe("limitation");
    });

    it("states the assumption behind every projected gain", () => {
      for (const insight of buildTeamInsights(shots, profiles)) {
        if (insight.kind === "opportunity" && insight.points !== null) {
          expect(insight.detail).toMatch(/assum|ceiling|upper bound/i);
        }
      }
    });

    it("returns nothing for an empty slice", () => {
      expect(buildTeamInsights([], [])).toEqual([]);
    });
  });

  describe("the selection-versus-making verdict", () => {
    it("says 'good shots, missed' when selection is positive and making negative", () => {
      // Player L: +0.07 selection, −0.08 making — the two pull apart, and the
      // whole point is that his problem is conversion.
      const verdict = forPlayer("Player L").insights.find(
        (i) => i.id === "player-verdict",
      )!;

      expect(verdict.headline).toMatch(/takes good shots and misses them/i);
      expect(verdict.headline).toMatch(/not selection/i);
    });

    it("says 'hard shots, made anyway' when selection is negative and making positive", () => {
      // Player C: the lowest shot quality on the roster and the best conversion.
      const verdict = forPlayer("Player C").insights.find(
        (i) => i.id === "player-verdict",
      )!;

      expect(verdict.headline).toMatch(/overcomes a below-average shot diet/i);
    });

    it("attributes a shortfall to making when making dominates", () => {
      // Player D: below on both, but 83% of the gap is conversion.
      const verdict = forPlayer("Player D").insights.find(
        (i) => i.id === "player-verdict",
      )!;

      expect(verdict.headline).toMatch(/below the roster average/i);
      expect(verdict.headline).toMatch(/mostly through shot making/i);
    });

    it("reports both components with their point totals", () => {
      const verdict = forPlayer("Player D").insights.find(
        (i) => i.id === "player-verdict",
      )!;

      expect(verdict.detail).toMatch(/Shot selection −0\.03/);
      expect(verdict.detail).toMatch(/shot making −0\.12/);
      expect(verdict.detail).toMatch(/−126 points/);
    });

    it("comes first for every player", () => {
      for (const profile of profiles) {
        const { insights } = buildPlayerInsights(
          profile,
          byId.get(profile.shooterId)!,
          { teamShots: shots, teamProfiles: profiles },
        );
        expect(insights[0].id).toBe("player-verdict");
      }
    });
  });

  describe("role-conditioned advice", () => {
    it("does not tell a rim finisher to stop shooting inside the arc", () => {
      // Half of Player C's attempts are inside 10 feet — that is his job, not a
      // problem, and a rule that fires on shot location alone would say otherwise.
      const { insights } = forPlayer("Player C");
      expect(
        insights.some((i) => i.id === "player-midrange-reallocation"),
      ).toBe(false);
    });

    it("frames a rim finisher's efficiency as a function of being fed", () => {
      const { role, insights } = forPlayer("Player C");

      expect(role.archetype).toBe("rim_finisher");
      const dependency = insights.find(
        (i) => i.id === "player-finisher-dependency",
      )!;
      expect(dependency.kind).toBe("assignment");
      expect(dependency.headline).toMatch(/how often he is fed/i);
    });

    it("credits the biggest foul-drawer, since points per shot ignores it", () => {
      const foulDrawing = forPlayer("Player C").insights.find(
        (i) => i.id === "player-foul-drawing",
      )!;

      expect(foulDrawing.kind).toBe("strength");
      expect(foulDrawing.headline).toContain("12.0%");
      expect(foulDrawing.detail).toMatch(/excludes free throws/i);
    });

    it("does flag replaceable mid-range for a perimeter player", () => {
      const reallocation = forPlayer("Player D").insights.find(
        (i) => i.id === "player-midrange-reallocation",
      )!;

      expect(reallocation.kind).toBe("opportunity");
      expect(reallocation.points).toBeGreaterThan(0);
      expect(reallocation.detail).toMatch(/assuming/i);
    });

    it("separates a usage decision from a player decision", () => {
      // Player D takes 26% of his shots late, against 19% for the team.
      const assignment = forPlayer("Player D").insights.find(
        (i) => i.id === "player-late-clock-load",
      )!;

      expect(assignment.kind).toBe("assignment");
      expect(assignment.detail).toMatch(/usage|redistribute/i);
    });

    it("flags a creator who does not pressure the rim", () => {
      const concern = forPlayer("Player D").insights.find(
        (i) => i.id === "player-no-rim-pressure",
      )!;
      expect(concern.headline).toContain("12%");
    });

    it("tells a spacer who avoids the corner where the points are", () => {
      // Player G: 44% of his shots from three, only 6% from the corner.
      const relocation = forPlayer("Player G").insights.find(
        (i) => i.id === "player-corner-relocation",
      );
      expect(relocation).toBeDefined();
      expect(relocation!.detail).toMatch(/spacing instruction/i);
    });

    it("notes that the movement shooter never reaches the line", () => {
      const concern = forPlayer("Player A").insights.find(
        (i) => i.id === "player-no-free-throws",
      )!;
      expect(concern.headline).toContain("2.8%");
    });

    it("caveats the 32-attempt player instead of advising him", () => {
      const { insights } = forPlayer("Player J");
      const caveat = insights.find((i) => i.id === "player-small-sample")!;

      expect(caveat.kind).toBe("limitation");
      expect(caveat.detail).toContain("−0.24");
      expect(caveat.detail).toContain("−0.09");
    });

    it("produces something for every player without throwing", () => {
      for (const profile of profiles) {
        const { insights } = buildPlayerInsights(
          profile,
          byId.get(profile.shooterId)!,
          { teamShots: shots, teamProfiles: profiles },
        );
        expect(insights.length).toBeGreaterThan(0);
        expect(insights.every((i) => i.headline.length > 0)).toBe(true);
      }
    });

    it("handles a player with no shots in the slice", () => {
      const { insights } = buildPlayerInsights(profiles[0], [], {
        teamShots: shots,
        teamProfiles: profiles,
      });
      expect(insights).toEqual([]);
    });
  });
});
