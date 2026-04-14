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
  totalExperienceYears?: number;
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
  shortlisted?: boolean;
}

export interface CandidateJob {
  _id: string;
  title: string;
  requirements?: {
    skills?: string[];
    experienceMin?: number;
    experienceMax?: number;
  };
  location?: {
    city?: string;
    country?: string;
    isRemote?: boolean;
  };
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
  jobId?: string;
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
  // When a job is selected, fetch applicants for that job from applications API
  if (filters.jobId) {
    const params = new URLSearchParams();
    params.set("page", String(filters.page));
    params.set("limit", String(filters.limit));
    params.set("jobId", filters.jobId);
    if (filters.search) params.set("search", filters.search);

    const res = await fetch(`/api/applications?${params}`);
    if (!res.ok) throw new Error("Failed to fetch candidates for job");
    const data = await res.json() as {
      applications?: Array<{
        jobSeekerId?: {
          _id?: unknown;
          userId?: { _id: string; name: string; email: string };
          skills?: string[];
          currentLocation?: string;
          totalExperienceYears?: number;
          experience?: { jobTitle: string; company: string; isCurrent: boolean }[];
          availabilityStatus?: string;
          profileCompleteness?: number;
          cv?: { originalUrl?: string };
        };
        aiMatchScore?: number;
        matchBreakdown?: { skills: number; experience: number; location: number; language: number };
        strengths?: string[];
        gaps?: string[];
      }>;
      pagination?: { total?: number };
    };

    const candidates: Candidate[] = (data.applications ?? [])
      .filter((app) => app.jobSeekerId?._id)
      .map((app) => ({
        _id: String(app.jobSeekerId!._id),
        userId: app.jobSeekerId!.userId,
        skills: app.jobSeekerId!.skills,
        currentLocation: app.jobSeekerId!.currentLocation,
        totalExperienceYears: app.jobSeekerId!.totalExperienceYears,
        experience: app.jobSeekerId!.experience,
        availabilityStatus: app.jobSeekerId!.availabilityStatus,
        profileCompleteness: app.jobSeekerId!.profileCompleteness,
        cv: app.jobSeekerId!.cv,
        matchScore: app.aiMatchScore,
        matchBreakdown: app.matchBreakdown,
        strengths: app.strengths,
        gaps: app.gaps,
      }));

    return { candidates, total: data.pagination?.total ?? candidates.length };
  }

  // No job selected — browse all job seekers
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
  // myJobs=true scopes to this employer's own jobs across all statuses
  const res = await fetch("/api/jobs?myJobs=true&limit=100");
  if (!res.ok) throw new Error("Failed to fetch jobs");
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
