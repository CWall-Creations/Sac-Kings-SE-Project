"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Per-view error boundary.
 *
 * Scoped to one view rather than wrapping the whole page, so a bug in one chart's
 * aggregation cannot blank the dashboard: the other views and the filter bar keep
 * working while the broken panel explains itself. Class component because error
 * boundaries have no hook equivalent.
 */

interface Props {
  /** Named in the fallback so a reader knows which panel failed. */
  name: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ViewErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Nowhere to report to in a static build; the console is the honest option.
    console.error(`[${this.props.name}] render failed`, error, info);
  }

  render() {
    const { error } = this.state;

    if (error) {
      return (
        <section className="rounded-lg border border-hairline bg-surface p-5">
          <h2 className="text-sm font-semibold text-ink">
            {this.props.name} could not be displayed
          </h2>
          <p className="mt-1 text-xs text-ink-secondary">
            The rest of the dashboard is unaffected. Details are in the browser
            console.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="mt-3 rounded border border-hairline px-2.5 py-1 text-xs text-ink-secondary hover:border-axis focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-accent"
          >
            Try again
          </button>
        </section>
      );
    }

    return this.props.children;
  }
}
