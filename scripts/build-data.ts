/**
 * Build-time ETL: `data/raw/shots.csv` -> `public/data/shots.json`.
 *
 * Run with `npm run data`. The output is a static asset the browser fetches once
 * at startup, so this script is the only place raw CSV is ever touched. Three
 * consequences worth knowing:
 *
 *   1. Validation failures stop the build. The dataset is small and clean, so a
 *      surprise here means the extract changed and the dashboard's numbers can
 *      no longer be trusted — better to fail loudly than to render silently
 *      wrong charts.
 *   2. Geometry and bucketing are computed once here rather than on every filter
 *      change in the client.
 *   3. Writing to `public/` instead of importing the JSON into a module keeps
 *      the shot rows out of the JavaScript bundle.
 *
 * The transformation itself lives in `src/lib/data/pipeline.ts`; this file is
 * only filesystem access, reporting, and the decision to fail.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CsvFormatError,
  buildDataset,
  parseShotsCsv,
} from "../src/lib/data/pipeline";
import type { ShotDataset } from "../src/lib/data/types";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INPUT_PATH = resolve(PROJECT_ROOT, "data/raw/shots.csv");
const OUTPUT_PATH = resolve(PROJECT_ROOT, "public/data/shots.json");

/** How many validation failures to print before truncating the report. */
const MAX_REPORTED_ERRORS = 10;

async function main(): Promise<void> {
  console.log(`Reading ${relative(INPUT_PATH)}`);
  const csv = await readCsv(INPUT_PATH);

  const { shots, failures } = parseShotsCsv(csv);

  if (failures.length > 0) {
    const shown = failures
      .slice(0, MAX_REPORTED_ERRORS)
      .map((failure) => `  line ${failure.line}: ${failure.message}`)
      .join("\n");
    const omitted = failures.length - Math.min(failures.length, MAX_REPORTED_ERRORS);
    throw new BuildError(
      `${failures.length} of ${shots.length + failures.length} rows failed ` +
        `validation:\n${shown}` +
        (omitted > 0 ? `\n  ...and ${omitted} more` : ""),
    );
  }

  const dataset = buildDataset(shots);

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  const json = JSON.stringify(dataset);
  await writeFile(OUTPUT_PATH, json);

  reportSummary(dataset, csv.length, json.length);
}

async function readCsv(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (cause) {
    throw new BuildError(
      `Could not read ${relative(path)}. The raw extract is committed to the ` +
        `repo, so this usually means the file was moved or renamed.`,
      cause,
    );
  }
}

/**
 * Print the aggregates a reviewer would check by hand anyway. Cheap, and it turns
 * a silent success into evidence the numbers are sane.
 */
function reportSummary(
  dataset: ShotDataset,
  csvBytes: number,
  jsonBytes: number,
): void {
  const { shots, players, dateRange } = dataset;
  const made = shots.filter((shot) => shot.made).length;
  const threes = shots.filter((shot) => shot.isThree).length;
  const noPass = shots.filter((shot) => !shot.hadPass).length;
  const points = shots.reduce((total, shot) => total + shot.points, 0);

  console.log(`Wrote ${relative(OUTPUT_PATH)}`);
  console.log("");
  console.log(`  attempts      ${shots.length}`);
  console.log(`  players       ${players.length}`);
  console.log(`  dates         ${dateRange.from} to ${dateRange.to}`);
  console.log(`  FG%           ${percent(made / shots.length)}`);
  console.log(`  3PA rate      ${percent(threes / shots.length)}`);
  console.log(
    `  points/shot   ${(points / shots.length).toFixed(3)} (field goals only)`,
  );
  console.log(`  no passer     ${noPass} attempts`);
  console.log(
    `  size          ${kb(csvBytes)} CSV in, ${kb(jsonBytes)} JSON out`,
  );
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function relative(path: string): string {
  return path.startsWith(PROJECT_ROOT)
    ? path.slice(PROJECT_ROOT.length + 1)
    : path;
}

/** An expected, explainable build failure — reported without a stack trace. */
class BuildError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "BuildError";
  }
}

main().catch((error: unknown) => {
  if (error instanceof BuildError || error instanceof CsvFormatError) {
    console.error(`\nbuild-data failed: ${error.message}\n`);
  } else {
    console.error("\nbuild-data failed unexpectedly:\n", error);
  }
  process.exitCode = 1;
});
