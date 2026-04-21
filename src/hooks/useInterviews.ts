import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ── Types ──────────────────────────────────────────────────────────
export interface Interview {
  _id: string;
  applicationId?: string;
  jobSeekerId?: {
    fullName?: string;
    email?: string;
    skills?: string[];
    experience?: { jobTitle: string; company: string; isCurrent: boolean; startDate?: string }[];
  };
  jobId?: { _id?: string; title?: string; requirements?: { skills?: string[]; experienceMin?: number } };
  scheduledAt: string;
  type?: string;
  status: string;
  outcome?: "passed" | "failed" | "hold" | "no_show";
  interviewRound?: number;
  feedback?: string;
  notes?: string;
}

interface InterviewsResponse {
  items?: Interview[];
  interviews?: Interview[];
  total?: number;
}

export interface InterviewsFilters {
  page: number;
  limit: number;
  status?: string;
}

// ── Query Keys ─────────────────────────────────────────────────────
export const interviewKeys = {
  all: ["interviews"] as const,
  lists: () => [...interviewKeys.all, "list"] as const,
  list: (filters: InterviewsFilters) => [...interviewKeys.lists(), filters] as const,
  shortlisted: (jobId: string) => [...interviewKeys.all, "shortlisted", jobId] as const,
};

// ── Fetcher ────────────────────────────────────────────────────────
async function fetchInterviews(filters: InterviewsFilters): Promise<{ interviews: Interview[]; total: number }> {
  const params = new URLSearchParams();
  params.set("page", String(filters.page));
  params.set("limit", String(filters.limit));
  if (filters.status) params.set("status", filters.status);

  const res = await fetch(`/api/interviews?${params}`);
  if (!res.ok) throw new Error("Failed to fetch interviews");
  const data: InterviewsResponse = await res.json();
  const items = data.items ?? data.interviews ?? [];
  return { interviews: items, total: data.total ?? items.length };
}

// ── Hooks ──────────────────────────────────────────────────────────

/** Fetch paginated, filtered interviews list */
export function useInterviews(filters: InterviewsFilters) {
  return useQuery({
    queryKey: interviewKeys.list(filters),
    queryFn: () => fetchInterviews(filters),
    staleTime: 60 * 1000,
    placeholderData: (prev) => prev,
  });
}

/** Update interview (status, outcome, reschedule fields) */
export function useUpdateInterview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id: string;
      status?: string;
      outcome?: string;
      feedback?: string;
      scheduledAt?: string;
      duration?: number;
      type?: string;
      location?: string;
      meetLink?: string;
    }) => {
      const { id, ...body } = payload;
      const res = await fetch(`/api/interviews/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to update interview");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: interviewKeys.lists() });
    },
  });
}

/** Schedule the next interview round */
export function useScheduleNextRound() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      interviewId: string;
      scheduledAt: string;
      duration?: number;
      type?: string;
      location?: string;
      meetLink?: string;
      instructions?: string;
    }) => {
      const { interviewId, ...body } = payload;
      const res = await fetch(`/api/interviews/${interviewId}/next-round`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to schedule next round");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: interviewKeys.lists() });
    },
  });
}

/** Fetch shortlisted candidates for bulk scheduling */
export function useShortlistedCandidates(jobId: string) {
  return useQuery({
    queryKey: interviewKeys.shortlisted(jobId),
    queryFn: async () => {
      const params = new URLSearchParams({ status: "shortlisted", limit: "100" });
      if (jobId) params.set("jobId", jobId);
      const res = await fetch(`/api/applications?${params}`);
      if (!res.ok) throw new Error("Failed to fetch shortlisted candidates");
      const data = await res.json();
      return data.applications ?? [];
    },
    staleTime: 30 * 1000,
  });
}

/** Bulk schedule interviews */
export function useBulkScheduleInterviews() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      candidates: { jobSeekerId: string; applicationId: string }[];
      scheduledAt: string;
      duration: number;
      type: string;
      location?: string;
      meetLink?: string;
    }) => {
      const res = await fetch("/api/interviews/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to schedule interviews");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: interviewKeys.lists() });
    },
  });
}
