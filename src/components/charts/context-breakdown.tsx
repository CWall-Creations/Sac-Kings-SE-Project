import type { ContextBreakdown } from "@/lib/analytics/breakdowns";
import { MIN_ATTEMPTS_FOR_CONFIDENCE } from "@/lib/analytics/metrics";
import {
  formatCount,
  formatPointsPerShot,
  formatShare,
  formatShootingPct,
} from "@/lib/viz/format";

/**
 * Shooting by situational context, as small multiples.
 *
 * Built as a table with a bar in one column rather than as a chart plus a
 * separate table underneath. Every value is text in the same row as the mark that
 * encodes it, so the chart and its accessible twin are the same element and can
 * never disagree.
 *
 * Two rules the panels depend on:
 *
 *   - **Buckets stay in their canonical order**, never sorted by value. All four
 *     dimensions are ordered, and the question a reader is asking is whether the
 *     trend is monotonic — sorting by efficiency would answer it before they look.
 *   - **Every panel shares one scale.** Small multiples normalised individually
 *     invite comparisons between panels that the geometry does not support.
 */

interface ContextBreakdownGridProps {
  breakdowns: readonly ContextBreakdown[];
  /** Shared upper bound, in points per shot. */
  scaleMax: number;
  /** Name of the reference series, when one is drawn. */
  referenceLabel: string | null;
}

export function ContextBreakdownGrid({
  breakdowns,
  scaleMax,
  referenceLabel,
}: ContextBreakdownGridProps) {
  return (
    <div>
      {referenceLabel && <ReferenceLegend referenceLabel={referenceLabel} />}

      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2">
        {breakdowns.map((breakdown) => (
          <ContextPanel
            key={breakdown.id}
            breakdown={breakdown}
            scaleMax={scaleMax}
            referenceLabel={referenceLabel}
          />
        ))}
      </div>

      <p className="mt-4 text-[11px] text-ink-muted">
        Bars are points per shot on a shared scale from 0 to{" "}
        {formatPointsPerShot(scaleMax)}, so panels are comparable with each other.
        Field goals only — a shooting foul contributes nothing here.
      </p>
    </div>
  );
}

function ReferenceLegend({ referenceLabel }: { referenceLabel: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-4 text-[11px] text-ink-secondary">
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="h-2.5 w-5 rounded-r-sm bg-accent"
        />
        Selected player
      </span>
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="h-3.5 w-0.5 bg-[var(--text-primary)]"
        />
        {referenceLabel}
      </span>
    </div>
  );
}

function ContextPanel({
  breakdown,
  scaleMax,
  referenceLabel,
}: {
  breakdown: ContextBreakdown;
  scaleMax: number;
  referenceLabel: string | null;
}) {
  return (
    <section>
      <h3 className="text-xs font-semibold text-ink">{breakdown.label}</h3>
      <p className="mb-2 text-[11px] text-ink-muted">{breakdown.question}</p>

      <table className="w-full border-collapse text-xs">
        <caption className="sr-only">
          {breakdown.label}: points per shot, attempts, and field goal percentage
          by bucket
          {referenceLabel ? `, compared with ${referenceLabel}` : ""}
        </caption>
        <thead>
          <tr className="text-ink-muted">
            <th scope="col" className="w-[9.5rem] pb-1 text-left font-medium">
              <span className="sr-only">Bucket</span>
            </th>
            <th scope="col" className="pb-1 text-left font-medium">
              <span className="sr-only">Points per shot</span>
            </th>
            <th scope="col" className="w-11 pb-1 text-right font-medium">
              PPS
            </th>
            <th scope="col" className="w-12 pb-1 text-right font-medium">
              Att
            </th>
            <th scope="col" className="w-12 pb-1 text-right font-medium">
              FG%
            </th>
          </tr>
        </thead>
        <tbody>
          {breakdown.buckets.map((bucket) => {
            const empty = bucket.split.attempts === 0;
            const thin =
              !empty && bucket.split.attempts < MIN_ATTEMPTS_FOR_CONFIDENCE;

            return (
              <tr key={bucket.key} className="align-middle">
                <th
                  scope="row"
                  className="py-1 pr-2 text-left font-normal text-ink-secondary"
                >
                  {bucket.label}
                  {!empty && (
                    <span className="ml-1 text-ink-muted">
                      {formatShare(bucket.shareOfAttempts)}
                    </span>
                  )}
                </th>

                <td className="py-1 pr-3">
                  <Bar
                    value={bucket.split.pointsPerShot}
                    reference={bucket.referencePointsPerShot}
                    max={scaleMax}
                    muted={thin}
                    empty={empty}
                  />
                </td>

                <td className="tabular py-1 text-right text-ink">
                  {empty ? "—" : formatPointsPerShot(bucket.split.pointsPerShot)}
                </td>
                <td className="tabular py-1 text-right text-ink-secondary">
                  {empty ? "—" : formatCount(bucket.split.attempts)}
                </td>
                <td className="tabular py-1 text-right text-ink-secondary">
                  {empty ? "—" : formatShootingPct(bucket.split.fieldGoalPct)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function Bar({
  value,
  reference,
  max,
  muted,
  empty,
}: {
  value: number;
  reference: number | null;
  max: number;
  /** Sample too small to read confidently; drawn faded. */
  muted: boolean;
  empty: boolean;
}) {
  const percent = Math.min(100, (value / max) * 100);
  const referencePercent =
    reference === null ? null : Math.min(100, (reference / max) * 100);

  return (
    <div
      className="relative h-3.5 w-full min-w-16 rounded-sm bg-gridline"
      // The row already states the value in text; this is decoration for it.
      aria-hidden="true"
    >
      {!empty && (
        <div
          className="absolute inset-y-0 left-0 rounded-r-[4px] bg-accent"
          style={{ width: `${percent}%`, opacity: muted ? 0.4 : 1 }}
        />
      )}
      {referencePercent !== null && (
        // A tick rather than a second bar: the team is a benchmark, not a peer
        // series, and shape carries the distinction so colour need not.
        <span
          className="absolute -inset-y-0.5 w-0.5 bg-[var(--text-primary)]"
          style={{ left: `calc(${referencePercent}% - 1px)` }}
        />
      )}
    </div>
  );
}
