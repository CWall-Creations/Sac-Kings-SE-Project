"use client";

import { scaleSqrt } from "d3-scale";
import { useMemo } from "react";
import {
  FloatingTooltip,
  TooltipRow,
  useTooltipPointer,
} from "@/components/ui/floating-tooltip";
import {
  DEFAULT_HEX_RADIUS_FEET,
  type Bin,
  binPoints,
  hexPath,
} from "@/lib/analytics/hexbin";
import {
  PASS_ORIGIN_DESCRIPTIONS,
  type PassOrigin,
  type PassOriginAnalysis,
  type PassedShot,
} from "@/lib/analytics/passes";
import {
  VIEW_BOX,
  isWithinView,
  toSvgX,
  toSvgY,
} from "@/lib/viz/court-projection";
import { colorForDifference } from "@/lib/viz/diverging";
import { formatCount, formatPointsPerShot } from "@/lib/viz/format";
import { CourtDiagram } from "./court-diagram";

/**
 * Where the passes that created a given shot came from.
 *
 * The court is read backwards here: each hex marks a *passer's* position, sized
 * by how many of the selected shots it created and coloured by what those shots
 * were worth. Because the shot zone is held fixed, location is controlled for and
 * the colour is attributable to how the shot was created rather than where it was
 * taken from.
 *
 * Colour comes from the origin region rather than the individual hex, for the same
 * reason it does on the shot map: a single hex holds far too few attempts to
 * estimate a rate from, while an origin region holds hundreds.
 */

/** Passes below this in an origin are drawn but never coloured confidently. */
const SIZE_PERCENTILE = 0.95;

/** Named so it can be referenced without a `typeof` on the props object. */
type OriginSummary = PassOriginAnalysis["origins"][number];

interface PassOriginMapProps {
  analysis: PassOriginAnalysis;
}

export function PassOriginMap({ analysis }: PassOriginMapProps) {
  const tooltip = useTooltipPointer<Bin<PassedShot>>();

  const origins = analysis.origins;

  const differenceByOrigin = useMemo(() => {
    const map = new Map<PassOrigin, number>();
    for (const origin of origins) {
      map.set(origin.origin, origin.pointsPerShotVsSelection);
    }
    return map;
  }, [origins]);

  const summaryByOrigin = useMemo(() => {
    const map = new Map<PassOrigin, OriginSummary>();
    for (const origin of origins) map.set(origin.origin, origin);
    return map;
  }, [origins]);

  /**
   * Passers standing outside the drawn half court — mostly outlets thrown from
   * the defensive end. They stay in the table; the count is surfaced rather than
   * left as an unexplained gap between the map and the numbers beside it.
   */
  const passed = analysis.passed;
  const { bins, offMap } = useMemo(() => {
    const onCourt = passed.filter((entry) => isWithinView(entry.passer));
    return {
      bins: binPoints(onCourt, (entry) => entry.passer),
      offMap: passed.length - onCourt.length,
    };
  }, [passed]);

  const sizeScale = useMemo(() => {
    const counts = bins.map((bin) => bin.items.length).sort((a, b) => a - b);
    const ceiling =
      counts.length > 0
        ? counts[
            Math.min(counts.length - 1, Math.floor(counts.length * SIZE_PERCENTILE))
          ]
        : 1;

    return scaleSqrt()
      .domain([1, Math.max(2, ceiling)])
      .range([DEFAULT_HEX_RADIUS_FEET * 0.3, DEFAULT_HEX_RADIUS_FEET])
      .clamp(true);
  }, [bins]);

  if (analysis.passed.length === 0) {
    return (
      <div className="relative">
        <svg viewBox={VIEW_BOX} className="w-full opacity-40" aria-hidden="true">
          <CourtDiagram />
        </svg>
        <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-ink-secondary">
          None of these attempts came off a pass.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      <svg
        viewBox={VIEW_BOX}
        className="w-full"
        role="img"
        aria-label={`Court showing where the passes that created these ${formatCount(analysis.passed.length)} shots came from. Hex size is the number of passes; colour is the points per shot of the resulting attempts. The same values are in the table.`}
      >
        <CourtDiagram />

        <g>
          {bins.map((bin) => {
            // Colour by the plurality origin in the bin, which is what the
            // region-level rate actually describes.
            const origin = pluralityOrigin(bin);
            const difference = differenceByOrigin.get(origin) ?? 0;

            return (
              <g
                key={`${bin.column},${bin.row}`}
                transform={`translate(${toSvgX(bin.y)} ${toSvgY(bin.x)})`}
              >
                <path
                  d={hexPath(sizeScale(bin.items.length))}
                  fill={colorForDifference(difference)}
                  stroke="var(--surface-1)"
                  strokeWidth={0.06}
                />
                <path
                  d={hexPath(DEFAULT_HEX_RADIUS_FEET)}
                  fill="transparent"
                  stroke="none"
                  onMouseEnter={(event) => tooltip.show(bin, event)}
                  onMouseMove={tooltip.move}
                  onMouseLeave={tooltip.hide}
                />
              </g>
            );
          })}
        </g>
      </svg>

      {offMap > 0 && (
        <p className="mt-2 text-[11px] leading-snug text-ink-muted">
          {formatCount(offMap)} of {formatCount(analysis.passed.length)} passes came
          from outside the drawn half court — mostly outlets thrown from the
          defensive end. They are counted in the table.
        </p>
      )}

      {tooltip.target && (
        <FloatingTooltip pointer={tooltip.pointer}>
          <PassTooltipContent
            bin={tooltip.target}
            summary={summaryByOrigin.get(pluralityOrigin(tooltip.target))}
          />
        </FloatingTooltip>
      )}
    </div>
  );
}

function PassTooltipContent({
  bin,
  summary,
}: {
  bin: Bin<PassedShot>;
  summary: OriginSummary | undefined;
}) {
  const origin = pluralityOrigin(bin);

  return (
    <>
      <div className="font-medium text-ink">{summary?.label ?? origin}</div>
      <p className="mt-0.5 max-w-52 text-[11px] leading-snug text-ink-muted">
        {PASS_ORIGIN_DESCRIPTIONS[origin]}
      </p>
      <dl className="mt-1.5 space-y-0.5 text-ink-secondary">
        <TooltipRow label="From this spot">
          {formatCount(bin.items.length)} passes
        </TooltipRow>
        {summary && summary.split.attempts > 0 && (
          <>
            <TooltipRow label="Region total">
              {formatCount(summary.split.attempts)} passes
            </TooltipRow>
            <TooltipRow label="Shots worth">
              {formatPointsPerShot(summary.split.pointsPerShot)}
            </TooltipRow>
          </>
        )}
      </dl>
    </>
  );
}

/** The origin most of a bin's passes belong to. */
function pluralityOrigin(bin: Bin<PassedShot>): PassOrigin {
  const counts = new Map<PassOrigin, number>();
  for (const entry of bin.items) {
    counts.set(entry.origin, (counts.get(entry.origin) ?? 0) + 1);
  }

  let best = bin.items[0].origin;
  let bestCount = 0;
  for (const [origin, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      best = origin;
    }
  }
  return best;
}
