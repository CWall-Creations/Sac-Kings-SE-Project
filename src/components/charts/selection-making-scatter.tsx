"use client";

import { scaleLinear, scaleSqrt } from "d3-scale";
import { useMemo } from "react";
import {
  FloatingTooltip,
  TooltipRow,
  useTooltipPointer,
} from "@/components/ui/floating-tooltip";
import type { PlayerShotProfile } from "@/lib/analytics/profiles";
import { spreadVertically } from "@/lib/viz/label-layout";
import {
  formatCount,
  formatPointsPerShot,
  formatShootingPct,
  formatSigned,
  formatSignedPoints,
} from "@/lib/viz/format";

/**
 * Shot selection against shot making.
 *
 * The dashboard's central view. x is the average quality of the shots a player
 * chose; y is what those shots actually produced. The diagonal is "shot went in at
 * the expected rate", so *horizontal* position answers "are these good shots?" and
 * *distance from the diagonal* answers "does the player make them?" — two
 * questions that a single efficiency number silently averages together.
 *
 * Encoding decisions:
 *
 *   - **One colour for all twelve players, plus a direct label each.** A scatter is
 *     an all-pairs form: any two marks can end up adjacent, so a categorical
 *     palette would need twelve mutually distinguishable hues, which does not exist
 *     under colour-vision deficiency. Identity therefore comes from the label, and
 *     the accent hue is free to mean "selected".
 *   - **Equal domains on both axes**, so the diagonal is a true 45° and the
 *     vertical gap to it is readable as points per shot. This also makes a real
 *     finding visible: the horizontal spread (0.16) is narrower than the vertical
 *     (0.34) — across this roster, shot making varies more than shot selection.
 *   - **Error bars at ±1 standard error**, which is what keeps the 32-attempt
 *     player from reading as the worst shooter on the team: his bar is wider than
 *     the entire spread of everyone else's.
 */

/**
 * Choose which players to name on the chart.
 *
 * Labelling all twelve was the first attempt and it failed: seven of them sit
 * inside 0.06 points per shot, so spreading their labels far enough apart pushed
 * each one so far from its bubble that the leader lines became unreadable — and
 * indistinguishable from the error bars they crossed. Naming every mark is also
 * just clutter; the table names everyone, and hover names any single bubble.
 *
 * So labels go to the marks that carry the story: the extremes of shot making,
 * the extremes of shot selection, anything with too small a sample to trust, and
 * whatever the reader has selected or is pointing at.
 */
export function selectLabelledPlayers(
  profiles: readonly PlayerShotProfile[],
  highlightedIds: readonly string[],
  hoveredId: string | null,
): Set<string> {
  const labelled = new Set<string>(highlightedIds);
  if (hoveredId) labelled.add(hoveredId);

  if (profiles.length === 0) return labelled;

  const extremeOf = (
    key: (profile: PlayerShotProfile) => number,
  ): [string, string] => {
    const sorted = [...profiles].sort((a, b) => key(a) - key(b));
    return [sorted[0].shooterId, sorted[sorted.length - 1].shooterId];
  };

  // Best and worst shot making, adjusted for sample size.
  for (const id of extremeOf((p) => p.shrunkPointsPerShotAboveExpected)) {
    labelled.add(id);
  }
  // Best and worst shot selection.
  for (const id of extremeOf((p) => p.expectedPointsPerShot)) {
    labelled.add(id);
  }
  // Small samples earn a label so the caveat travels with the mark.
  for (const profile of profiles) {
    if (!profile.isReliable) labelled.add(profile.shooterId);
  }

  return labelled;
}

/** Plot area, in SVG user units. Square, so the diagonal is a true 45°. */
const PLOT = 300;
const MARGIN = { top: 14, right: 104, bottom: 44, left: 50 };
const WIDTH = PLOT + MARGIN.left + MARGIN.right;
const HEIGHT = PLOT + MARGIN.top + MARGIN.bottom;

/** Padding around the data range, in points per shot. */
const DOMAIN_PADDING = 0.06;
/** Vertical space one label needs, in user units. */
const LABEL_GAP = 14;

interface ScatterProps {
  profiles: readonly PlayerShotProfile[];
  /** Shooter IDs to emphasise; others recede. Empty means all equal. */
  highlightedIds: readonly string[];
  onSelect: (shooterId: string) => void;
}

export function SelectionMakingScatter({
  profiles,
  highlightedIds,
  onSelect,
}: ScatterProps) {
  const tooltip = useTooltipPointer<PlayerShotProfile>();

  const layout = useMemo(() => {
    if (profiles.length === 0) return null;

    /**
     * Scaled to the points, not to the error bars.
     *
     * Letting the bars set the domain is tempting for tidiness and ruins the
     * chart: the 32-attempt player's standard error is 0.22, which alone widens
     * the axes by half again and squashes all twelve players into a corner. The
     * bars are clipped to the plot instead — a bar running off the edge reads as
     * "this estimate is enormously uncertain", which is the honest message.
     */
    const values = profiles.flatMap((profile) => [
      profile.expectedPointsPerShot,
      profile.split.pointsPerShot,
    ]);

    const domain: [number, number] = [
      Math.min(...values) - DOMAIN_PADDING,
      Math.max(...values) + DOMAIN_PADDING,
    ];

    const x = scaleLinear().domain(domain).range([0, PLOT]);
    // Shared domain with x; inverted because SVG y grows downward.
    const y = scaleLinear().domain(domain).range([PLOT, 0]);

    const radius = scaleSqrt()
      .domain([0, Math.max(...profiles.map((p) => p.split.attempts))])
      .range([4, 17]);

    const points = profiles.map((profile) => ({
      profile,
      cx: x(profile.expectedPointsPerShot),
      cy: y(profile.split.pointsPerShot),
      r: radius(profile.split.attempts),
    }));

    return { x, y, domain, points };
  }, [profiles]);

  const labelled = useMemo(
    () =>
      selectLabelledPlayers(
        profiles,
        highlightedIds,
        tooltip.target?.shooterId ?? null,
      ),
    [profiles, highlightedIds, tooltip.target],
  );

  /**
   * Spread only the labels actually being drawn. Including hidden ones would
   * reserve space for names nobody can see and push the visible labels away from
   * their marks for no reason.
   */
  const labelLayout = useMemo(() => {
    if (!layout) return null;

    const visible = layout.points.filter((point) =>
      labelled.has(point.profile.shooterId),
    );
    const { positions, adjusted } = spreadVertically(
      visible.map((point) => point.cy),
      LABEL_GAP,
      { min: 4, max: PLOT - 4 },
    );

    const yById = new Map<string, number>();
    visible.forEach((point, index) => {
      yById.set(point.profile.shooterId, positions[index]);
    });

    return { yById, needsLeaders: adjusted };
  }, [layout, labelled]);

  if (!layout || !labelLayout) {
    return (
      <p className="py-12 text-center text-sm text-ink-secondary">
        No players match these filters.
      </p>
    );
  }

  const { x, y, domain, points } = layout;
  const { yById, needsLeaders } = labelLayout;
  const ticks = x.ticks(5);
  const isEmphasised = (shooterId: string) =>
    highlightedIds.length === 0 || highlightedIds.includes(shooterId);

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label="Shot selection against shot making for each player. Horizontal position is the average quality of the shots chosen; vertical distance above or below the diagonal is how much better or worse the player shot them. The same values are in the table below."
      >
        <defs>
          {/* Confines the error bars to the plot. A bar wider than the axes is
              clipped rather than allowed to rescale everything. */}
          <clipPath id="scatter-plot-clip">
            <rect x={0} y={0} width={PLOT} height={PLOT} />
          </clipPath>
        </defs>

        <g transform={`translate(${MARGIN.left} ${MARGIN.top})`}>
          {/* Gridlines: solid hairlines, one shade off the surface. */}
          <g stroke="var(--gridline)" strokeWidth={1}>
            {ticks.map((tick) => (
              <line key={`gx${tick}`} x1={x(tick)} y1={0} x2={x(tick)} y2={PLOT} />
            ))}
            {ticks.map((tick) => (
              <line key={`gy${tick}`} x1={0} y1={y(tick)} x2={PLOT} y2={y(tick)} />
            ))}
          </g>

          {/* The expectation line: actual == expected. */}
          <line
            x1={x(domain[0])}
            y1={y(domain[0])}
            x2={x(domain[1])}
            y2={y(domain[1])}
            stroke="var(--axis)"
            strokeWidth={1.5}
          />
          <text
            x={PLOT - 6}
            y={y(domain[1]) + 14}
            textAnchor="end"
            className="fill-[var(--text-muted)] text-[10px]"
          >
            shot as expected
          </text>
          <text
            x={6}
            y={12}
            className="fill-[var(--text-muted)] text-[10px]"
          >
            ↑ made more than the shots implied
          </text>
          <text
            x={PLOT - 6}
            y={PLOT - 8}
            textAnchor="end"
            className="fill-[var(--text-muted)] text-[10px]"
          >
            made less ↓
          </text>

          {/* Axes */}
          <g stroke="var(--axis)" strokeWidth={1}>
            <line x1={0} y1={PLOT} x2={PLOT} y2={PLOT} />
            <line x1={0} y1={0} x2={0} y2={PLOT} />
          </g>
          <g className="fill-[var(--text-muted)] text-[10px]">
            {ticks.map((tick) => (
              <text
                key={`tx${tick}`}
                x={x(tick)}
                y={PLOT + 14}
                textAnchor="middle"
                className="tabular"
              >
                {formatPointsPerShot(tick)}
              </text>
            ))}
            {ticks.map((tick) => (
              <text
                key={`ty${tick}`}
                x={-8}
                y={y(tick) + 3}
                textAnchor="end"
                className="tabular"
              >
                {formatPointsPerShot(tick)}
              </text>
            ))}
          </g>
          <text
            x={PLOT / 2}
            y={PLOT + 34}
            textAnchor="middle"
            className="fill-[var(--text-secondary)] text-[11px]"
          >
            Shot selection — expected points per shot
          </text>
          <text
            transform={`translate(-36 ${PLOT / 2}) rotate(-90)`}
            textAnchor="middle"
            className="fill-[var(--text-secondary)] text-[11px]"
          >
            Actual points per shot
          </text>

          {/*
            Drawn in four passes rather than one group per player, because a
            per-player group lets each bubble paint over the previous player's
            label. Order: error bars, leader lines, bubbles, then all labels on
            top of everything.
          */}
          <g clipPath="url(#scatter-plot-clip)" stroke="var(--axis)" strokeWidth={1.5}>
            {points.map((point) => (
              <line
                key={point.profile.shooterId}
                x1={point.cx}
                y1={y(point.profile.split.pointsPerShot - point.profile.standardError)}
                x2={point.cx}
                y2={y(point.profile.split.pointsPerShot + point.profile.standardError)}
                opacity={isEmphasised(point.profile.shooterId) ? 1 : 0.28}
              />
            ))}
          </g>

          {needsLeaders && (
            <g stroke="var(--text-muted)" strokeWidth={0.75} fill="none">
              {points
                .filter((point) => yById.has(point.profile.shooterId))
                .map((point) => {
                  const labelY = yById.get(point.profile.shooterId)!;
                  // Only draw a leader when the label actually had to move; a
                  // line to a label already beside its mark is noise.
                  if (Math.abs(labelY - point.cy) < 3) return null;

                  return (
                    <line
                      key={point.profile.shooterId}
                      x1={point.cx + point.r + 1}
                      y1={point.cy}
                      x2={point.cx + point.r + 6}
                      y2={labelY}
                      opacity={isEmphasised(point.profile.shooterId) ? 0.55 : 0.2}
                    />
                  );
                })}
            </g>
          )}

          <g>
            {points.map((point) => {
              const active =
                tooltip.target?.shooterId === point.profile.shooterId;

              return (
                // A 2px surface ring rather than a border, so overlapping marks
                // stay separable without drawing outlines around them.
                <circle
                  key={point.profile.shooterId}
                  cx={point.cx}
                  cy={point.cy}
                  r={point.r}
                  fill="var(--accent)"
                  fillOpacity={active ? 1 : 0.78}
                  stroke="var(--surface-1)"
                  strokeWidth={2}
                  opacity={isEmphasised(point.profile.shooterId) ? 1 : 0.28}
                />
              );
            })}
          </g>

          <g>
            {points
              .filter((point) => yById.has(point.profile.shooterId))
              .map((point) => {
              const { profile } = point;
              const active = tooltip.target?.shooterId === profile.shooterId;

              return (
                <text
                  key={profile.shooterId}
                  x={point.cx + point.r + 7}
                  y={yById.get(profile.shooterId)! + 3}
                  opacity={isEmphasised(profile.shooterId) ? 1 : 0.28}
                  // Surface-coloured halo, so a label crossing a bubble or a
                  // gridline stays readable without a background rectangle.
                  stroke="var(--surface-1)"
                  strokeWidth={3}
                  paintOrder="stroke"
                  className={[
                    "text-[11px] fill-[var(--text-primary)]",
                    active ? "font-semibold" : "",
                  ].join(" ")}
                >
                  {profile.shooterName}
                  {!profile.isReliable && (
                    <tspan className="fill-[var(--text-muted)]"> ·small n</tspan>
                  )}
                </text>
              );
            })}
          </g>

          {/* Hit targets last, so they capture the pointer over everything. */}
          <g>
            {points.map((point) => (
              <circle
                key={point.profile.shooterId}
                cx={point.cx}
                cy={point.cy}
                r={Math.max(point.r + 6, 13)}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={(event) => tooltip.show(point.profile, event)}
                onMouseMove={tooltip.move}
                onMouseLeave={tooltip.hide}
                onClick={() => onSelect(point.profile.shooterId)}
              />
            ))}
          </g>
        </g>
      </svg>

      <figcaption className="mt-1 text-[11px] leading-snug text-ink-muted">
        Bubble size is attempts; the vertical bar is ±1 standard error, clipped
        where it runs past the axes. The extremes are named and the rest are in the
        table — hover any bubble for its name, or click to filter the dashboard.
      </figcaption>

      {tooltip.target && (
        <FloatingTooltip pointer={tooltip.pointer}>
          <PlayerTooltipContent profile={tooltip.target} />
        </FloatingTooltip>
      )}
    </figure>
  );
}

function PlayerTooltipContent({ profile }: { profile: PlayerShotProfile }) {
  return (
    <>
      <div className="font-medium text-ink">{profile.shooterName}</div>
      <dl className="mt-1 space-y-0.5 text-ink-secondary">
        <TooltipRow label="Attempts">
          {formatCount(profile.split.attempts)}
        </TooltipRow>
        <TooltipRow label="eFG%">
          {formatShootingPct(profile.split.effectiveFieldGoalPct)}
        </TooltipRow>
        <TooltipRow label="Shot quality">
          {formatPointsPerShot(profile.expectedPointsPerShot)}
        </TooltipRow>
        <TooltipRow label="Actual">
          {formatPointsPerShot(profile.split.pointsPerShot)}
        </TooltipRow>
        <TooltipRow label="Adjusted diff">
          {formatSigned(profile.shrunkPointsPerShotAboveExpected)}
        </TooltipRow>
        <TooltipRow label="Season points">
          {formatSignedPoints(profile.pointsAboveExpected)}
        </TooltipRow>
      </dl>
      {!profile.isReliable && (
        <p className="mt-1.5 max-w-40 text-[11px] leading-snug text-ink-muted">
          Under 100 attempts — the adjusted figure is pulled well toward zero.
        </p>
      )}
    </>
  );
}

/** Attempts legend for the bubble sizes, kept beside the chart. */
export function ScatterSizeLegend({
  profiles,
}: {
  profiles: readonly PlayerShotProfile[];
}) {
  if (profiles.length === 0) return null;

  const max = Math.max(...profiles.map((profile) => profile.split.attempts));
  const radius = scaleSqrt().domain([0, max]).range([4, 17]);
  const samples = [Math.round(max / 8), Math.round(max / 2), max];

  return (
    <div className="flex items-end gap-4 text-[10px] text-ink-muted">
      {samples.map((attempts) => (
        <div key={attempts} className="flex flex-col items-center gap-1">
          <svg width={38} height={38} aria-hidden="true">
            <circle
              cx={19}
              cy={19}
              r={radius(attempts)}
              fill="var(--accent)"
              fillOpacity={0.78}
            />
          </svg>
          <span className="tabular">{formatCount(attempts)}</span>
        </div>
      ))}
      <span className="pb-3">attempts</span>
    </div>
  );
}
