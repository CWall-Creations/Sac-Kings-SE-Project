"use client";

import { useMemo } from "react";
import { CourtLegend } from "@/components/court/court-legend";
import { ShotMap } from "@/components/court/shot-map";
import { ZoneTable } from "@/components/court/zone-table";
import { FilterBar } from "@/components/filters/filter-bar";
import { Card, StatTile } from "@/components/ui/card";
import { ViewErrorBoundary } from "@/components/view-error-boundary";
import {
  buildTeamProfile,
  buildZoneProfiles,
  zonePointsPerShotMap,
} from "@/lib/analytics/profiles";
import type { ShotDataset } from "@/lib/data/types";
import { applyFilters, selectedPlayerId } from "@/lib/filters";
import { useShotDataset } from "@/lib/hooks/use-shot-dataset";
import { useShotFilters } from "@/lib/hooks/use-shot-filters";
import {
  formatCount,
  formatPercent,
  formatPointsPerShot,
  formatShootingPct,
} from "@/lib/viz/format";

/**
 * The dashboard shell: loads the dataset, owns nothing else.
 *
 * Filter state lives in the URL (`useShotFilters`) and every derived number is
 * computed with `useMemo` from the filtered slice, so there is exactly one path
 * from "what is selected" to "what is on screen". No view holds its own copy of
 * the data or the filters.
 */
export function Dashboard() {
  const { status, dataset, error, retry } = useShotDataset();

  if (status === "loading") return <LoadingState />;
  if (status === "error") return <ErrorState message={error} onRetry={retry} />;

  return <DashboardContent dataset={dataset} />;
}

function DashboardContent({ dataset }: { dataset: ShotDataset }) {
  const playerIds = useMemo(
    () => dataset.players.map((player) => player.shooterId),
    [dataset.players],
  );

  const { filters, updateFilters, toggleValue, clearFilters } =
    useShotFilters(playerIds);

  const filtered = useMemo(
    () => applyFilters(dataset.shots, filters),
    [dataset.shots, filters],
  );

  /**
   * When exactly one player is selected the question changes from "which shots
   * are efficient?" to "is this player better than the team from here?", so the
   * colour reference changes with it. Everything else about the view is identical.
   */
  const focusedPlayerId = selectedPlayerId(filters);

  const teamZoneReference = useMemo(
    () => zonePointsPerShotMap(dataset.shots),
    [dataset.shots],
  );

  const zones = useMemo(
    () =>
      buildZoneProfiles(filtered, focusedPlayerId ? teamZoneReference : null),
    [filtered, focusedPlayerId, teamZoneReference],
  );

  const teamProfile = useMemo(() => buildTeamProfile(filtered), [filtered]);

  const referenceLabel = focusedPlayerId ? "team" : "average shot";

  const focusedPlayerName = focusedPlayerId
    ? dataset.players.find((player) => player.shooterId === focusedPlayerId)
        ?.shooterName
    : null;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <Header dataset={dataset} />

      <FilterBar
        players={dataset.players}
        filters={filters}
        matchedShots={filtered.length}
        totalShots={dataset.shots.length}
        onToggle={toggleValue}
        onUpdate={updateFilters}
        onClear={clearFilters}
      />

      {filtered.length === 0 ? (
        <NoMatchState onClear={clearFilters} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Points per shot"
              value={formatPointsPerShot(teamProfile.split.pointsPerShot)}
              detail="Field goals only — no free throws"
            />
            <StatTile
              label="Effective FG%"
              value={formatShootingPct(
                teamProfile.split.effectiveFieldGoalPct,
              )}
              detail={`${formatShootingPct(teamProfile.split.fieldGoalPct)} raw FG%`}
            />
            <StatTile
              label="From below-average spots"
              value={formatPercent(
                teamProfile.belowAverageShareOfAttempts,
                0,
              )}
              detail={`${formatCount(teamProfile.belowAverageAttempts)} attempts`}
            />
            <StatTile
              label="Drew a shooting foul"
              value={formatPercent(teamProfile.split.foulRate, 1)}
              detail="Value not captured in PPS"
            />
          </div>

          <ViewErrorBoundary name="Shot map">
            <Card
              title={
                focusedPlayerName
                  ? `Where ${focusedPlayerName} shoots, and how it compares`
                  : "Where the shots come from, and what they are worth"
              }
              description={
                <>
                  Hex size shows volume. Hex colour shows the points per shot of
                  the zone the hex sits in, measured against{" "}
                  {focusedPlayerName ? "the team's rate in that zone" : "an average attempt"}.
                  Colour is deliberately taken from the zone rather than the
                  individual hex — a single hex holds too few attempts to estimate
                  a rate from once filters are applied.
                </>
              }
            >
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
                {/* Capped so the court does not dominate the page when the
                    table wraps below it on narrower screens. */}
                <div className="mx-auto w-full max-w-xl space-y-4">
                  <ShotMap
                    shots={filtered}
                    zones={zones}
                    referenceLabel={referenceLabel}
                  />
                  <CourtLegend referenceLabel={referenceLabel} />
                </div>
                <ZoneTable zones={zones} referenceLabel={referenceLabel} />
              </div>
            </Card>
          </ViewErrorBoundary>
        </>
      )}
    </div>
  );
}

function Header({ dataset }: { dataset: ShotDataset }) {
  return (
    <header>
      <h1 className="text-lg font-semibold tracking-tight text-ink">
        Shot Profile Dashboard
      </h1>
      <p className="mt-1 text-xs text-ink-secondary">
        {formatCount(dataset.shots.length)} attempts from {dataset.players.length}{" "}
        players, {dataset.dateRange.from} to {dataset.dateRange.to}. All twelve are
        treated as one team.
      </p>
    </header>
  );
}

function LoadingState() {
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <div className="h-6 w-56 animate-pulse rounded bg-gridline" />
      <div className="h-32 animate-pulse rounded-lg bg-gridline" />
      <div className="h-96 animate-pulse rounded-lg bg-gridline" />
      <p className="sr-only" role="status">
        Loading shot data
      </p>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="rounded-lg border border-hairline bg-surface p-6">
        <h1 className="text-sm font-semibold text-ink">
          Could not load the shot data
        </h1>
        <p className="mt-2 text-xs leading-relaxed text-ink-secondary">
          {message}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded bg-accent px-3 py-1.5 text-xs font-medium text-white focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-accent"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

function NoMatchState({ onClear }: { onClear: () => void }) {
  return (
    <div className="rounded-lg border border-hairline bg-surface p-10 text-center">
      <p className="text-sm text-ink">No attempts match these filters.</p>
      <p className="mx-auto mt-1 max-w-md text-xs text-ink-secondary">
        The combination is valid, just empty — contest level and shot clock narrow
        quickly when combined with a single player.
      </p>
      <button
        type="button"
        onClick={onClear}
        className="mt-4 rounded border border-hairline px-3 py-1.5 text-xs font-medium text-ink-secondary hover:border-axis focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-accent"
      >
        Clear filters
      </button>
    </div>
  );
}
