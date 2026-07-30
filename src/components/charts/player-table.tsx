"use client";

import { useMemo, useState } from "react";
import type { PlayerShotProfile } from "@/lib/analytics/profiles";
import { colorForDifference } from "@/lib/viz/diverging";
import {
  formatCount,
  formatPercent,
  formatPointsPerShot,
  formatShootingPct,
  formatSigned,
  formatSignedPoints,
} from "@/lib/viz/format";

/**
 * The scatter's table twin, sortable.
 *
 * Sorting is more than a convenience here. The default order is by the
 * sample-size-adjusted difference, which is the honest ranking; sorting by the raw
 * difference instead puts the 32-attempt player at the bottom of the league, which
 * is exactly the trap shrinkage exists to avoid. Letting a reader flip between the
 * two makes that visible rather than asking them to trust a footnote.
 */

type SortKey =
  | "shooterName"
  | "attempts"
  | "threePointRate"
  | "effectiveFieldGoalPct"
  | "pointsPerShot"
  | "expectedPointsPerShot"
  | "pointsPerShotAboveExpected"
  | "shrunkPointsPerShotAboveExpected"
  | "pointsAboveExpected";

interface Column {
  key: SortKey;
  label: string;
  /** Column header tooltip, for the metrics that need defining. */
  title?: string;
  numeric: boolean;
}

const COLUMNS: readonly Column[] = [
  { key: "shooterName", label: "Player", numeric: false },
  { key: "attempts", label: "Att", numeric: true },
  { key: "threePointRate", label: "3PA%", title: "Share of attempts from three", numeric: true },
  { key: "effectiveFieldGoalPct", label: "eFG%", title: "Field goal percentage counting a three as 1.5 makes", numeric: true },
  { key: "expectedPointsPerShot", label: "Expected", title: "Average quality of the shots chosen, in points per shot", numeric: true },
  { key: "pointsPerShot", label: "Actual", title: "Points per shot actually produced (field goals only)", numeric: true },
  { key: "pointsPerShotAboveExpected", label: "Raw diff", title: "Actual minus expected, unadjusted for sample size", numeric: true },
  { key: "shrunkPointsPerShotAboveExpected", label: "Adjusted", title: "Difference pulled toward zero in proportion to sample size — the honest ranking", numeric: true },
  { key: "pointsAboveExpected", label: "Points", title: "Season points gained or lost against expectation", numeric: true },
];

function valueOf(profile: PlayerShotProfile, key: SortKey): number | string {
  switch (key) {
    case "shooterName":
      return profile.shooterName;
    case "attempts":
      return profile.split.attempts;
    case "threePointRate":
      return profile.split.threePointRate;
    case "effectiveFieldGoalPct":
      return profile.split.effectiveFieldGoalPct;
    case "pointsPerShot":
      return profile.split.pointsPerShot;
    default:
      return profile[key];
  }
}

interface PlayerTableProps {
  profiles: readonly PlayerShotProfile[];
  highlightedIds: readonly string[];
  onSelect: (shooterId: string) => void;
}

export function PlayerTable({
  profiles,
  highlightedIds,
  onSelect,
}: PlayerTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({
    key: "shrunkPointsPerShotAboveExpected",
    descending: true,
  });

  const sorted = useMemo(() => {
    const rows = [...profiles];
    rows.sort((a, b) => {
      const left = valueOf(a, sort.key);
      const right = valueOf(b, sort.key);
      const comparison =
        typeof left === "string" && typeof right === "string"
          ? left.localeCompare(right)
          : Number(left) - Number(right);
      return sort.descending ? -comparison : comparison;
    });
    return rows;
  }, [profiles, sort]);

  if (profiles.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-ink-secondary">
        No players match these filters.
      </p>
    );
  }

  const toggleSort = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, descending: !current.descending }
        : { key, descending: key !== "shooterName" },
    );

  const anyInSample = profiles.some((profile) => !profile.gradedOutOfSample);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse text-sm">
          <caption className="sr-only">
            Shot selection and shot making by player, sortable
          </caption>
          <thead>
            <tr className="border-b border-hairline">
              {COLUMNS.map((column) => {
                const active = sort.key === column.key;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={
                      active
                        ? sort.descending
                          ? "descending"
                          : "ascending"
                        : "none"
                    }
                    className={[
                      "py-2 text-xs font-medium",
                      column.numeric ? "text-right" : "text-left",
                    ].join(" ")}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      title={column.title}
                      className={[
                        "rounded px-1.5 py-0.5 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-accent",
                        active ? "text-ink" : "text-ink-muted hover:text-ink-secondary",
                      ].join(" ")}
                    >
                      {column.label}
                      <span aria-hidden="true" className="ml-1 inline-block w-2">
                        {active ? (sort.descending ? "▾" : "▴") : ""}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((profile) => {
              const emphasised =
                highlightedIds.length === 0 ||
                highlightedIds.includes(profile.shooterId);

              return (
                <tr
                  key={profile.shooterId}
                  onClick={() => onSelect(profile.shooterId)}
                  className={[
                    "cursor-pointer border-b border-hairline/60 last:border-0 hover:bg-page",
                    emphasised ? "" : "opacity-45",
                  ].join(" ")}
                >
                  <th
                    scope="row"
                    className="py-2 pr-2 text-left font-normal text-ink"
                  >
                    {profile.shooterName}
                    {!profile.isReliable && (
                      <span
                        className="ml-1.5 text-[11px] text-ink-muted"
                        title="Under 100 attempts in this slice — too few to rate a season"
                      >
                        small n
                      </span>
                    )}
                  </th>
                  <Cell>{formatCount(profile.split.attempts)}</Cell>
                  <Cell>{formatPercent(profile.split.threePointRate, 0)}</Cell>
                  <Cell>
                    {formatShootingPct(profile.split.effectiveFieldGoalPct)}
                  </Cell>
                  <Cell>
                    {formatPointsPerShot(profile.expectedPointsPerShot)}
                  </Cell>
                  <Cell emphasis>
                    {formatPointsPerShot(profile.split.pointsPerShot)}
                  </Cell>
                  <Cell>
                    {formatSigned(profile.pointsPerShotAboveExpected)}
                  </Cell>
                  <td className="py-2 pl-2 pr-1.5 text-right">
                    <span className="inline-flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{
                          background: colorForDifference(
                            profile.shrunkPointsPerShotAboveExpected,
                          ),
                        }}
                      />
                      <span className="tabular text-ink">
                        {formatSigned(
                          profile.shrunkPointsPerShotAboveExpected,
                        )}
                      </span>
                    </span>
                  </td>
                  <Cell>
                    {formatSignedPoints(profile.pointsAboveExpected)}
                  </Cell>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {anyInSample && (
        <p className="mt-2 text-[11px] leading-snug text-ink-muted">
          This slice is too thin to build a baseline that excludes each player, so
          some are compared partly against themselves. Their differences are
          understated — widen the filters for a clean comparison.
        </p>
      )}
    </div>
  );
}

function Cell({
  children,
  emphasis,
}: {
  children: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <td
      className={[
        "tabular py-2 px-1.5 text-right",
        emphasis ? "text-ink" : "text-ink-secondary",
      ].join(" ")}
    >
      {children}
    </td>
  );
}
