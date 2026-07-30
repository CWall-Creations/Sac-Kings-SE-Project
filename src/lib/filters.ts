import type {
  ContestLevel,
  DribbleBucket,
  Shot,
  ShotClockBucket,
  ShotType,
} from "@/lib/data/types";

/**
 * The dashboard's filter state, and the one function that applies it.
 *
 * Kept as plain data with a pure `applyFilters` so that: the URL can be the
 * single source of truth (see `useShotFilters`), the same predicate is reused by
 * every view, and filtering is unit-testable without rendering anything.
 *
 * `null`/empty means "no constraint" rather than "nothing matches", so the
 * default state shows the whole team.
 */
export interface ShotFilters {
  /** Shooter IDs to include. Empty means every player. */
  playerIds: string[];
  contestLevels: ContestLevel[];
  shotClockBuckets: ShotClockBucket[];
  dribbleBuckets: DribbleBucket[];
  shotTypes: ShotType[];
  /** When true, restrict to the clutch window. */
  clutchOnly: boolean;
  /** When true, restrict to shots a teammate passed to the shooter. */
  assistedOnly: boolean;
}

/**
 * The filter dimensions that hold a list of values, as opposed to the boolean
 * switches. Named once so the hook and the UI cannot disagree about which keys
 * `toggleValue` accepts.
 */
export type MultiSelectFilterKey =
  | "playerIds"
  | "contestLevels"
  | "shotClockBuckets"
  | "dribbleBuckets"
  | "shotTypes";

/** The element type of a given multi-select dimension. */
export type FilterValue<K extends MultiSelectFilterKey> = ShotFilters[K][number];

export const EMPTY_FILTERS: ShotFilters = {
  playerIds: [],
  contestLevels: [],
  shotClockBuckets: [],
  dribbleBuckets: [],
  shotTypes: [],
  clutchOnly: false,
  assistedOnly: false,
};

/**
 * Apply every active constraint. Dimensions combine with AND; values within one
 * dimension combine with OR, which is what a reader expects from a multi-select.
 */
export function applyFilters(
  shots: readonly Shot[],
  filters: ShotFilters,
): Shot[] {
  // Sets avoid a linear scan per shot per dimension on 8,800 rows.
  const players = toSet(filters.playerIds);
  const contests = toSet(filters.contestLevels);
  const clocks = toSet(filters.shotClockBuckets);
  const dribbles = toSet(filters.dribbleBuckets);
  const types = toSet(filters.shotTypes);

  return shots.filter((shot) => {
    if (players && !players.has(shot.shooterId)) return false;
    if (contests && !contests.has(shot.contestLevel)) return false;
    if (clocks && !clocks.has(shot.shotClockBucket)) return false;
    if (dribbles && !dribbles.has(shot.dribbleBucket)) return false;
    if (types && !types.has(shot.shotType)) return false;
    if (filters.clutchOnly && !shot.isClutch) return false;
    if (filters.assistedOnly && !shot.hadPass) return false;
    return true;
  });
}

/** Number of active constraints, for a badge on a collapsed filter panel. */
export function activeFilterCount(filters: ShotFilters): number {
  return (
    filters.playerIds.length +
    filters.contestLevels.length +
    filters.shotClockBuckets.length +
    filters.dribbleBuckets.length +
    filters.shotTypes.length +
    (filters.clutchOnly ? 1 : 0) +
    (filters.assistedOnly ? 1 : 0)
  );
}

/**
 * Whether the filters single out one player, which is what switches the court
 * map from "which shots are efficient" to "how does this player compare".
 */
export function selectedPlayerId(filters: ShotFilters): string | null {
  return filters.playerIds.length === 1 ? filters.playerIds[0] : null;
}

function toSet<T>(values: readonly T[]): Set<T> | null {
  return values.length > 0 ? new Set(values) : null;
}
