import { useQuery } from "@tanstack/react-query";
import type { ApplicationStatus } from "@/models/Application";

export interface JobHiringSummary {
  jobId: string;
  status: string;
  vacancies: number;
  views: number;
  total: number;
  statusCounts: Record<ApplicationStatus, number>;
  unreviewed: number;
  interviews: {
    /** Scheduled or confirmed, any date — what the Interviews tab counts. */
    open: number;
    /** Distinct candidates in interview: at the stage, or holding an open
     *  interview from another stage. What the Overview funnel counts. */
    interviewingCandidates: number;
    upcoming: number;
    awaitingOutcome: number;
    rescheduleRequests: number;
  };
  offers: {
    pending: number;
    expiringSoon: number;
    accepted: number;
  };
  checks: {
    inProgress: number;
    completed: number;
  };
  placements: {
    active: number;
    completed: number;
  };
  posters: number;
}

export const jobHiringSummaryKeys = {
  all: ["job-hiring-summary"] as const,
  detail: (id: string) => [...jobHiringSummaryKeys.all, id] as const,
};

export function useJobHiringSummary(jobId: string | undefined) {
  return useQuery({
    queryKey: jobHiringSummaryKeys.detail(jobId ?? ""),
    queryFn: async () => {
      const res = await fetch(`/api/jobs/${jobId}/hiring-summary`);
      if (!res.ok) throw new Error("Failed to fetch job hiring summary");
      return res.json() as Promise<JobHiringSummary>;
    },
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
    enabled: !!jobId,
  });
}
