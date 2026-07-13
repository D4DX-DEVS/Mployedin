"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const DEFAULT_PAGE_SIZE = 10;

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

  const [page, setPageRaw] = useState(() => Number(searchParams.get("page")) || 1);
  const [limit, setLimitRaw] = useState(() => Number(searchParams.get("limit")) || initialLimit);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const syncUrl = useCallback((nextPage: number, nextLimit: number) => {
    const params = new URLSearchParams(window.location.search);
    if (nextPage > 1) params.set("page", String(nextPage)); else params.delete("page");
    if (nextLimit !== DEFAULT_PAGE_SIZE) params.set("limit", String(nextLimit)); else params.delete("limit");
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [router]);

  const setPage = useCallback((p: number) => {
    const next = Math.max(1, p);
    setPageRaw(next);
    syncUrl(next, limit);
  }, [limit, syncUrl]);

  const setLimit = useCallback((newLimit: number) => {
    setLimitRaw(newLimit);
    setPageRaw(1); // reset to first page on limit change
    syncUrl(1, newLimit);
  }, [syncUrl]);

  const updateTotal = useCallback(
    (newTotal: number) => {
      setTotal(newTotal);
      setTotalPages(Math.max(1, Math.ceil(newTotal / limit)));
    },
    [limit],
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
