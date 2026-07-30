import {
  CONTEST_LEVELS,
  DRIBBLE_BUCKETS,
  SHOT_CLOCK_BUCKETS,
  SHOT_TYPES,
  type ContestLevel,
  type DribbleBucket,
  type ShotClockBucket,
  type ShotType,
} from "@/lib/data/types";
import type { ShotFilters } from "./filters";

/**
 * Filter state <-> URL query string.
 *
 * The URL is the single source of truth for filters, which buys three things for
 * almost no code: any view of the dashboard is a shareable link, back and forward
 * work as a reader expects, and there is no second copy of the state to fall out
 * of sync with the address bar.
 *
 * Parsing is defensive. A query string is user-typed input that also survives
 * refactors and stale bookmarks, so unknown values are dropped rather than
 * trusted — an unrecognised `contest=purple` yields no constraint instead of a
 * filter that silently matches nothing and looks like missing data.
 */

const PARAM = {
  players: "players",
  contest: "contest",
  clock: "clock",
  dribbles: "dribbles",
  types: "types",
  clutch: "clutch",
  pass: "pass",
} as const;

/** Read filters out of a query string. Never throws. */
export function parseFilters(
  params: URLSearchParams,
  /** Valid shooter IDs; anything else is discarded. */
  knownPlayerIds: readonly string[] = [],
): ShotFilters {
  return {
    playerIds: parseList(params.get(PARAM.players), knownPlayerIds),
    contestLevels: parseList<ContestLevel>(
      params.get(PARAM.contest),
      CONTEST_LEVELS,
    ),
    shotClockBuckets: parseList<ShotClockBucket>(
      params.get(PARAM.clock),
      SHOT_CLOCK_BUCKETS,
    ),
    dribbleBuckets: parseList<DribbleBucket>(
      params.get(PARAM.dribbles),
      DRIBBLE_BUCKETS,
    ),
    shotTypes: parseList<ShotType>(params.get(PARAM.types), SHOT_TYPES),
    clutchOnly: params.get(PARAM.clutch) === "1",
    assistedOnly: params.get(PARAM.pass) === "1",
  };
}

/**
 * Serialise filters to a query string, omitting anything at its default so a
 * clean state produces a clean URL rather than a wall of empty parameters.
 */
export function filtersToQueryString(filters: ShotFilters): string {
  const params = new URLSearchParams();

  setList(params, PARAM.players, filters.playerIds);
  setList(params, PARAM.contest, filters.contestLevels);
  setList(params, PARAM.clock, filters.shotClockBuckets);
  setList(params, PARAM.dribbles, filters.dribbleBuckets);
  setList(params, PARAM.types, filters.shotTypes);
  if (filters.clutchOnly) params.set(PARAM.clutch, "1");
  if (filters.assistedOnly) params.set(PARAM.pass, "1");

  return params.toString();
}

/**
 * Split a comma-separated value and keep only entries in `allowed`, de-duplicated
 * and in the order `allowed` defines so the URL cannot dictate chart ordering.
 */
function parseList<T extends string>(
  raw: string | null,
  allowed: readonly T[],
): T[] {
  if (!raw) return [];

  const requested = new Set(
    raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );

  // When `allowed` is a fixed enum, preserve its canonical order. For free-form
  // IDs, fall back to the order they appear in the URL.
  return allowed.length > 0
    ? allowed.filter((value) => requested.has(value))
    : ([...requested] as T[]);
}

function setList(
  params: URLSearchParams,
  key: string,
  values: readonly string[],
): void {
  if (values.length > 0) params.set(key, values.join(","));
}
