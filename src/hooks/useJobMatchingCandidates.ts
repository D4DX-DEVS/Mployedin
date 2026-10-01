import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { csrfFetch } from "@/lib/security/csrf-client";

/** Mirrors PoolCandidate (lib/matching/talentPoolMatches.ts) plus the invite flag. */
export interface MatchingCandidate {
  jobSeekerId: string;
  name: string;
  avatar?: string;
  headline?: string;
  currentLocation?: string;
  totalExperienceYears?: number;
  availabilityStatus?: string;
  score: number;
  breakdown: {
    skills: number;
    role: number;
    experience: number;
    education?: number;
    industry?: number;
    overall: number;
  };
  matchedSkills: string[];
  missingSkills: string[];
  requirementsStatus: "met" | "not_met" | "unverified";
  unmetRequirements: Array<{ key: string; required?: string; actual?: string; label?: string }>;
  preferenceMismatch: "country" | "work_mode" | "salary" | null;
  latestRole?: { title?: string; company?: string };
  invited: boolean;
}

export interface MatchingCandidatesPage {
  data: MatchingCandidate[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  poolSize: number;
  alreadyApplied: number;
  scoredAt: string;
  job: { _id: string; title: string; status: string };
}

export const jobMatchingKeys = {
  list: (jobId: string, page: number, pageSize: number) => ["job-matching-candidates", jobId, page, pageSize] as const,
  job: (jobId: string) => ["job-matching-candidates", jobId] as const,
};

/** A matching-list request the server refused, by status. */
export class MatchingRequestError extends Error {
  constructor(public readonly status: number) {
    super(`matching candidates ${status}`);
    this.name = "MatchingRequestError";
  }
}

/** The talent pool ranked for one job (GET /api/jobs/[id]/matching-candidates). */
export function useJobMatchingCandidates(jobId: string, page: number, pageSize: number) {
  return useQuery({
    queryKey: jobMatchingKeys.list(jobId, page, pageSize),
    queryFn: async (): Promise<MatchingCandidatesPage> => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      const res = await fetch(`/api/jobs/${jobId}/matching-candidates?${params}`);
      if (!res.ok) throw new MatchingRequestError(res.status);
      return res.json();
    },
    enabled: Boolean(jobId),
    // A refusal will not change on retry.
    retry: (count, err) => !(err instanceof MatchingRequestError && err.status < 500) && count < 2,
    staleTime: 60 * 1000,
    placeholderData: (previous) => previous,
  });
}

/** An invite the server refused, by status — the UI words it, never the raw server text. */
export class InviteError extends Error {
  constructor(public readonly status: number) {
    super(`invite ${status}`);
    this.name = "InviteError";
  }
}

/** Invite one candidate to apply; refreshes the list so the row reads "Invited". */
export function useInviteMatchedCandidate(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ jobSeekerId, message }: { jobSeekerId: string; message?: string }) => {
      const res = await csrfFetch("/api/employer/talent-search/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobSeekerId, jobId, ...(message?.trim() ? { message: message.trim() } : {}) }),
      });
      if (!res.ok) throw new InviteError(res.status);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: jobMatchingKeys.job(jobId) }),
  });
}
