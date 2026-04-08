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
  };
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
