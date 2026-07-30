import Papa from "papaparse";
import type { z } from "zod";
import { enrichShot } from "./enrich";
import { rawShotRowSchema } from "./schema";
import type { PlayerSummary, Shot, ShotDataset } from "./types";

/**
 * CSV text in, validated and enriched shots out.
 *
 * Kept separate from `scripts/build-data.ts` so the transformation can be tested
 * against the real extract without touching the filesystem or the console, and
 * so the same code could be reused by a server-side loader if the dataset ever
 * outgrows a static file.
 */

export interface RowFailure {
  /** 1-indexed line in the source CSV; the header is line 1. */
  line: number;
  message: string;
}

export interface ParseResult {
  shots: Shot[];
  failures: RowFailure[];
}

/** Thrown for CSV that is malformed at the parser level, not the row level. */
export class CsvFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvFormatError";
  }
}

/**
 * Validate and enrich every row, collecting failures rather than throwing on the
 * first one so a broken extract yields a single actionable report. The caller
 * decides whether failures are fatal.
 */
export function parseShotsCsv(csv: string): ParseResult {
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transform: (value) => value.trim(),
  });

  if (parsed.errors.length > 0) {
    const first = parsed.errors[0];
    throw new CsvFormatError(
      `CSV is malformed (${parsed.errors.length} parser errors). ` +
        `First: row ${first.row ?? "?"} — ${first.message}`,
    );
  }

  const shots: Shot[] = [];
  const failures: RowFailure[] = [];

  parsed.data.forEach((row, index) => {
    const result = rawShotRowSchema.safeParse(row);
    if (result.success) {
      shots.push(enrichShot(result.data));
    } else {
      failures.push({ line: index + 2, message: formatIssues(result.error) });
    }
  });

  return { shots, failures };
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "row"} ${issue.message}`)
    .join("; ");
}

/** Assemble the artifact the dashboard fetches at startup. */
export function buildDataset(shots: Shot[]): ShotDataset {
  if (shots.length === 0) {
    throw new Error("Cannot build a dataset from zero shots.");
  }

  const dates = shots.map((shot) => shot.gameDate).sort();

  return {
    generatedAt: new Date().toISOString(),
    shots,
    players: summarisePlayers(shots),
    dateRange: { from: dates[0], to: dates[dates.length - 1] },
  };
}

/** Player list for the filter controls, ordered by volume. */
function summarisePlayers(shots: Shot[]): PlayerSummary[] {
  const byId = new Map<string, PlayerSummary>();

  for (const shot of shots) {
    const existing = byId.get(shot.shooterId);
    if (existing) {
      existing.attempts += 1;
    } else {
      byId.set(shot.shooterId, {
        shooterId: shot.shooterId,
        shooterName: shot.shooterName,
        attempts: 1,
      });
    }
  }

  return [...byId.values()].sort((a, b) => b.attempts - a.attempts);
}
