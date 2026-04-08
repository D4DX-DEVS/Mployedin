import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ── Types ──────────────────────────────────────────────────────────
export interface ApplicationsFilters {
  page: number;
  limit: number;
  status?: string;
  jobId?: string;
}

// ── Query Keys ─────────────────────────────────────────────────────
export const applicationKeys = {
  all: ["applications"] as const,
  lists: () => [...applicationKeys.all, "list"] as const,
  list: (filters: ApplicationsFilters) => [...applicationKeys.lists(), filters] as const,
  timeline: (id: string) => [...applicationKeys.all, "timeline", id] as const,
  compare: (ids: string[]) => [...applicationKeys.all, "compare", ids] as const,
};

// ── Hooks ──────────────────────────────────────────────────────────

/** Fetch paginated, filtered applications list */
export function useApplications(filters: ApplicationsFilters) {
  return useQuery({
    queryKey: applicationKeys.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", String(filters.page));
      params.set("limit", String(filters.limit));
      if (filters.status && filters.status !== "all") params.set("status", filters.status);
      if (filters.jobId) params.set("jobId", filters.jobId);
      const res = await fetch(`/api/applications?${params}`);
      if (!res.ok) throw new Error("Failed to fetch applications");
      return res.json();
    },
    staleTime: 10 * 1000,
    placeholderData: (prev: unknown) => prev,
  });
}

/** Update a single application's status */
export function useUpdateApplicationStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
      rejectionReason,
    }: {
      id: string;
      status: string;
      rejectionReason?: string;
    }) => {
      const res = await fetch(`/api/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...(rejectionReason && { rejectionReason }) }),
      });
      if (!res.ok) throw new Error("Failed to update application status");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: applicationKeys.lists() });
    },
  });
}

/** Bulk action on multiple applications */
export function useBulkAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      applicationIds: string[];
      action: string;
      params: Record<string, unknown>;
    }) => {
      const res = await fetch("/api/applications/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to perform bulk action");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: applicationKeys.lists() });
    },
  });
}

/** Fetch activity timeline for an application */
export function useApplicationTimeline(appId: string | null) {
  return useQuery({
    queryKey: applicationKeys.timeline(appId!),
    queryFn: async () => {
      const res = await fetch(`/api/applications/${appId}/timeline`);
      if (!res.ok) throw new Error("Failed to fetch timeline");
      return res.json();
    },
    enabled: !!appId,
    staleTime: 30 * 1000,
  });
}

/** Create an interview scorecard */
export function useCreateScorecard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      interviewId: string;
      scores: Record<string, unknown>;
      recommendation: string;
      notes?: string;
      strengths?: string;
      concerns?: string;
    }) => {
      const res = await fetch("/api/scorecards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to create scorecard");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: applicationKeys.lists() });
    },
  });
}

/** Create an interview from the applications page */
export function useCreateInterviewFromApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      candidates: { applicationId: string; jobSeekerId: string }[];
      jobId: string;
      scheduledAt: string;
      type: string;
      duration: number;
      location?: string;
      meetLink?: string;
      instructions?: string;
    }) => {
      const res = await fetch("/api/interviews/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to create interview");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: applicationKeys.lists() });
    },
  });
}

/** Create an offer from the applications page */
export function useCreateOfferFromApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      applicationId: string;
      salary: { amount: number; currency: string; period: string };
      startDate: string;
      benefits?: string;
      notes?: string;
      expiresAt?: string;
    }) => {
      const res = await fetch("/api/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to create offer");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: applicationKeys.lists() });
    },
  });
}

/** Fetch interview for an application (lazy, triggered on click) */
export function useFetchInterviewForApp() {
  return useMutation({
    mutationFn: async (applicationId: string) => {
      const res = await fetch(
        `/api/interviews?applicationId=${applicationId}&limit=1`
      );
      if (!res.ok) throw new Error("Failed to fetch interview");
      return res.json();
    },
  });
}

/** Compare multiple applications side-by-side */
export function useCompareApplications(ids: string[]) {
  return useQuery({
    queryKey: applicationKeys.compare(ids),
    queryFn: async () => {
      const res = await fetch(`/api/applications/compare?ids=${ids.join(",")}`);
      if (!res.ok) throw new Error("Failed to load comparison data");
      return res.json();
    },
    enabled: ids.length >= 2,
    staleTime: 30 * 1000,
  });
}
