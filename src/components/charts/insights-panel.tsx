import type { Insight, InsightKind } from "@/lib/analytics/insights";
import type { RoleInference } from "@/lib/analytics/roles";
import { ROLE_DESCRIPTIONS } from "@/lib/analytics/roles";
import { formatSignedPoints } from "@/lib/viz/format";

/**
 * The synthesis: what to do about everything above.
 *
 * Placed last on purpose — the three views are the evidence, and this reads as a
 * conclusion drawn from them rather than an assertion made ahead of them.
 *
 * Each bullet carries the arithmetic that produced it and, where it projects a
 * gain, the assumption that projection rests on. Nothing here is prose written
 * once and left to rot: every line is computed from the current slice, so
 * filtering the dashboard re-derives the conclusions along with the charts.
 */

const KIND_LABELS: Record<InsightKind, string> = {
  strength: "Working",
  concern: "Costing points",
  opportunity: "Opportunity",
  assignment: "Usage decision",
  limitation: "Can't be answered",
};

/**
 * Category colour. Opportunity and concern borrow the diverging scale's poles so
 * that "above" and "below" mean the same thing here as on the court map; the rest
 * stay in ink so a category chip never impersonates a data value.
 */
const KIND_STYLES: Record<InsightKind, { dot: string; text: string }> = {
  concern: { dot: "var(--diverge-below)", text: "text-ink-secondary" },
  opportunity: { dot: "var(--diverge-above)", text: "text-ink-secondary" },
  assignment: { dot: "var(--text-muted)", text: "text-ink-secondary" },
  strength: { dot: "var(--diverge-above-1)", text: "text-ink-secondary" },
  limitation: { dot: "transparent", text: "text-ink-muted" },
};

export function InsightList({ insights }: { insights: readonly Insight[] }) {
  if (insights.length === 0) {
    return (
      <p className="py-6 text-sm text-ink-secondary">
        Not enough attempts in this slice to draw conclusions from.
      </p>
    );
  }

  return (
    <ul className="space-y-4">
      {insights.map((insight) => {
        const style = KIND_STYLES[insight.kind];

        return (
          <li key={insight.id} className="flex gap-3">
            <span
              aria-hidden="true"
              className="mt-1.5 h-2 w-2 shrink-0 rounded-full ring-1 ring-hairline"
              style={{ background: style.dot }}
            />
            <div className="min-w-0">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                  {KIND_LABELS[insight.kind]}
                </span>
                {insight.points !== null && Math.abs(insight.points) >= 1 && (
                  <span className="tabular text-[11px] font-medium text-ink-secondary">
                    {formatSignedPoints(insight.points)} pts
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-sm leading-relaxed text-ink">
                {insight.headline}
              </p>
              {insight.detail && (
                <p className={`mt-1 text-xs leading-relaxed ${style.text}`}>
                  {insight.detail}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The inferred role, shown with the shares that produced it.
 *
 * The evidence is not decoration. The dataset has no position column, so this is
 * a claim derived from the shot profile — and a derived claim should travel with
 * the numbers behind it so a reader can disagree with the reasoning rather than
 * simply distrust the label.
 */
export function RoleBadge({ role }: { role: RoleInference }) {
  return (
    <div className="rounded-lg border border-hairline bg-page px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-sm font-semibold text-ink">{role.label}</span>
        <span className="text-[11px] text-ink-muted">
          inferred from shot profile · {role.confidence} confidence
        </span>
      </div>

      <p className="mt-1 text-xs leading-relaxed text-ink-secondary">
        {role.secondary
          ? `Sits between two roles — the profile supports both, so neither is asserted alone.`
          : ROLE_DESCRIPTIONS[role.archetype]}
      </p>

      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {role.evidence.map((line) => (
          <li key={line} className="text-[11px] text-ink-muted">
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}
