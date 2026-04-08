import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ── Types ──────────────────────────────────────────────────────────
export interface WorkflowStage {
  id: string;
  label: string;
  enabled: boolean;
  autoProgress: boolean;
  order: number;
}

export interface WorkflowSettings {
  aiAutoScreen: boolean;
  notifyOnStageChange: boolean;
  autoRejectBelow: number;
}

interface WorkflowResponse {
  stages?: WorkflowStage[];
  settings?: Partial<WorkflowSettings>;
}

export interface WorkflowPayload {
  stages: WorkflowStage[];
  settings: WorkflowSettings;
}

// ── Query Keys ─────────────────────────────────────────────────────
export const workflowKeys = {
  all: ["workflow"] as const,
  detail: () => [...workflowKeys.all, "detail"] as const,
};

// ── Fetcher ────────────────────────────────────────────────────────
async function fetchWorkflow(): Promise<WorkflowResponse> {
  const res = await fetch("/api/employers/workflow");
  if (!res.ok) throw new Error("Failed to load workflow settings");
  return res.json();
}

// ── Hooks ──────────────────────────────────────────────────────────

/** Fetch employer workflow configuration */
export function useWorkflow() {
  return useQuery({
    queryKey: workflowKeys.detail(),
    queryFn: fetchWorkflow,
    staleTime: 5 * 60 * 1000,
  });
}

/** Save workflow stages and settings */
export function useSaveWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: WorkflowPayload) => {
      const res = await fetch("/api/employers/workflow", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to save workflow");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: workflowKeys.detail() });
    },
  });
}
