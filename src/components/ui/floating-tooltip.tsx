"use client";

import { useCallback, useState } from "react";

/**
 * A pointer-following tooltip, shared by the charts.
 *
 * Extracted because the court map and the scatter both need one and the fiddly
 * parts — clamping to the viewport so it never opens off-screen, and staying
 * `pointer-events: none` so it cannot steal the hover that spawned it — are worth
 * getting right once.
 *
 * Tooltips here enhance and never gate: every value shown in one is also present
 * in the view's table twin, so nothing is reachable by hover alone.
 */

/** Distance from the pointer, in px. */
const OFFSET = 14;
/** Assumed tooltip footprint, used to keep it inside the viewport. */
const ESTIMATED_SIZE = { width: 220, height: 150 };

export interface TooltipPointer {
  x: number;
  y: number;
}

/**
 * Tracks pointer position for a tooltip. Returns handlers to spread onto the
 * hoverable marks, keyed by whatever identifies the hovered datum.
 */
export function useTooltipPointer<T>() {
  const [target, setTarget] = useState<T | null>(null);
  const [pointer, setPointer] = useState<TooltipPointer>({ x: 0, y: 0 });

  const show = useCallback(
    (datum: T, event: { clientX: number; clientY: number }) => {
      setTarget(datum);
      setPointer({ x: event.clientX, y: event.clientY });
    },
    [],
  );

  const move = useCallback((event: { clientX: number; clientY: number }) => {
    setPointer({ x: event.clientX, y: event.clientY });
  }, []);

  const hide = useCallback(() => setTarget(null), []);

  return { target, pointer, show, move, hide };
}

export function FloatingTooltip({
  pointer,
  children,
}: {
  pointer: TooltipPointer;
  children: React.ReactNode;
}) {
  // `window` is available because this only renders on hover, which cannot
  // happen during server rendering.
  const left = Math.min(
    pointer.x + OFFSET,
    window.innerWidth - ESTIMATED_SIZE.width,
  );
  const top = Math.min(
    Math.max(pointer.y - 12, 8),
    window.innerHeight - ESTIMATED_SIZE.height,
  );

  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-50 rounded-md border border-hairline bg-surface px-3 py-2 text-xs shadow-lg"
      style={{ left, top }}
    >
      {children}
    </div>
  );
}

/** A label/value row inside a tooltip. */
export function TooltipRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 whitespace-nowrap">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="tabular ml-auto text-ink">{children}</dd>
    </div>
  );
}
