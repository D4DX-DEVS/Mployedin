"use client";

import { useRef, useState } from "react";

/**
 * How an Ask AI run ended, which decides what the line under the search box
 * says. Anything but "applied" leaves the sentence as a plain keyword search.
 */
export type AiSearchOutcome = "applied" | "no_filters" | "unavailable" | "limit";

export interface AiSearchResult {
  /** The sentence that was asked. */
  query: string;
  outcome: AiSearchOutcome;
  /** One label per filter the page really set, in display order. */
  applied: string[];
}

/** What /api/ai/application-search-filters hands back under `filters`. */
export interface AiApplicationFilters {
  search?: string;
  status?: string;
  source?: string;
  scoreBand?: string;
  dateFrom?: string;
  dateTo?: string;
  skills?: string[];
  employer?: string;
}

/** AI score bands, as the parser names them, and the range each one means. */
export const AI_SCORE_BANDS: Readonly<Record<string, readonly [number, number]>> = {
  excellent: [80, 100],
  good: [60, 79],
  average: [40, 59],
  low: [0, 39],
};

interface UseAiFilterSearchOptions<TFilters, TSnapshot> {
  endpoint: string;
  /** The page's filters as they are now, kept for Undo. */
  snapshot: () => TSnapshot;
  restore: (snapshot: TSnapshot) => void;
  /**
   * Writes the parsed filters onto the page and returns a label for each one
   * it could actually use. A filter the page has no control for is skipped,
   * not claimed.
   */
  apply: (filters: TFilters) => string[];
  /** Runs the sentence as a plain keyword search. */
  searchAsKeyword: (query: string) => void;
}

export interface UseAiFilterSearch {
  askAi: (query: string) => Promise<void>;
  pending: boolean;
  result: AiSearchResult | null;
  /** Puts back the filters from just before the last Ask AI. */
  undo: () => void;
  /** Hides the result line and keeps the filters. */
  dismiss: () => void;
}

/**
 * Ask AI for a list page's search box. The AI never searches on its own: it
 * reads the sentence into the page's existing filters, so the keyword box, the
 * dropdowns and the URL keep showing one truth. Runs only when asked — every
 * call is a paid model request.
 */
export function useAiFilterSearch<TFilters, TSnapshot>(
  options: UseAiFilterSearchOptions<TFilters, TSnapshot>,
): UseAiFilterSearch {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<AiSearchResult | null>(null);
  const undoRef = useRef<{ snapshot: TSnapshot } | null>(null);

  async function askAi(raw: string): Promise<void> {
    const query = raw.trim();
    if (!query || pending) return;
    const before = options.snapshot();
    setPending(true);

    let outcome: AiSearchOutcome = "unavailable";
    let applied: string[] = [];
    try {
      const res = await fetch(options.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (res.ok) {
        const data = (await res.json()) as { filters?: TFilters; degraded?: boolean };
        if (!data.degraded) {
          applied = options.apply(data.filters ?? ({} as TFilters));
          outcome = applied.length > 0 ? "applied" : "no_filters";
        }
      } else if (res.status === 429) {
        // Both the per-minute rate limit and the daily AI quota answer 429.
        outcome = "limit";
      }
    } catch {
      // Network failure: the outcome stays "unavailable".
    }

    if (outcome !== "applied") options.searchAsKeyword(query);
    undoRef.current = { snapshot: before };
    setResult({ query, outcome, applied });
    setPending(false);
  }

  function undo(): void {
    if (undoRef.current) options.restore(undoRef.current.snapshot);
    undoRef.current = null;
    setResult(null);
  }

  function dismiss(): void {
    undoRef.current = null;
    setResult(null);
  }

  return { askAi, pending, result, undo, dismiss };
}
