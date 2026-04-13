import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ── Types ──────────────────────────────────────────────────────────
export interface Job {
  _id: string;
  title: string;
  location: string | { isRemote?: boolean; city?: string; country?: string };
  category: string;
  status: "draft" | "active" | "closed" | "expired";
  salary: { min: number; max: number; currency: string; isNegotiable?: boolean; period?: string };
  requirements: { skills: string[]; experienceMin?: number; experienceMax?: number; education?: string; languages?: string[] };
  "poster.approvalStatus": "pending" | "approved" | "rejected";
  vacancies?: number;
  maxApplicants?: number;
  showSalary?: boolean;
  views?: number;
  tags?: string[];
  description?: string;
  workflowMode?: string;
  updatedAt?: string;
  employerId?: { companyName?: string };
  createdAt: string;
  expiresAt?: string;
}

interface JobsResponse {
  jobs: Job[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

export interface JobsFilters {
  page: number;
  limit: number;
  status?: string;
  search?: string;
  myJobs?: boolean;
}

// ── Query Keys ─────────────────────────────────────────────────────
export const jobKeys = {
  all: ["jobs"] as const,
  lists: () => [...jobKeys.all, "list"] as const,
  list: (filters: JobsFilters) => [...jobKeys.lists(), filters] as const,
  details: () => [...jobKeys.all, "detail"] as const,
  detail: (id: string) => [...jobKeys.details(), id] as const,
};

// ── Fetcher ────────────────────────────────────────────────────────
async function fetchJobs(filters: JobsFilters): Promise<JobsResponse> {
  const params = new URLSearchParams();
  params.set("page", String(filters.page));
  params.set("limit", String(filters.limit));
  if (filters.myJobs) params.set("myJobs", "true");
  if (filters.status && filters.status !== "all") params.set("status", filters.status);
  if (filters.search) params.set("search", filters.search);

  const res = await fetch(`/api/jobs?${params}`);
  if (!res.ok) throw new Error("Failed to fetch jobs");
  return res.json();
}

// ── Hooks ──────────────────────────────────────────────────────────

/** Fetch paginated, filtered jobs list */
export function useJobs(filters: JobsFilters) {
  return useQuery({
    queryKey: jobKeys.list(filters),
    queryFn: () => fetchJobs(filters),
    staleTime: 30 * 1000,
    placeholderData: (prev) => prev,
  });
}

/** Update job status (activate, close) */
export function useUpdateJobStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ jobId, status }: { jobId: string; status: string }) => {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update job status");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: jobKeys.lists() });
    },
  });
}

/** Clone a job */
export function useCloneJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string) => {
      const res = await fetch(`/api/jobs/${jobId}/clone`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to clone job");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: jobKeys.lists() });
    },
  });
}

/** Delete a draft job */
export function useDeleteJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string) => {
      const res = await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete job");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: jobKeys.lists() });
    },
  });
}

/** Fetch a single job by ID */
export function useJobDetail(id: string) {
  return useQuery({
    queryKey: jobKeys.detail(id),
    queryFn: async () => {
      const res = await fetch(`/api/jobs/${id}`);
      if (!res.ok) throw new Error("Failed to fetch job");
      const data = await res.json();
      return data.job as Job;
    },
    staleTime: 30 * 1000,
    enabled: !!id,
  });
}

/** Update a job (general PATCH) */
export function useUpdateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ jobId, updates }: { jobId: string; updates: Record<string, unknown> }) => {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to update job" }));
        throw new Error(err.error ?? "Failed to update job");
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: jobKeys.lists() });
      qc.invalidateQueries({ queryKey: jobKeys.detail(vars.jobId) });
    },
  });
}
