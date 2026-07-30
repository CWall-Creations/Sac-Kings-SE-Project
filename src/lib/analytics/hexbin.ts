import type { Shot } from "@/lib/data/types";
import type { CourtPoint } from "./court";
import type { CourtZone } from "./zones";

/**
 * Hexagonal binning of shot locations.
 *
 * Hand-rolled rather than pulled from `d3-hexbin`, which is a small amount of
 * geometry and one fewer dependency to justify.
 *
 * The bins carry *volume only*. Colour on the court map comes from the zone a
 * bin sits in, not from the bin's own make rate, and that split is the whole
 * point: a count is honest at any sample size, while a percentage from the nine
 * attempts in a typical filtered bin is not. Sizing by volume and colouring by
 * zone gives the granularity of a hex map without inviting anyone to read noise.
 */

/** Bin radius in feet. Small, because size is safe to encode at any n. */
export const DEFAULT_HEX_RADIUS_FEET = 1.5;

export interface ShotHex {
  /** Integer bin coordinates, unique per bin. */
  column: number;
  row: number;
  /** Bin centre, in court feet. */
  x: number;
  y: number;
  attempts: number;
  makes: number;
  /** The zone this bin's centre falls in; drives its colour. */
  zone: CourtZone;
}

/**
 * Horizontal and vertical spacing of a hex grid with the given radius, for
 * flat-topped rows offset every other row.
 */
function hexSpacing(radius: number) {
  return {
    dx: radius * Math.sqrt(3),
    dy: radius * 1.5,
  };
}

/**
 * Find the bin centre nearest a point.
 *
 * Rounding `y/dy` alone picks the right row but can land on the wrong column
 * near a bin boundary, because adjacent rows are offset by half a column. The
 * three candidate rows are tested and the closest centre wins, which makes the
 * assignment exact rather than approximate.
 */
export function nearestHexCenter(
  point: CourtPoint,
  radius: number = DEFAULT_HEX_RADIUS_FEET,
): { column: number; row: number; x: number; y: number } {
  const { dx, dy } = hexSpacing(radius);
  const approximateRow = Math.round(point.y / dy);

  let best: { column: number; row: number; x: number; y: number } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const row of [approximateRow - 1, approximateRow, approximateRow + 1]) {
    // Odd rows are offset half a column, which is what makes the grid hexagonal.
    const offset = (((row % 2) + 2) % 2) * 0.5;
    const column = Math.round(point.x / dx - offset);
    const x = (column + offset) * dx;
    const y = row * dy;
    const distance = (point.x - x) ** 2 + (point.y - y) ** 2;

    if (distance < bestDistance) {
      bestDistance = distance;
      best = { column, row, x, y };
    }
  }

  return best!;
}

/**
 * Bin shots into hexes, dropping empty cells.
 *
 * Each bin's zone is taken from the zone of the shots in it (by plurality) so a
 * bin straddling the three-point line is coloured by where its shots actually
 * came from rather than by its geometric centre.
 */
export function binShots(
  shots: readonly Shot[],
  radius: number = DEFAULT_HEX_RADIUS_FEET,
): ShotHex[] {
  const bins = new Map<string, ShotHex & { zoneCounts: Map<CourtZone, number> }>();

  for (const shot of shots) {
    const centre = nearestHexCenter(shot, radius);
    const key = `${centre.column},${centre.row}`;
    let bin = bins.get(key);

    if (!bin) {
      bin = {
        ...centre,
        attempts: 0,
        makes: 0,
        zone: shot.zone,
        zoneCounts: new Map(),
      };
      bins.set(key, bin);
    }

    bin.attempts += 1;
    if (shot.made) bin.makes += 1;
    bin.zoneCounts.set(shot.zone, (bin.zoneCounts.get(shot.zone) ?? 0) + 1);
  }

  return [...bins.values()].map(({ zoneCounts, ...bin }) => ({
    ...bin,
    zone: pluralityZone(zoneCounts, bin.zone),
  }));
}

function pluralityZone(
  counts: Map<CourtZone, number>,
  fallback: CourtZone,
): CourtZone {
  let bestZone = fallback;
  let bestCount = 0;

  for (const [zone, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      bestZone = zone;
    }
  }

  return bestZone;
}

/**
 * SVG path for a pointy-topped hexagon of the given radius, centred on the
 * origin. Rendered via `transform` on each bin so the path string is built once.
 */
export function hexPath(radius: number): string {
  const points: string[] = [];

  for (let corner = 0; corner < 6; corner += 1) {
    const angle = (Math.PI / 3) * corner + Math.PI / 6;
    points.push(
      `${(radius * Math.cos(angle)).toFixed(4)},${(radius * Math.sin(angle)).toFixed(4)}`,
    );
  }

  return `M${points.join("L")}Z`;
}
