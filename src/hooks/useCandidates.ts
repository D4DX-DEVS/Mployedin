import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ── Types ──────────────────────────────────────────────────────────
export interface Candidate {
  _id: string;
  userId?: { _id: string; name: string; email: string };
  currentLocation?: string;
  experience?: { jobTitle: string; company: string; isCurrent: boolean }[];
  skills?: string[];
  availabilityStatus?: string;
  profileCompleteness?: number;
  matchScore?: number;
  matchBreakdown?: {
    skills: number;
    experience: number;
    location: number;
    language: number;
  };
  matchSummary?: string;
  strengths?: string[];
  gaps?: string[];
  cv?: { originalUrl?: string };
}

export interface CandidateJob {
  _id: string;
  title: string;
}

interface CandidatesResponse {
  items?: Candidate[];
  total?: number;
}

interface PublishedJobsResponse {
  jobs?: CandidateJob[];
}

export interface CandidatesFilters {
  page: number;
  limit: number;
  search?: string;
}

// ── Query Keys ─────────────────────────────────────────────────────
export const candidateKeys = {
  all: ["candidates"] as const,
  lists: () => [...candidateKeys.all, "list"] as const,
  list: (filters: CandidatesFilters) => [...candidateKeys.lists(), filters] as const,
  details: () => [...candidateKeys.all, "detail"] as const,
  detail: (id: string) => [...candidateKeys.details(), id] as const,
  publishedJobs: () => [...candidateKeys.all, "published-jobs"] as const,
};

// ── Fetchers ───────────────────────────────────────────────────────
async function fetchCandidates(filters: CandidatesFilters): Promise<{ candidates: Candidate[]; total: number }> {
  const params = new URLSearchParams();
  params.set("page", String(filters.page));
  params.set("limit", String(filters.limit));
  if (filters.search) params.set("search", filters.search);

  const res = await fetch(`/api/job-seekers?${params}`);
  if (!res.ok) throw new Error("Failed to fetch candidates");
  const data: CandidatesResponse = await res.json();
  const items = data.items ?? [];
  return { candidates: items, total: data.total ?? items.length };
}

async function fetchPublishedJobs(): Promise<CandidateJob[]> {
  const res = await fetch("/api/jobs?limit=50&status=published");
  if (!res.ok) throw new Error("Failed to fetch published jobs");
  const data: PublishedJobsResponse = await res.json();
  return data.jobs ?? [];
}

// ── Hooks ──────────────────────────────────────────────────────────

/** Fetch paginated, filtered candidates list */
export function useCandidates(filters: CandidatesFilters) {
  return useQuery({
    queryKey: candidateKeys.list(filters),
    queryFn: () => fetchCandidates(filters),
    staleTime: 30 * 1000,
    placeholderData: (prev) => prev,
  });
}

/** Fetch published jobs for the dropdown */
export function usePublishedJobs() {
  return useQuery({
    queryKey: candidateKeys.publishedJobs(),
    queryFn: fetchPublishedJobs,
    staleTime: 60 * 1000,
  });
}

/** Start a direct-message conversation with a candidate */
export function useStartConversation() {
  return useMutation({
    mutationFn: async (recipientId: string) => {
      const res = await fetch("/api/dm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId }),
      });
      if (!res.ok) throw new Error("Failed to start conversation");
      return res.json();
    },
  });
}

/** Run AI matching for a job against candidates */
export function useAiMatch() {
  return useMutation({
    mutationFn: async ({ jobId, jobSeekerId }: { jobId: string; jobSeekerId: string }) => {
      const res = await fetch("/api/ai/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, jobSeekerId }),
      });
      if (!res.ok) throw new Error("Failed to run AI match");
      return res.json();
    },
  });
}

/** Fetch a single candidate's unified profile */
export function useCandidateDetail(id: string) {
  return useQuery({
    queryKey: candidateKeys.detail(id),
    queryFn: async () => {
      const res = await fetch(`/api/employers/candidates/${id}`);
      if (!res.ok) throw new Error("Failed to fetch candidate detail");
      return res.json();
    },
    staleTime: 30 * 1000,
    enabled: !!id,
  });
}
