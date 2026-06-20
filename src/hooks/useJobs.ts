import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ── Types ──────────────────────────────────────────────────────────
export interface Job {
  _id: string;
  title: string;
  location: string | { isRemote?: boolean; city?: string; country?: string };
  category: string;
  status: "draft" | "active" | "paused" | "closed" | "expired";
  workMode?: "onsite" | "hybrid" | "remote";
  employmentType?: "full_time" | "part_time" | "contract" | "internship" | "freelance";
  salary: { min: number; max: number; currency: string; isNegotiable?: boolean; period?: string };
  requirements: { skills: string[]; experienceMin?: number; experienceMax?: number; education?: string; languages?: string[] };
  poster?: { approvalStatus?: "pending" | "approved" | "rejected" };
  "poster.approvalStatus"?: "pending" | "approved" | "rejected";
  vacancies?: number;
  maxApplicants?: number;
  showSalary?: boolean;
  views?: number;
  tags?: string[];
  description?: string;
  responsibilities?: string[];
  qualifications?: string[];
  workflowMode?: string;
  updatedAt?: string;
  employerId?: { companyName?: string; logo?: string; industry?: string };
  applicantIds?: string[];
  applicationCount?: number;
  createdAt: string;
  expiresAt?: string;
  clonedFrom?: string;
}

interface JobsResponse {
  jobs: Job[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
  statusCounts?: Record<string, number>;
  totalVacancies?: number;
}

export interface JobsFilters {
  page: number;
  limit: number;
  status?: string;
  search?: string;
  approvalStatus?: string;
  workMode?: string;
  location?: string;
  skills?: string[];
  showSalary?: "true" | "false";
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
  if (filters.approvalStatus && filters.approvalStatus !== "all") params.set("approvalStatus", filters.approvalStatus);
  if (filters.workMode && filters.workMode !== "all") params.set("workMode", filters.workMode);
  if (filters.location) params.set("location", filters.location);
  if (filters.skills?.length) params.set("skills", filters.skills.join(","));
  if (filters.showSalary) params.set("showSalary", filters.showSalary);

  const res = await fetch(`/api/jobs?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch jobs");
  return res.json();
}

// ── Hooks ──────────────────────────────────────────────────────────

/** Fetch paginated, filtered jobs list */
export function useJobs(filters: JobsFilters) {
  return useQuery({
    queryKey: jobKeys.list(filters),
    queryFn: () => fetchJobs(filters),
    staleTime: 5 * 60 * 1000, // 5 min — match global default; avoids HMR refetch storms
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

/** Save a job as a reusable template */
export function useSaveAsTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (job: Job) => {
      const location = typeof job.location === "string"
        ? undefined
        : job.location;
      const body = {
        name: job.title,
        title: job.title,
        description: job.description,
        category: job.category,
        requirements: job.requirements,
        salary: job.salary,
        location,
        tags: job.tags,
        vacancies: job.vacancies,
        sourceJobId: job._id,
      };
      const res = await fetch("/api/employers/job-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to save template");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["job-templates"] });
    },
  });
}

/** Fetch all job templates for the authenticated employer */
export function useJobTemplates() {
  return useQuery({
    queryKey: ["job-templates"],
    queryFn: async () => {
      const res = await fetch("/api/employers/job-templates");
      if (!res.ok) throw new Error("Failed to fetch job templates");
      const data = await res.json();
      return (data.templates ?? []) as Array<{ _id: string; sourceJobId?: string }>;
    },
    staleTime: 5 * 60 * 1000,
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
    onMutate: async (jobId: string) => {
      await qc.cancelQueries({ queryKey: jobKeys.lists() });
      const previousData = qc.getQueriesData<JobsResponse>({ queryKey: jobKeys.lists() });
      qc.setQueriesData<JobsResponse>({ queryKey: jobKeys.lists() }, (old) => {
        if (!old) return old;
        return {
          ...old,
          jobs: old.jobs.filter((j) => j._id !== jobId),
          pagination: { ...old.pagination, total: old.pagination.total - 1 },
        };
      });
      return { previousData };
    },
    onSuccess: () => {
      // optimistic update already removed the job — just sync details cache
      qc.invalidateQueries({ queryKey: jobKeys.details() });
    },
    onError: (_err, _jobId, context) => {
      // roll back optimistic update
      if (context?.previousData) {
        for (const [queryKey, data] of context.previousData) {
          qc.setQueryData(queryKey, data);
        }
      }
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
