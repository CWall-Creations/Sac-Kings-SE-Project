import { MIN_ATTEMPTS_FOR_CONFIDENCE } from "@/lib/analytics/metrics";
import type { ZoneProfile } from "@/lib/analytics/profiles";
import { COURT_ZONE_LABELS } from "@/lib/analytics/zones";
import { colorForDifference } from "@/lib/viz/diverging";
import {
  formatCount,
  formatPercent,
  formatPointsPerShot,
  formatShootingPct,
  formatSigned,
} from "@/lib/viz/format";

/**
 * The shot map's table twin.
 *
 * Every number the map encodes as position, size, or colour is readable here as
 * text, which is what keeps the view usable without colour vision, without a
 * pointer, and in a printout. It also happens to be the fastest way for a reader
 * who already knows what they are looking for to find it.
 *
 * Zones under the confidence threshold are marked rather than hidden: a coach
 * should see that a cell is thin, not be quietly denied the row.
 */

interface ZoneTableProps {
  zones: readonly ZoneProfile[];
  referenceLabel: string;
}

export function ZoneTable({ zones, referenceLabel }: ZoneTableProps) {
  const withAttempts = zones.filter((zone) => zone.split.attempts > 0);

  if (withAttempts.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-ink-secondary">
        No attempts match these filters.
      </p>
    );
  }

  // Worst first: the point of the view is finding what to stop shooting.
  const ordered = [...withAttempts].sort(
    (a, b) => a.pointsPerShotVsReference - b.pointsPerShotVsReference,
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-sm">
        <caption className="sr-only">
          Shooting by court zone, compared with {referenceLabel}
        </caption>
        <thead>
          <tr className="border-b border-hairline text-left text-xs text-ink-muted">
            <th scope="col" className="py-2 pr-3 font-medium">
              Zone
            </th>
            <th scope="col" className="py-2 px-3 text-right font-medium">
              Att
            </th>
            <th scope="col" className="py-2 px-3 text-right font-medium">
              Share
            </th>
            <th scope="col" className="py-2 px-3 text-right font-medium">
              FG%
            </th>
            <th scope="col" className="py-2 px-3 text-right font-medium">
              PPS
            </th>
            <th scope="col" className="py-2 pl-3 text-right font-medium">
              vs {referenceLabel}
            </th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((zone) => {
            const thin = zone.split.attempts < MIN_ATTEMPTS_FOR_CONFIDENCE;

            return (
              <tr
                key={zone.zone}
                className="border-b border-hairline/60 last:border-0"
              >
                <th
                  scope="row"
                  className="py-2 pr-3 text-left font-normal text-ink"
                >
                  {COURT_ZONE_LABELS[zone.zone]}
                  {thin && (
                    <span className="ml-2 text-[11px] text-ink-muted">
                      small sample
                    </span>
                  )}
                </th>
                <td className="tabular py-2 px-3 text-right text-ink-secondary">
                  {formatCount(zone.split.attempts)}
                </td>
                <td className="tabular py-2 px-3 text-right text-ink-secondary">
                  {formatPercent(zone.shareOfAttempts, 1)}
                </td>
                <td className="tabular py-2 px-3 text-right text-ink-secondary">
                  {formatShootingPct(zone.split.fieldGoalPct)}
                </td>
                <td className="tabular py-2 px-3 text-right text-ink">
                  {formatPointsPerShot(zone.split.pointsPerShot)}
                </td>
                <td className="py-2 pl-3 text-right">
                  <span className="inline-flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{
                        background: colorForDifference(
                          zone.pointsPerShotVsReference,
                        ),
                      }}
                    />
                    <span className="tabular text-ink">
                      {formatSigned(zone.pointsPerShotVsReference)}
                    </span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
