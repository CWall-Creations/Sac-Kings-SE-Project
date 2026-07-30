import type { ReactNode } from "react";

/**
 * A titled panel. Deliberately minimal — one place that owns the surface, the
 * hairline, and the header spacing, so every view is framed identically without a
 * component library.
 */

interface CardProps {
  title: string;
  /** One line explaining what the reader is looking at. */
  description?: ReactNode;
  /** Controls placed at the top right, e.g. a view toggle. */
  actions?: ReactNode;
  children: ReactNode;
}

export function Card({ title, description, actions, children }: CardProps) {
  return (
    <section className="rounded-lg border border-hairline bg-surface p-5">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-ink">
            {title}
          </h2>
          {description && (
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-secondary">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

/**
 * A single headline number. Used where the story is one value and a chart would
 * be a one-bar bar chart.
 */
export function StatTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-hairline bg-surface px-4 py-3">
      <p className="text-xs text-ink-muted">{label}</p>
      {/* Proportional figures, not tabular: this number stands alone. */}
      <p className="mt-1 text-2xl font-semibold tracking-tight text-ink">
        {value}
      </p>
      {detail && <p className="mt-0.5 text-xs text-ink-secondary">{detail}</p>}
    </div>
  );
}
