"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { filtersToQueryString, parseFilters } from "@/lib/filter-url";
import {
  EMPTY_FILTERS,
  type FilterValue,
  type MultiSelectFilterKey,
  type ShotFilters,
} from "@/lib/filters";

/**
 * Filter state, backed by the URL.
 *
 * There is no store and no `useState` mirror of the filters — the query string is
 * the state, and this hook is the only adapter between it and React. That is why
 * a filtered view is shareable, why the browser's back button steps through filter
 * changes, and why no component can hold a stale copy.
 *
 * Updates use `replace` with `scroll: false`: a filter change is a refinement of
 * the current view, not a new destination, so it should not add a history entry
 * per checkbox or jump the page to the top.
 */
export function useShotFilters(knownPlayerIds: readonly string[]) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // `useSearchParams` returns a stable-enough object; the string is what actually
  // identifies the state, so memoise on that.
  const queryString = searchParams.toString();

  const filters = useMemo(
    () => parseFilters(new URLSearchParams(queryString), knownPlayerIds),
    [queryString, knownPlayerIds],
  );

  const setFilters = useCallback(
    (next: ShotFilters) => {
      const query = filtersToQueryString(next);
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router],
  );

  /** Merge a partial change into the current filters. */
  const updateFilters = useCallback(
    (patch: Partial<ShotFilters>) => setFilters({ ...filters, ...patch }),
    [filters, setFilters],
  );

  /**
   * Add or remove one value from a multi-select dimension. Pulled out here so
   * every checkbox in the UI shares one implementation.
   */
  const toggleValue = useCallback(
    <K extends MultiSelectFilterKey>(key: K, value: FilterValue<K>) => {
      const current = filters[key] as string[];
      const next = current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value];

      updateFilters({ [key]: next } as Partial<ShotFilters>);
    },
    [filters, updateFilters],
  );

  const clearFilters = useCallback(
    () => setFilters(EMPTY_FILTERS),
    [setFilters],
  );

  return { filters, setFilters, updateFilters, toggleValue, clearFilters };
}
