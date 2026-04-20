import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { WorkflowStage, WorkflowSettings, WorkflowPayload } from "./useWorkflow";

export { type WorkflowStage, type WorkflowSettings, type WorkflowPayload };

interface JobWorkflowResponse {
  stages?: WorkflowStage[] | null;
  settings?: Partial<WorkflowSettings>;
  source: "job" | "employer";
}

export const jobWorkflowKeys = {
  all: ["job-workflow"] as const,
  detail: (jobId: string) => [...jobWorkflowKeys.all, jobId] as const,
};

async function fetchJobWorkflow(jobId: string): Promise<JobWorkflowResponse> {
  const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/workflow`);
  if (!res.ok) throw new Error("Failed to load job workflow");
  return res.json();
}

/** Fetch per-job workflow configuration (falls back to employer defaults) */
export function useJobWorkflow(jobId: string) {
  return useQuery({
    queryKey: jobWorkflowKeys.detail(jobId),
    queryFn: () => fetchJobWorkflow(jobId),
    enabled: !!jobId,
    staleTime: 5 * 60 * 1000,
  });
}

/** Save per-job workflow stages and settings */
export function useSaveJobWorkflow(jobId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: WorkflowPayload) => {
      const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/workflow`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to save job workflow");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: jobWorkflowKeys.detail(jobId) });
    },
  });
}
