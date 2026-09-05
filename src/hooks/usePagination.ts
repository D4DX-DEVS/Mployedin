"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { readQuery, writeQuery } from "@/lib/ui/urlQuery";

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

function readPositiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readPageSize(value: string | null, fallback: number) {
  const parsed = readPositiveInteger(value, fallback);
  return PAGE_SIZE_OPTIONS.includes(parsed as (typeof PAGE_SIZE_OPTIONS)[number])
    ? parsed
    : fallback;
}

export interface PaginationState {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface UsePaginationReturn extends PaginationState {
  setPage: (page: number) => void;
  setLimit: (limit: number) => void;
  setTotal: (total: number) => void;
  setTotalPages: (pages: number) => void;
  /** Update total and compute totalPages automatically */
  updateTotal: (total: number) => void;
  /** Reset page to 1 (useful when filters change) */
  resetPage: () => void;
  /** Build URLSearchParams with page & limit */
  paginationParams: () => URLSearchParams;
}

// Keeps page/limit mirrored into the URL (?page=&limit=) so browser back/forward
// after visiting a detail page restores the list to the page the user was on,
// instead of always reopening at page 1.
export function usePagination(initialLimit: number = DEFAULT_PAGE_SIZE): UsePaginationReturn {
  const router = useRouter();
  const searchParams = useSearchParams();

  const safeInitialLimit = readPageSize(String(initialLimit), DEFAULT_PAGE_SIZE);
  const [page, setPageRaw] = useState(() => readPositiveInteger(searchParams.get("page"), 1));
  const [limit, setLimitRaw] = useState(() => readPageSize(searchParams.get("limit"), safeInitialLimit));
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Reads through `readQuery` rather than `window.location.search` so a filter
  // write from useUrlFilter in the same tick is not overwritten — the browser
  // has not necessarily applied it yet when this runs.
  const syncUrl = useCallback((nextPage: number, nextLimit: number) => {
    const params = readQuery();
    if (nextPage > 1) params.set("page", String(nextPage)); else params.delete("page");
    if (nextLimit !== DEFAULT_PAGE_SIZE) params.set("limit", String(nextLimit)); else params.delete("limit");
    writeQuery(params, (href) => router.replace(href, { scroll: false }));
  }, [router]);

  const setPage = useCallback((p: number) => {
    const next = Math.max(1, p);
    setPageRaw(next);
    syncUrl(next, limit);
  }, [limit, syncUrl]);

  const setLimit = useCallback((newLimit: number) => {
    const safeLimit = readPageSize(String(newLimit), DEFAULT_PAGE_SIZE);
    setLimitRaw(safeLimit);
    setPageRaw(1); // reset to first page on limit change
    syncUrl(1, safeLimit);
  }, [syncUrl]);

  const updateTotal = useCallback(
    (newTotal: number) => {
      const safeTotal = Math.max(0, newTotal);
      const nextTotalPages = Math.max(1, Math.ceil(safeTotal / limit));
      setTotal(safeTotal);
      setTotalPages(nextTotalPages);

      // A deletion or tighter filter can make the current page disappear.
      // Move back to the last real server page instead of showing an empty list.
      if (page > nextTotalPages) {
        setPageRaw(nextTotalPages);
        syncUrl(nextTotalPages, limit);
      }
    },
    [limit, page, syncUrl],
  );

  const resetPage = useCallback(() => {
    setPageRaw(1);
    syncUrl(1, limit);
  }, [limit, syncUrl]);

  const paginationParams = useCallback(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(limit));
    return params;
  }, [page, limit]);

  return {
    page,
    limit,
    total,
    totalPages,
    setPage,
    setLimit,
    setTotal,
    setTotalPages,
    updateTotal,
    resetPage,
    paginationParams,
  };
}
