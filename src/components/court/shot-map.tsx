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
  type ShotHex,
  binShots,
  hexPath,
} from "@/lib/analytics/hexbin";
import type { ZoneProfile } from "@/lib/analytics/profiles";
import { COURT_ZONE_LABELS, type CourtZone } from "@/lib/analytics/zones";
import type { Shot } from "@/lib/data/types";
import { VIEW_BOX, isWithinView, toSvgX, toSvgY } from "@/lib/viz/court-projection";
import { colorForDifference } from "@/lib/viz/diverging";
import {
  formatCount,
  formatPointsPerShot,
  formatShootingPct,
  formatSigned,
} from "@/lib/viz/format";
import { CourtDiagram } from "./court-diagram";

/**
 * The shot map: where attempts come from, and what they are worth.
 *
 * Two encodings, chosen to keep the map honest at any filter depth:
 *
 *   - **Size = volume.** A count is a count; a bin holding four attempts draws
 *     small and claims nothing.
 *   - **Colour = the efficiency of the bin's zone**, not of the bin itself. This
 *     is the important one. Colouring each bin by its own make rate is the
 *     conventional approach and it is wrong here: filter to one player and one
 *     context and the median bin holds around ten attempts, so the map would be
 *     painting sampling noise in confident reds and blues. Zones stay large enough
 *     to estimate, so the reader gets hex granularity for *where* and trustworthy
 *     colour for *how good*.
 *
 * The accompanying table (`ZoneTable`) is not decoration either — it is the
 * WCAG-clean twin, so no value on this chart is reachable only by hovering or only
 * by distinguishing a colour.
 */

/** Bins below this are drawn but never labelled or coloured confidently. */
const MIN_ATTEMPTS_TO_DRAW = 1;

/**
 * Sizing headroom. The rim bin holds an order of magnitude more attempts than a
 * typical jump-shot bin, so the scale tops out at a high percentile instead of the
 * maximum — otherwise one bin at the basket flattens the entire perimeter to dots.
 */
const SIZE_PERCENTILE = 0.95;

interface ShotMapProps {
  shots: readonly Shot[];
  zones: readonly ZoneProfile[];
  /** What the colour is measured against, named for the legend. */
  referenceLabel: string;
}

export function ShotMap({ shots, zones, referenceLabel }: ShotMapProps) {
  const tooltip = useTooltipPointer<ShotHex>();

  const differenceByZone = useMemo(() => {
    const map = new Map<CourtZone, number>();
    for (const zone of zones) map.set(zone.zone, zone.pointsPerShotVsReference);
    return map;
  }, [zones]);

  const zoneByName = useMemo(() => {
    const map = new Map<CourtZone, ZoneProfile>();
    for (const zone of zones) map.set(zone.zone, zone);
    return map;
  }, [zones]);

  /**
   * Heaves and backcourt releases sit outside the drawn area. They stay in the
   * table's totals, so the count is surfaced rather than left as an unexplained
   * discrepancy between the two halves of the view.
   */
  const { hexes, offMapAttempts } = useMemo(() => {
    const onMap = shots.filter(isWithinView);
    return {
      hexes: binShots(onMap).filter(
        (hex) => hex.attempts >= MIN_ATTEMPTS_TO_DRAW,
      ),
      offMapAttempts: shots.length - onMap.length,
    };
  }, [shots]);

  const sizeScale = useMemo(() => {
    const counts = hexes.map((hex) => hex.attempts).sort((a, b) => a - b);
    const ceiling =
      counts.length > 0
        ? counts[Math.min(counts.length - 1, Math.floor(counts.length * SIZE_PERCENTILE))]
        : 1;

    return scaleSqrt()
      .domain([1, Math.max(2, ceiling)])
      .range([DEFAULT_HEX_RADIUS_FEET * 0.3, DEFAULT_HEX_RADIUS_FEET])
      .clamp(true);
  }, [hexes]);

  if (shots.length === 0) {
    return <EmptyCourt />;
  }

  return (
    <div className="relative">
      <svg
        viewBox={VIEW_BOX}
        className="w-full"
        role="img"
        aria-label={`Shot map of ${formatCount(shots.length)} attempts. Hex size shows volume; colour shows points per shot against ${referenceLabel}. The same values are in the table below.`}
      >
        <CourtDiagram />

        <g>
          {hexes.map((hex) => {
            const difference = differenceByZone.get(hex.zone) ?? 0;
            const radius = sizeScale(hex.attempts);

            return (
              <g
                key={`${hex.column},${hex.row}`}
                transform={`translate(${toSvgX(hex.y)} ${toSvgY(hex.x)})`}
              >
                <path
                  d={hexPath(radius)}
                  fill={colorForDifference(difference)}
                  stroke="var(--surface-1)"
                  strokeWidth={0.06}
                />
                {/* Full-size transparent hex so the hit target is bigger than
                    the mark, which can be only a few pixels across. */}
                <path
                  d={hexPath(DEFAULT_HEX_RADIUS_FEET)}
                  fill="transparent"
                  stroke="none"
                  onMouseEnter={(event) => tooltip.show(hex, event)}
                  onMouseMove={tooltip.move}
                  onMouseLeave={tooltip.hide}
                />
              </g>
            );
          })}
        </g>
      </svg>

      {offMapAttempts > 0 && (
        <p className="mt-2 text-[11px] text-ink-muted">
          {formatCount(offMapAttempts)} attempt
          {offMapAttempts === 1 ? "" : "s"} released beyond 40 ft are counted in
          the table but fall outside the drawn court.
        </p>
      )}

      {tooltip.target && (
        <FloatingTooltip pointer={tooltip.pointer}>
          <HexTooltipContent
            hex={tooltip.target}
            zone={zoneByName.get(tooltip.target.zone)}
          />
        </FloatingTooltip>
      )}
    </div>
  );
}

function HexTooltipContent({
  hex,
  zone,
}: {
  hex: ShotHex;
  zone: ZoneProfile | undefined;
}) {
  return (
    <>
      <div className="font-medium text-ink">{COURT_ZONE_LABELS[hex.zone]}</div>
      <dl className="mt-1 space-y-0.5 text-ink-secondary">
        <TooltipRow label="This spot">
          {formatCount(hex.attempts)} att · {hex.makes} made
        </TooltipRow>
        {zone && zone.split.attempts > 0 && (
          <>
            <TooltipRow label="Zone FG%">
              {formatShootingPct(zone.split.fieldGoalPct)}
            </TooltipRow>
            <TooltipRow label="Zone PPS">
              {formatPointsPerShot(zone.split.pointsPerShot)}
            </TooltipRow>
            <TooltipRow label="vs reference">
              {formatSigned(zone.pointsPerShotVsReference)}
            </TooltipRow>
          </>
        )}
      </dl>
    </>
  );
}

function EmptyCourt() {
  return (
    <div className="relative">
      <svg viewBox={VIEW_BOX} className="w-full opacity-40" aria-hidden="true">
        <CourtDiagram />
      </svg>
      <p className="absolute inset-0 flex items-center justify-center text-sm text-ink-secondary">
        No attempts match these filters.
      </p>
    </div>
  );
}
