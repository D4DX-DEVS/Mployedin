import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { WorkflowStage, WorkflowSettings } from "./useWorkflow";

// ── Types ──────────────────────────────────────────────────────────
export interface WorkflowTemplateItem {
  _id: string;
  name: string;
  description?: string;
  scope: "system" | "employer";
  employerId?: string;
  stages: WorkflowStage[];
  settings: WorkflowSettings;
  tags?: string[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowTemplatePayload {
  name: string;
  description?: string;
  stages: WorkflowStage[];
  settings?: Partial<WorkflowSettings>;
  tags?: string[];
  isDefault?: boolean;
}

// ── Query Keys ─────────────────────────────────────────────────────
export const workflowTemplateKeys = {
  all: ["workflow-templates"] as const,
  lists: () => [...workflowTemplateKeys.all, "list"] as const,
  admin: () => [...workflowTemplateKeys.all, "admin"] as const,
  employer: () => [...workflowTemplateKeys.all, "employer"] as const,
};

// ── Admin Hooks (system scope) ─────────────────────────────────────

async function fetchAdminWorkflowTemplates(): Promise<WorkflowTemplateItem[]> {
  const res = await fetch("/api/admin/workflow-templates");
  if (!res.ok) throw new Error("Failed to load workflow templates");
  const data = await res.json();
  return data.templates;
}

export function useAdminWorkflowTemplates() {
  return useQuery({
    queryKey: workflowTemplateKeys.admin(),
    queryFn: fetchAdminWorkflowTemplates,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateAdminWorkflowTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: WorkflowTemplatePayload) => {
      const res = await fetch("/api/admin/workflow-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to create template");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workflowTemplateKeys.all }),
  });
}

export function useUpdateAdminWorkflowTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: WorkflowTemplatePayload & { id: string }) => {
      const res = await fetch(`/api/admin/workflow-templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to update template");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workflowTemplateKeys.all }),
  });
}

export function useDeleteAdminWorkflowTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/workflow-templates/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete template");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workflowTemplateKeys.all }),
  });
}

// ── Employer Hooks (system + employer scope) ───────────────────────

async function fetchEmployerWorkflowTemplates(): Promise<WorkflowTemplateItem[]> {
  const res = await fetch("/api/employers/workflow-templates");
  if (!res.ok) throw new Error("Failed to load workflow templates");
  const data = await res.json();
  return data.templates;
}

export function useEmployerWorkflowTemplates() {
  return useQuery({
    queryKey: workflowTemplateKeys.employer(),
    queryFn: fetchEmployerWorkflowTemplates,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateEmployerWorkflowTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: WorkflowTemplatePayload) => {
      const res = await fetch("/api/employers/workflow-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to create template");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workflowTemplateKeys.all }),
  });
}

export function useUpdateEmployerWorkflowTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: WorkflowTemplatePayload & { id: string }) => {
      const res = await fetch(`/api/employers/workflow-templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to update template");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workflowTemplateKeys.all }),
  });
}

export function useDeleteEmployerWorkflowTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/employers/workflow-templates/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete template");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workflowTemplateKeys.all }),
  });
}
