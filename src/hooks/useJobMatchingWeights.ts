import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { MatchingWeights } from "./useMatchingWeights";

export { type MatchingWeights };

interface JobMatchingWeightsResponse {
  weights: MatchingWeights;
  source: "job" | "employer";
}

export const jobMatchingWeightsKeys = {
  all: ["job-matching-weights"] as const,
  detail: (jobId: string) => [...jobMatchingWeightsKeys.all, jobId] as const,
};

async function fetchJobMatchingWeights(jobId: string): Promise<JobMatchingWeightsResponse> {
  const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/matching-weights`);
  if (!res.ok) throw new Error("Failed to load job matching weights");
  return res.json();
}

/** Fetch per-job matching weights (falls back to employer defaults) */
export function useJobMatchingWeights(jobId: string) {
  return useQuery({
    queryKey: jobMatchingWeightsKeys.detail(jobId),
    queryFn: () => fetchJobMatchingWeights(jobId),
    enabled: !!jobId,
    staleTime: 5 * 60 * 1000,
  });
}

/** Save per-job matching weights */
export function useSaveJobMatchingWeights(jobId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (weights: MatchingWeights) => {
      const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/matching-weights`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weights }),
      });
      if (!res.ok) throw new Error("Failed to save job matching weights");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: jobMatchingWeightsKeys.detail(jobId) });
    },
  });
}
