import { DEFAULT_HEX_RADIUS_FEET, hexPath } from "@/lib/analytics/hexbin";
import { DIVERGING_LEGEND, divergingColor } from "@/lib/viz/diverging";
import { formatSigned } from "@/lib/viz/format";

/**
 * Legend for the shot map's two encodings.
 *
 * Present unconditionally. Colour is the only channel carrying efficiency, so
 * without a legend the map is unreadable rather than merely harder to read.
 */

/** Outermost class boundaries, for the legend's end anchors. */
const WORST_BREAK = DIVERGING_LEGEND[0].to ?? 0;
const BEST_BREAK = DIVERGING_LEGEND[DIVERGING_LEGEND.length - 1].from ?? 0;

interface CourtLegendProps {
  /** What the colour is measured against, e.g. "team average". */
  referenceLabel: string;
}

export function CourtLegend({ referenceLabel }: CourtLegendProps) {
  return (
    <div className="flex flex-wrap items-start gap-x-8 gap-y-4 text-xs">
      <div>
        <p className="mb-1.5 font-medium text-ink-secondary">
          Points per shot vs {referenceLabel}
        </p>
        {/* Swatches, then three anchors underneath. Labelling all seven
            boundaries repeats the shared edges and reads as noise. */}
        <div className="flex w-56 items-end gap-0.5">
          {DIVERGING_LEGEND.map((step) => (
            <span
              key={step.className}
              className="block h-3.5 flex-1 first:rounded-l last:rounded-r"
              style={{ background: divergingColor(step.className) }}
            />
          ))}
        </div>
        <div className="tabular mt-1 flex w-56 justify-between text-[10px] text-ink-muted">
          <span>{formatSigned(WORST_BREAK)} or less</span>
          <span>even</span>
          <span>{formatSigned(BEST_BREAK)} or more</span>
        </div>
        <p className="mt-1.5 max-w-56 text-[11px] leading-snug text-ink-muted">
          Colour comes from the hex&apos;s zone, not the hex itself.
        </p>
      </div>

      <div>
        <p className="mb-1.5 font-medium text-ink-secondary">Attempts</p>
        <div className="flex items-end gap-3">
          {[
            { label: "few", scale: 0.3 },
            { label: "some", scale: 0.62 },
            { label: "many", scale: 1 },
          ].map((size) => (
            <div key={size.label} className="flex flex-col items-center gap-1">
              <svg
                viewBox="-2 -2 4 4"
                className="h-6 w-6"
                aria-hidden="true"
              >
                <path
                  d={hexPath(DEFAULT_HEX_RADIUS_FEET * size.scale)}
                  fill="var(--axis)"
                />
              </svg>
              <span className="text-[10px] text-ink-muted">{size.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
