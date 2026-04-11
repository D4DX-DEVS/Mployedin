import { useQuery } from "@tanstack/react-query";

// ── Types ──────────────────────────────────────────────────────────
export interface Scorecard {
  _id: string;
  interviewId: {
    _id: string;
    scheduledAt: string;
  };
  applicationId: {
    _id: string;
    status: string;
  } | string;
  jobSeekerId: {
    userId: string;
  };
  overallScore: number;
  recommendation: string;
  createdAt: string;
}

interface ScorecardsResponse {
  scorecards: Scorecard[];
  pagination?: { total: number; page: number; limit: number; totalPages: number };
}

export interface ScorecardsFilters {
  page: number;
  limit: number;
}

// ── Query Keys ─────────────────────────────────────────────────────
export const scorecardKeys = {
  all: ["scorecards"] as const,
  lists: () => [...scorecardKeys.all, "list"] as const,
  list: (filters: ScorecardsFilters) => [...scorecardKeys.lists(), filters] as const,
  byApplicationIds: (ids: string[]) => [...scorecardKeys.all, "byAppIds", ids] as const,
};

// ── Fetcher ────────────────────────────────────────────────────────
async function fetchScorecards(filters: ScorecardsFilters): Promise<{ scorecards: Scorecard[]; total: number }> {
  const params = new URLSearchParams();
  params.set("page", String(filters.page));
  params.set("limit", String(filters.limit));

  const res = await fetch(`/api/scorecards?${params}`);
  if (!res.ok) throw new Error("Failed to fetch scorecards");
  const data: ScorecardsResponse = await res.json();
  return {
    scorecards: data.scorecards,
    total: data.pagination?.total ?? data.scorecards?.length ?? 0,
  };
}

// ── Hooks ──────────────────────────────────────────────────────────

/** Fetch paginated scorecards list */
export function useScorecards(filters: ScorecardsFilters) {
  return useQuery({
    queryKey: scorecardKeys.list(filters),
    queryFn: () => fetchScorecards(filters),
    staleTime: 60 * 1000,
    placeholderData: (prev) => prev,
  });
}

/**
 * Fetch scorecards for a specific set of application IDs and return a map
 * from applicationId string → Scorecard for O(1) lookup in the table.
 */
export function useScorecardsByApplicationIds(applicationIds: string[]) {
  return useQuery({
    queryKey: scorecardKeys.byApplicationIds(applicationIds),
    queryFn: async (): Promise<Record<string, Scorecard>> => {
      if (!applicationIds.length) return {};
      const params = new URLSearchParams();
      params.set("applicationIds", applicationIds.join(","));
      params.set("limit", "100");
      const res = await fetch(`/api/scorecards?${params}`);
      if (!res.ok) throw new Error("Failed to fetch scorecards");
      const data: ScorecardsResponse = await res.json();
      const map: Record<string, Scorecard> = {};
      for (const sc of data.scorecards) {
        const appId = typeof sc.applicationId === "string" ? sc.applicationId : sc.applicationId._id;
        map[appId] = sc;
      }
      return map;
    },
    enabled: applicationIds.length > 0,
    staleTime: 30 * 1000,
  });
}
