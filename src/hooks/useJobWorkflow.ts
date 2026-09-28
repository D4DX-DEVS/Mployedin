import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { WorkflowStage, WorkflowSettings, WorkflowPayload } from "./useWorkflow";
import type { WorkflowStageDef } from "@/lib/hiring/workflowStages";
import type { WorkflowResolutionReason } from "@/lib/hiring/workflowTemplateMatch";

export { type WorkflowStage, type WorkflowSettings, type WorkflowPayload };

/** Where a job's stages came from; null = a job posted before templates (standard pipeline). */
export interface JobWorkflowTemplateInfo {
  templateId: string | null;
  name: string;
  version: number;
  source: "auto" | "manual" | "custom";
  reason: WorkflowResolutionReason | null;
  appliedAt: string | null;
}

export interface JobWorkflowResponse {
  /** The job's stages (its snapshot, or the standard pipeline). */
  stages: WorkflowStageDef[];
  template: JobWorkflowTemplateInfo | null;
  settings?: Partial<WorkflowSettings>;
  /** Whose hiring rules apply. */
  source: "job" | "employer";
}

/** A per-job save: rules, a template to switch to (null = automatic), or stages for this job only. */
export interface JobWorkflowPayload {
  settings?: Partial<WorkflowSettings>;
  templateId?: string | null;
  customStages?: Pick<WorkflowStageDef, "id" | "label" | "phase">[];
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
    mutationFn: async (payload: JobWorkflowPayload) => {
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
      // Board columns and stage counts follow the job's stages.
      qc.invalidateQueries({ queryKey: ["applications"] });
    },
  });
}
