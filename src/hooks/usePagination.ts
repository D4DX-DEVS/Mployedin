"use client";

import { useState, useCallback } from "react";

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

export function usePagination(initialLimit: number = DEFAULT_PAGE_SIZE): UsePaginationReturn {
  const [page, setPageRaw] = useState(1);
  const [limit, setLimitRaw] = useState(initialLimit);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const setPage = useCallback((p: number) => {
    setPageRaw(Math.max(1, p));
  }, []);

  const setLimit = useCallback((newLimit: number) => {
    setLimitRaw(newLimit);
    setPageRaw(1); // reset to first page on limit change
  }, []);

  const updateTotal = useCallback(
    (newTotal: number) => {
      setTotal(newTotal);
      setTotalPages(Math.max(1, Math.ceil(newTotal / limit)));
    },
    [limit],
  );

  const resetPage = useCallback(() => setPageRaw(1), []);

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
