"use client";

import {
  CONTEST_LEVELS,
  CONTEST_LEVEL_LABELS,
  DRIBBLE_BUCKETS,
  DRIBBLE_BUCKET_LABELS,
  SHOT_CLOCK_BUCKETS,
  SHOT_CLOCK_BUCKET_LABELS,
  SHOT_TYPES,
  type PlayerSummary,
} from "@/lib/data/types";
import {
  activeFilterCount,
  type FilterValue,
  type MultiSelectFilterKey,
  type ShotFilters,
} from "@/lib/filters";
import { formatCount } from "@/lib/viz/format";
import { ToggleGroup } from "@/components/ui/toggle-group";

/**
 * One filter row, above everything it scopes.
 *
 * Every view below re-renders against the same slice — there are deliberately no
 * per-chart filters, which would let two charts on screen disagree about what
 * "this" means.
 */

interface FilterBarProps {
  players: readonly PlayerSummary[];
  filters: ShotFilters;
  matchedShots: number;
  totalShots: number;
  onToggle: <K extends MultiSelectFilterKey>(
    key: K,
    value: FilterValue<K>,
  ) => void;
  onUpdate: (patch: Partial<ShotFilters>) => void;
  onClear: () => void;
}

export function FilterBar({
  players,
  filters,
  matchedShots,
  totalShots,
  onToggle,
  onUpdate,
  onClear,
}: FilterBarProps) {
  const activeCount = activeFilterCount(filters);

  return (
    <div className="rounded-lg border border-hairline bg-surface p-4">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs text-ink-secondary">
          <span className="tabular font-medium text-ink">
            {formatCount(matchedShots)}
          </span>{" "}
          of {formatCount(totalShots)} attempts
          {activeCount > 0 && (
            <span className="text-ink-muted">
              {" "}
              · {activeCount} filter{activeCount === 1 ? "" : "s"} active
            </span>
          )}
        </p>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="rounded text-xs font-medium text-accent underline-offset-2 hover:underline focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-accent"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ToggleGroup
            legend="Player"
            options={players.map((player) => ({
              value: player.shooterId,
              label: player.shooterName,
              hint: formatCount(player.attempts),
            }))}
            selected={filters.playerIds}
            onToggle={(value) => onToggle("playerIds", value)}
          />
        </div>

        <ToggleGroup
          legend="Contest level"
          options={CONTEST_LEVELS.map((level) => ({
            value: level,
            label: CONTEST_LEVEL_LABELS[level],
          }))}
          selected={filters.contestLevels}
          onToggle={(value) => onToggle("contestLevels", value)}
        />

        <ToggleGroup
          legend="Shot clock"
          options={SHOT_CLOCK_BUCKETS.map((bucket) => ({
            value: bucket,
            label: SHOT_CLOCK_BUCKET_LABELS[bucket],
          }))}
          selected={filters.shotClockBuckets}
          onToggle={(value) => onToggle("shotClockBuckets", value)}
        />

        <ToggleGroup
          legend="Dribbles before"
          options={DRIBBLE_BUCKETS.map((bucket) => ({
            value: bucket,
            label: DRIBBLE_BUCKET_LABELS[bucket],
          }))}
          selected={filters.dribbleBuckets}
          onToggle={(value) => onToggle("dribbleBuckets", value)}
        />

        <ToggleGroup
          legend="Shot type"
          options={SHOT_TYPES.map((type) => ({
            value: type,
            label: type.charAt(0).toUpperCase() + type.slice(1),
          }))}
          selected={filters.shotTypes}
          onToggle={(value) => onToggle("shotTypes", value)}
        />

        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-ink-muted">
            Situation
          </legend>
          <div className="flex flex-wrap gap-1.5">
            <Switch
              label="Clutch only"
              title="Period 4 or later, under 5 minutes remaining"
              checked={filters.clutchOnly}
              onChange={(checked) => onUpdate({ clutchOnly: checked })}
            />
            <Switch
              label="Off a pass"
              title="A teammate passed to the shooter"
              checked={filters.assistedOnly}
              onChange={(checked) => onUpdate({ assistedOnly: checked })}
            />
          </div>
        </fieldset>
      </div>
    </div>
  );
}

function Switch({
  label,
  title,
  checked,
  onChange,
}: {
  label: string;
  title: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      title={title}
      className={[
        "cursor-pointer rounded-full border px-2.5 py-1 text-xs transition-colors",
        "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent",
        checked
          ? "border-transparent bg-accent text-white"
          : "border-hairline text-ink-secondary hover:border-axis",
      ].join(" ")}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}
