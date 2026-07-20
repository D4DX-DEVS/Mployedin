import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ── Types ──────────────────────────────────────────────────────────
export interface MatchingWeights {
  skills: number;
  experience: number;
  education: number;
  industryExperience: number;
  preferredQualifications: number;
}

interface MatchingWeightsResponse {
  weights?: MatchingWeights;
}

// ── Query Keys ─────────────────────────────────────────────────────
export const matchingWeightsKeys = {
  all: ["matching-weights"] as const,
  detail: () => [...matchingWeightsKeys.all, "detail"] as const,
};

// ── Fetcher ────────────────────────────────────────────────────────
async function fetchMatchingWeights(): Promise<MatchingWeights | null> {
  const res = await fetch("/api/employers/matching-weights");
  if (!res.ok) throw new Error("Failed to fetch matching weights");
  const data: MatchingWeightsResponse = await res.json();
  return data.weights ?? null;
}

// ── Hooks ──────────────────────────────────────────────────────────

/** Fetch employer matching weights */
export function useMatchingWeights() {
  return useQuery({
    queryKey: matchingWeightsKeys.detail(),
    queryFn: fetchMatchingWeights,
    staleTime: 5 * 60 * 1000,
  });
}

/** Save matching weights */
export function useSaveMatchingWeights() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (weights: MatchingWeights) => {
      const res = await fetch("/api/employers/matching-weights", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weights }),
      });
      if (!res.ok) throw new Error("Failed to save matching weights");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: matchingWeightsKeys.detail() });
    },
  });
}
