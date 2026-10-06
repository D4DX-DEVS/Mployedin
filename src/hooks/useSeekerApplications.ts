"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

/**
 * The seeker's applications, list and detail, through the query cache.
 *
 * Both pages fetched in a bare useEffect, so opening an application and
 * pressing Back re-requested the list and showed its skeleton again, and
 * re-opening the same application did the same (client report 2026-10-06).
 * Cached for FRESH_MS: Back inside that window is instant with no request;
 * after it the cached rows show at once and refresh behind them.
 */
const FRESH_MS = 60_000;

export const seekerApplicationKeys = {
  all: ["seeker-applications"] as const,
  list: (query: string) => ["seeker-applications", "list", query] as const,
  detail: (id: string) => ["seeker-applications", "detail", id] as const,
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json() as Promise<T>;
}

/** One page of the Applications list; `query` is the request's query string. */
export function useSeekerApplicationList<T>(query: string) {
  return useQuery<T>({
    queryKey: seekerApplicationKeys.list(query),
    queryFn: () => getJson<T>(`/api/applications?${query}`),
    staleTime: FRESH_MS,
    refetchOnMount: true,
    // Switching tab or page keeps the current rows on screen until the next
    // page arrives, instead of flashing the skeleton.
    placeholderData: keepPreviousData,
  });
}

export const APPLICATION_DETAIL_INCLUDE = "interviews,offers,documents";

/** One application with its interviews, offers and documents. */
export function useSeekerApplication<T>(id: string | undefined) {
  return useQuery<T>({
    queryKey: seekerApplicationKeys.detail(id ?? ""),
    queryFn: async () => {
      const data = await getJson<{ application?: T } & T>(
        `/api/applications/${id}?include=${APPLICATION_DETAIL_INCLUDE}`,
      );
      return (data.application ?? data) as T;
    },
    enabled: !!id,
    staleTime: FRESH_MS,
    refetchOnMount: true,
  });
}

/**
 * After anything that changes an application (withdraw, interview reply,
 * offer reply, documents): refetch the list, every detail and the nav counts.
 */
export function useRefreshSeekerApplications() {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: seekerApplicationKeys.all }),
      queryClient.invalidateQueries({ queryKey: ["job-seeker", "action-counts"] }),
    ]);
  }, [queryClient]);
}
