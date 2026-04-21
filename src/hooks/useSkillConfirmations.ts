import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ── Types ──────────────────────────────────────────────────────────

export interface SkillGaps {
  matchedSkills: string[];
  confirmedSkills: string[];
  deniedSkills: string[];
  unansweredSkills: string[];
  totalJobSkills: number;
}

export interface SkillConfirmationRecord {
  _id: string;
  userId: string;
  skill: string;
  status: "confirmed" | "denied" | "skipped";
  source: string;
  jobId?: string;
  createdAt: string;
  updatedAt: string;
}

interface ConfirmSkillInput {
  skill: string;
  status: "confirmed" | "denied" | "skipped";
  source?: "job_view" | "feed" | "recommendation" | "skills_coach";
  jobId?: string;
}

// ── Query Keys ─────────────────────────────────────────────────────

export const skillConfirmationKeys = {
  all: ["skill-confirmations"] as const,
  gaps: (jobId: string) => ["skill-gaps", jobId] as const,
};

// ── Hooks ──────────────────────────────────────────────────────────

/** Fetch skill gap analysis for a specific job */
export function useSkillGaps(jobId: string | undefined) {
  return useQuery<SkillGaps>({
    queryKey: skillConfirmationKeys.gaps(jobId ?? ""),
    queryFn: async () => {
      const res = await fetch(`/api/job-seeker/skill-gaps?jobId=${jobId}`);
      if (!res.ok) throw new Error("Failed to fetch skill gaps");
      return res.json();
    },
    enabled: !!jobId,
    staleTime: 30_000,
  });
}

/** Fetch all skill confirmations for current user */
export function useAllConfirmations() {
  return useQuery<{ confirmations: SkillConfirmationRecord[] }>({
    queryKey: skillConfirmationKeys.all,
    queryFn: async () => {
      const res = await fetch("/api/job-seeker/skill-confirmations");
      if (!res.ok) throw new Error("Failed to fetch confirmations");
      return res.json();
    },
    staleTime: 60_000,
  });
}

/** Mutation to confirm/deny/skip a skill */
export function useConfirmSkill() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: ConfirmSkillInput) => {
      const res = await fetch("/api/job-seeker/skill-confirmations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error ?? "Failed to confirm skill");
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      // Invalidate all skill gaps (any job) since this skill answer applies globally
      qc.invalidateQueries({ queryKey: ["skill-gaps"] });
      // Invalidate confirmations list
      qc.invalidateQueries({ queryKey: skillConfirmationKeys.all });
      // Invalidate job recommendations since match scores may change
      if (variables.status === "confirmed" || variables.status === "denied") {
        qc.invalidateQueries({ queryKey: ["recommended-jobs"] });
        qc.invalidateQueries({ queryKey: ["job-feed"] });
        qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      }
    },
  });
}
