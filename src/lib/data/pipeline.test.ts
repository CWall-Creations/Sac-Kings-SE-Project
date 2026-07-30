import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { CsvFormatError, buildDataset, parseShotsCsv } from "./pipeline";
import type { Shot } from "./types";

/**
 * Integration test over the real extract.
 *
 * The unit tests cover geometry and bucketing in isolation; this one asserts that
 * the whole pipeline accepts all 8,816 committed rows and reproduces the
 * headline aggregates. It is the test that fails if a refactor silently changes
 * what the dashboard reports, so the expected values are written out explicitly
 * rather than recomputed from the same code under test.
 */

const CSV_PATH = resolve(__dirname, "../../../data/raw/shots.csv");

describe("parseShotsCsv against data/raw/shots.csv", () => {
  let shots: Shot[];
  let failures: { line: number; message: string }[];

  beforeAll(() => {
    const result = parseShotsCsv(readFileSync(CSV_PATH, "utf8"));
    shots = result.shots;
    failures = result.failures;
  });

  it("accepts every row in the committed extract", () => {
    // Printed in full on failure: a schema regression should say which row.
    expect(failures).toEqual([]);
    expect(shots).toHaveLength(8816);
  });

  it("reproduces the known shooting totals", () => {
    const made = shots.filter((shot) => shot.made).length;
    const threes = shots.filter((shot) => shot.isThree).length;
    const points = shots.reduce((total, shot) => total + shot.points, 0);

    expect(made).toBe(3930);
    expect(made / shots.length).toBeCloseTo(0.446, 3);
    expect(threes / shots.length).toBeCloseTo(0.401, 3);
    expect(points / shots.length).toBeCloseTo(1.041, 3);
  });

  it("finds the 12 players, ordered by volume", () => {
    const dataset = buildDataset(shots);

    expect(dataset.players).toHaveLength(12);
    expect(dataset.players[0].attempts).toBe(1389);
    expect(dataset.players.at(-1)?.attempts).toBe(32);
    // Volume order is what the filter UI relies on.
    const attempts = dataset.players.map((player) => player.attempts);
    expect([...attempts].sort((a, b) => b - a)).toEqual(attempts);
  });

  it("covers the 2024-25 regular season", () => {
    const dataset = buildDataset(shots);
    expect(dataset.dateRange).toEqual({ from: "2024-10-22", to: "2025-04-13" });
  });

  it("decodes passer-less rows to null instead of the origin", () => {
    const noPass = shots.filter((shot) => !shot.hadPass);

    expect(noPass).toHaveLength(838);
    expect(noPass.every((shot) => shot.passerX === null)).toBe(true);
    expect(noPass.every((shot) => shot.passDistance === null)).toBe(true);
    // The invariant the schema enforces: no pass means no assist.
    expect(noPass.every((shot) => !shot.assisted)).toBe(true);
  });

  it("keeps a pass on most unassisted shots, so hadPass is not a proxy for assisted", () => {
    const unassistedWithPass = shots.filter(
      (shot) => !shot.assisted && shot.hadPass,
    );
    expect(unassistedWithPass).toHaveLength(5392);
  });

  it("assigns every shot a zone and a finite distance", () => {
    expect(shots.every((shot) => shot.zone !== undefined)).toBe(true);
    expect(shots.every((shot) => Number.isFinite(shot.distance))).toBe(true);
  });
});

describe("parseShotsCsv error handling", () => {
  it("reports the offending line rather than throwing", () => {
    const csv = [
      "shooter_id,shooter_name,year,month,day,period,start_game_clock,end_game_clock,shot_clock,x,y,outcome,passer_x,passer_y,assisted,ast_opp,blocked,fouled,shot_type,complex_shot_type,contested,contest_level,catch_and_shoot,dribbles_before",
      "abc,Player A,2025,4,5,1,264.51,263.43,4.41,-26.39,-12.49,FALSE,NULL,NULL,FALSE,FALSE,FALSE,FALSE,jumper,pullupJumper,TRUE,lightly_contested,FALSE,2",
      "abc,Player A,2025,4,5,1,264.51,263.43,4.41,-26.39,-12.49,MAYBE,NULL,NULL,FALSE,FALSE,FALSE,FALSE,jumper,pullupJumper,TRUE,lightly_contested,FALSE,2",
    ].join("\n");

    const { shots, failures } = parseShotsCsv(csv);

    expect(shots).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0].line).toBe(3);
    expect(failures[0].message).toContain("outcome");
  });

  it("rejects a header that does not match the expected columns", () => {
    const { shots, failures } = parseShotsCsv("a,b,c\n1,2,3");
    expect(shots).toHaveLength(0);
    expect(failures).toHaveLength(1);
  });

  it("throws CsvFormatError for structurally broken CSV", () => {
    expect(() => parseShotsCsv('a,b\n"unterminated,1\n')).toThrow(CsvFormatError);
  });
});

describe("buildDataset", () => {
  it("refuses to build from zero shots", () => {
    expect(() => buildDataset([])).toThrow(/zero shots/);
  });
});
