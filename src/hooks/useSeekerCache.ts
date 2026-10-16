"use client";

import { keepPreviousData, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

/**
 * The job seeker's pages, read through the shared query cache.
 *
 * Same contract as `useSeekerApplications`: every seeker page fetched in a bare
 * useEffect, so Back, the side nav or re-opening a page re-requested it behind
 * a skeleton. Here a page revisited inside FRESH_MS shows at once with no
 * request; after it the cached data shows at once and refreshes behind it.
 * Lists keep the current rows on screen while the next page/filter loads.
 *
 * Every key starts with "seeker" so one sign-out/role switch can drop them all.
 */
export const SEEKER_FRESH_MS = 60_000;

export const seekerKeys = {
  all: ["seeker"] as const,
  profile: ["seeker", "profile"] as const,
  interviews: ["seeker", "interviews"] as const,
  interviewList: (query: string) => ["seeker", "interviews", "list", query] as const,
  interviewMonth: (query: string) => ["seeker", "interviews", "month", query] as const,
  offers: ["seeker", "offers"] as const,
  offerList: (query: string) => ["seeker", "offers", "list", query] as const,
  companies: (query: string) => ["seeker", "companies", query] as const,
  documents: ["seeker", "documents"] as const,
  settings: ["seeker", "settings"] as const,
  onboarding: ["seeker", "onboarding"] as const,
  personalDetailsOptions: ["seeker", "personal-details-options"] as const,
};

/** The nav badges and journey header counts (see useJobSeekerActionCounts). */
const ACTION_COUNTS_KEY = ["job-seeker", "action-counts"] as const;

export async function getSeekerJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json() as Promise<T>;
}

/** A single cached read (profile, settings, documents…). */
export function useSeekerResource<T>(
  key: readonly unknown[],
  url: string,
  options: { enabled?: boolean } = {},
) {
  return useQuery<T>({
    queryKey: key,
    queryFn: () => getSeekerJson<T>(url),
    enabled: options.enabled ?? true,
    staleTime: SEEKER_FRESH_MS,
    refetchOnMount: true,
  });
}

/** A paged/filtered list: the previous result stays on screen while the next loads. */
export function useSeekerList<T>(key: readonly unknown[], url: string, options: { enabled?: boolean } = {}) {
  return useQuery<T>({
    queryKey: key,
    queryFn: () => getSeekerJson<T>(url),
    enabled: options.enabled ?? true,
    staleTime: SEEKER_FRESH_MS,
    refetchOnMount: true,
    placeholderData: keepPreviousData,
  });
}

/** GET /api/job-seeker/profile; a 204 (no profile yet) is null. */
async function fetchSeekerProfile<T>(): Promise<T | null> {
  const res = await fetch("/api/job-seeker/profile", { cache: "no-store" });
  if (!res.ok) throw new Error(`/api/job-seeker/profile ${res.status}`);
  if (res.status === 204) return null;
  return res.json() as Promise<T>;
}

/** The profile document — one cache entry shared by Profile, CV, Skills, Preferences and Personal details. */
export function useSeekerProfileQuery<T>() {
  return useQuery<T | null>({
    queryKey: seekerKeys.profile,
    queryFn: () => fetchSeekerProfile<T>(),
    staleTime: SEEKER_FRESH_MS,
    refetchOnMount: true,
  });
}

/**
 * For forms that copy the profile into local state once: resolves from the
 * cache when it is fresh (every profile write below invalidates it), otherwise
 * fetches. Rejects like the old `fetch` + `res.ok` check did.
 */
// Untyped by default, like the `res.json()` it replaces in those forms.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function readSeekerProfile<T = any>(queryClient: QueryClient): Promise<T | null> {
  return queryClient.fetchQuery({
    queryKey: seekerKeys.profile,
    queryFn: () => fetchSeekerProfile<T>(),
    staleTime: SEEKER_FRESH_MS,
  });
}

/** After a profile PATCH: every page holding the profile refetches it. */
export function invalidateSeekerProfile(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: seekerKeys.profile });
}

/**
 * After a write: refetch the given seeker keys and the nav counts. Pass the
 * key prefix that the write changed (e.g. `seekerKeys.offers`).
 */
export function useRefreshSeeker() {
  const queryClient = useQueryClient();
  return useCallback(
    async (...keys: (readonly unknown[])[]) => {
      await Promise.all([
        ...keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
        queryClient.invalidateQueries({ queryKey: ACTION_COUNTS_KEY }),
      ]);
    },
    [queryClient],
  );
}
