import { MIN_ATTEMPTS_FOR_CONFIDENCE } from "@/lib/analytics/metrics";
import type { PassOriginAnalysis } from "@/lib/analytics/passes";
import { colorForDifference } from "@/lib/viz/diverging";
import {
  formatCount,
  formatPercent,
  formatPointsPerShot,
  formatShootingPct,
  formatSigned,
} from "@/lib/viz/format";

/**
 * The pass-origin map's table twin.
 *
 * Carries the origins the map cannot draw — backcourt outlets sit outside the
 * half court — so the totals here are complete even where the court is cropped.
 */

interface PassOriginTableProps {
  analysis: PassOriginAnalysis;
  /** Human-readable name of the shot zone being traced. */
  zoneLabel: string;
}

export function PassOriginTable({ analysis, zoneLabel }: PassOriginTableProps) {
  /**
   * Best first, but only among origins with enough attempts to rank.
   *
   * A straight sort by points per shot put a sixteen-attempt backcourt row at the
   * top on 1.69 — the loudest number in the table produced by the least evidence.
   * Thin rows are kept (hiding them would hide real attempts) but sorted below the
   * ones that can carry a ranking.
   */
  const rows = analysis.origins
    .filter((origin) => origin.split.attempts > 0)
    .sort((a, b) => {
      const aThin = a.split.attempts < MIN_ATTEMPTS_FOR_CONFIDENCE;
      const bThin = b.split.attempts < MIN_ATTEMPTS_FOR_CONFIDENCE;
      if (aThin !== bThin) return aThin ? 1 : -1;
      return b.split.pointsPerShot - a.split.pointsPerShot;
    });

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-ink-secondary">
        None of these attempts came off a pass.
      </p>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] border-collapse text-sm">
          <caption className="sr-only">
            Where the passes creating {zoneLabel} attempts came from, and what
            those attempts were worth
          </caption>
          <thead>
            <tr className="border-b border-hairline text-left text-xs text-ink-muted">
              <th scope="col" className="py-2 pr-3 font-medium">
                Pass came from
              </th>
              <th scope="col" className="py-2 px-3 text-right font-medium">
                Shots
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
                vs zone
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((origin) => {
              const thin = origin.split.attempts < MIN_ATTEMPTS_FOR_CONFIDENCE;

              return (
                <tr
                  key={origin.origin}
                  className="border-b border-hairline/60 last:border-0"
                >
                  <th
                    scope="row"
                    className="py-2 pr-3 text-left font-normal text-ink"
                  >
                    {origin.label}
                    {thin && (
                      <span className="ml-2 text-[11px] text-ink-muted">
                        small sample
                      </span>
                    )}
                  </th>
                  <td className="tabular py-2 px-3 text-right text-ink-secondary">
                    {formatCount(origin.split.attempts)}
                  </td>
                  <td className="tabular py-2 px-3 text-right text-ink-secondary">
                    {formatPercent(origin.shareOfPassed, 0)}
                  </td>
                  <td className="tabular py-2 px-3 text-right text-ink-secondary">
                    {formatShootingPct(origin.split.fieldGoalPct)}
                  </td>
                  <td className="tabular py-2 px-3 text-right text-ink">
                    {formatPointsPerShot(origin.split.pointsPerShot)}
                  </td>
                  <td className="py-2 pl-3 text-right">
                    <span className="inline-flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{
                          background: colorForDifference(
                            origin.pointsPerShotVsSelection,
                          ),
                        }}
                      />
                      <span className="tabular text-ink">
                        {formatSigned(origin.pointsPerShotVsSelection)}
                      </span>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] leading-snug text-ink-muted">
        {formatCount(analysis.selectionAttempts)} {zoneLabel} attempts, worth{" "}
        {formatPointsPerShot(analysis.selectionPointsPerShot)} overall — the figure
        each row is measured against.
        {analysis.unpassedAttempts > 0 && (
          <>
            {" "}
            A further {formatCount(analysis.unpassedAttempts)} came with no pass at
            all and are excluded here.
          </>
        )}
      </p>
    </div>
  );
}
