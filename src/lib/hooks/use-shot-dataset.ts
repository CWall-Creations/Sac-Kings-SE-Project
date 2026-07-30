"use client";

import { useCallback, useEffect, useState } from "react";
import type { ShotDataset } from "@/lib/data/types";

/**
 * Load the dataset the ETL produced.
 *
 * Fetched as a static asset rather than embedded in the page: the rows compress
 * to ~450 KB, the browser caches them, and keeping them out of the bundle means
 * the shell renders while they arrive. The tradeoff is a real loading state and a
 * real failure mode, both handled here — a dashboard that assumes its data is
 * already present is a dashboard that shows a blank screen when it is not.
 */

const DATASET_URL = "/data/shots.json";

export type ShotDatasetState =
  | { status: "loading"; dataset: null; error: null }
  | { status: "ready"; dataset: ShotDataset; error: null }
  | { status: "error"; dataset: null; error: string };

export function useShotDataset(): ShotDatasetState & { retry: () => void } {
  const [state, setState] = useState<ShotDatasetState>({
    status: "loading",
    dataset: null,
    error: null,
  });
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setState({ status: "loading", dataset: null, error: null });
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    // Guards against a late response from a superseded request overwriting a
    // newer one, and against setting state after unmount.
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch(DATASET_URL, { signal: controller.signal });

        if (!response.ok) {
          throw new Error(
            `The dataset returned ${response.status}. It is generated at build ` +
              `time — if you are running locally, try \`npm run data\`.`,
          );
        }

        const dataset = (await response.json()) as ShotDataset;

        if (!Array.isArray(dataset?.shots) || dataset.shots.length === 0) {
          throw new Error("The dataset loaded but contained no shots.");
        }

        setState({ status: "ready", dataset, error: null });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          dataset: null,
          error:
            error instanceof Error
              ? error.message
              : "Could not load the shot dataset.",
        });
      }
    }

    void load();
    return () => controller.abort();
  }, [attempt]);

  return { ...state, retry };
}
