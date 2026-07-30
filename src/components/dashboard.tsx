"use client";

import { useCallback, useMemo, useState } from "react";
import { ContextBreakdownGrid } from "@/components/charts/context-breakdown";
import { InsightList, RoleBadge } from "@/components/charts/insights-panel";
import { PlayerTable } from "@/components/charts/player-table";
import {
  ScatterSizeLegend,
  SelectionMakingScatter,
} from "@/components/charts/selection-making-scatter";
import { CourtLegend } from "@/components/court/court-legend";
import { PassOriginMap } from "@/components/court/pass-origin-map";
import { PassOriginTable } from "@/components/court/pass-origin-table";
import { ShotMap } from "@/components/court/shot-map";
import { ZoneTable } from "@/components/court/zone-table";
import { FilterBar } from "@/components/filters/filter-bar";
import { Card, StatTile } from "@/components/ui/card";
import { ViewErrorBoundary } from "@/components/view-error-boundary";
import {
  buildContextBreakdowns,
  maxPointsPerShot,
} from "@/lib/analytics/breakdowns";
import {
  buildPlayerInsights,
  buildTeamInsights,
} from "@/lib/analytics/insights";
import { analysePassOrigins } from "@/lib/analytics/passes";
import { COURT_ZONES, COURT_ZONE_LABELS, type CourtZone } from "@/lib/analytics/zones";
import {
  buildPlayerProfiles,
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

  /**
   * The comparison view deliberately ignores the player filter.
   *
   * Filtering a twelve-player comparison down to one player leaves nothing to
   * compare, and it would also strip the baseline of the other players it needs to
   * be a baseline at all. So a player selection *emphasises* here while every other
   * filter still applies — the reader sees their pick in the context that gives it
   * meaning.
   */
  const comparisonShots = useMemo(
    () => applyFilters(dataset.shots, { ...filters, playerIds: [] }),
    [dataset.shots, filters],
  );

  const playerProfiles = useMemo(
    () => buildPlayerProfiles(comparisonShots),
    [comparisonShots],
  );

  /**
   * Which shot zone the pass-origin view traces back from.
   *
   * Local state rather than the URL: it selects what one view displays, it does
   * not scope the data every other view is reading. Keeping it out of the query
   * string preserves the rule that a shared link describes a slice of shots.
   */
  const [passOriginZone, setPassOriginZone] = useState<CourtZone>("corner_3");

  const passOrigins = useMemo(
    () => analysePassOrigins(filtered, passOriginZone),
    [filtered, passOriginZone],
  );

  /**
   * The team acts as the reference only when a single player is in focus.
   * Without a selection the slice already is the team, and drawing a benchmark
   * on top of every bar would say nothing.
   */
  const contextBreakdowns = useMemo(
    () =>
      buildContextBreakdowns(
        filtered,
        focusedPlayerId ? comparisonShots : null,
      ),
    [filtered, focusedPlayerId, comparisonShots],
  );

  const contextScaleMax = useMemo(
    () => maxPointsPerShot(contextBreakdowns),
    [contextBreakdowns],
  );

  /**
   * Insights follow the same rule as the scatter: a player selection narrows the
   * subject but the comparison set stays the whole roster, because "below the
   * roster average" is meaningless if the roster has been filtered away.
   */
  const insights = useMemo(() => {
    if (!focusedPlayerId) {
      return {
        role: null,
        items: buildTeamInsights(comparisonShots, playerProfiles),
      };
    }

    const profile = playerProfiles.find(
      (candidate) => candidate.shooterId === focusedPlayerId,
    );
    if (!profile) return { role: null, items: [] };

    const result = buildPlayerInsights(
      profile,
      comparisonShots.filter((shot) => shot.shooterId === focusedPlayerId),
      { teamShots: comparisonShots, teamProfiles: playerProfiles },
    );
    return { role: result.role, items: result.insights };
  }, [focusedPlayerId, comparisonShots, playerProfiles]);

  const focusPlayer = useCallback(
    (shooterId: string) =>
      updateFilters({
        // Clicking the already-selected player clears the selection.
        playerIds: filters.playerIds.includes(shooterId) ? [] : [shooterId],
      }),
    [filters.playerIds, updateFilters],
  );

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
                  : "Checking where shots are coming from and what they are worth"
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
              {/* An even split clipped the table's last column. The court is
                  capped anyway, so it takes a fixed share and the table gets the
                  remainder; below xl the two stack. */}
              <div className="grid gap-6 xl:grid-cols-[minmax(0,23rem)_minmax(0,1fr)] xl:items-start">
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

          <ViewErrorBoundary name="Pass origins">
            <Card
              title="How is the last pass before the shot affecting shot quality?"
              description={
                <>
                  The court read backwards: each hex is a{" "}
                  <em>passer&apos;s</em> position, sized by how many of these shots
                  it created and coloured by what they were worth. Because the shot
                  zone is held fixed, the difference is attributable to how the shot
                  was created rather than where it was taken.
                </>
              }
              actions={
                <label className="flex items-center gap-2 text-xs text-ink-secondary">
                  <span className="text-ink-muted">Trace back from</span>
                  <select
                    value={passOriginZone}
                    onChange={(event) =>
                      setPassOriginZone(event.target.value as CourtZone)
                    }
                    className="rounded border border-hairline bg-surface px-2 py-1 text-xs text-ink focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-accent"
                  >
                    {COURT_ZONES.map((zone) => (
                      <option key={zone} value={zone}>
                        {COURT_ZONE_LABELS[zone]}
                      </option>
                    ))}
                  </select>
                </label>
              }
            >
              <div className="grid gap-6 xl:grid-cols-[minmax(0,23rem)_minmax(0,1fr)] xl:items-start">
                <div className="mx-auto w-full max-w-xl space-y-4">
                  <PassOriginMap analysis={passOrigins} />
                  <CourtLegend
                    referenceLabel="this zone's rate"
                    sizeLabel="Passes"
                    note="Colour comes from the passing region, not the individual hex."
                  />
                </div>
                <PassOriginTable
                  analysis={passOrigins}
                  zoneLabel={COURT_ZONE_LABELS[passOriginZone].toLowerCase()}
                />
              </div>
            </Card>
          </ViewErrorBoundary>

          <ViewErrorBoundary name="Selection vs making">
            <Card
              title="How can we decipher if these shot attempts are high-quality looks or just very skilled, tough buckets?"
              description={
                <>
                  Horizontal position is the average quality of the shots a player
                  chose; vertical distance from the diagonal is how much better or
                  worse they shot them. Each player is measured against a baseline
                  fitted without their own attempts, so nobody is compared to
                  themselves.
                  {focusedPlayerName && (
                    <> {focusedPlayerName} is highlighted; the rest stay for context.</>
                  )}
                </>
              }
              actions={<ScatterSizeLegend profiles={playerProfiles} />}
            >
              {/* Stacked rather than side by side: the table has nine columns
                  and the scatter wants to stay square, so sharing a row forced
                  the table's last columns into a horizontal scroll. */}
              <div className="space-y-7">
                <div className="mx-auto w-full max-w-2xl">
                  <SelectionMakingScatter
                    profiles={playerProfiles}
                    highlightedIds={filters.playerIds}
                    onSelect={focusPlayer}
                  />
                </div>
                <PlayerTable
                  profiles={playerProfiles}
                  highlightedIds={filters.playerIds}
                  onSelect={focusPlayer}
                />
              </div>
            </Card>
          </ViewErrorBoundary>

          <ViewErrorBoundary name="Context breakdown">
            <Card
              title="How the circumstances the shot was taken in affect the efficiency of the shot"
              description={
                <>
                  The same attempts split by the circumstances they were taken in.
                  Buckets stay in their natural order so the shape of each trend is
                  the finding, and every panel shares one scale.
                  {focusedPlayerName && (
                    <> Bars are {focusedPlayerName}; the tick marks the team.</>
                  )}
                </>
              }
            >
              <ContextBreakdownGrid
                breakdowns={contextBreakdowns}
                scaleMax={contextScaleMax}
                referenceLabel={focusedPlayerName ? "Team" : null}
              />
            </Card>
          </ViewErrorBoundary>

          <ViewErrorBoundary name="Insights">
            <Card
              title={
                focusedPlayerName
                  ? `${focusedPlayerName} — how he could better serve the offence`
                  : "Insights on how to better improve the overall team based on the data collected"
              }
              description={
                focusedPlayerName ? (
                  <>
                    Read against his inferred role, because the same shot means
                    different things for different jobs. Every projection names the
                    assumption it rests on.
                  </>
                ) : (
                  <>
                    Tactical and roster-level conclusions, ordered by the points at
                    stake. These recompute from whatever is filtered above, so they
                    always describe the slice on screen.
                  </>
                )
              }
            >
              <div className="space-y-5">
                {insights.role && <RoleBadge role={insights.role} />}
                <InsightList insights={insights.items} />
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
