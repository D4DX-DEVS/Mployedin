import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { WorkflowStageDef } from "@/lib/hiring/workflowStages";
import type { WorkflowResolutionReason, WorkflowTemplateMatchRules } from "@/lib/hiring/workflowTemplateMatch";

// ── Types ──────────────────────────────────────────────────────────
/** Mirrors WorkflowTemplateDTO (lib/hiring/workflowTemplateStore.ts); kept here so the hook stays client-only. */
export interface WorkflowTemplateItem {
  _id: string;
  name: string;
  description: string;
  scope: "system" | "employer";
  isDefault: boolean;
  isActive: boolean;
  version: number;
  priority: number;
  match: WorkflowTemplateMatchRules;
  stages: WorkflowStageDef[];
  tags: string[];
  usageCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkflowTemplatePayload {
  name: string;
  description?: string;
  stages: Pick<WorkflowStageDef, "id" | "label" | "phase">[];
  match?: WorkflowTemplateMatchRules;
  priority?: number;
  isDefault?: boolean;
  isActive?: boolean;
  tags?: string[];
}

export type WorkflowTemplateAction = "set_default" | "unset_default" | "archive" | "restore" | "duplicate";

export interface WorkflowTemplateJobRow {
  _id: string;
  title: string;
  status: string;
  companyName: string;
  version: number;
  source: "auto" | "manual" | "custom";
  appliedAt: string | null;
}

/** The workflow a job would get automatically, from the details typed so far. */
export interface ResolvedWorkflow {
  templateId: string | null;
  name: string;
  reason: WorkflowResolutionReason;
  stages: WorkflowStageDef[];
}

/** Job details the automatic pick reads. */
export interface WorkflowMatchInput {
  title?: string;
  category?: string;
  employmentType?: string;
  workMode?: string;
  experienceMin?: number;
}

/** The API refused because jobs still run on the template (archive it instead). */
export class TemplateInUseError extends Error {
  constructor(public readonly count: number) {
    super("Workflow template is in use");
  }
}

// ── Query Keys ─────────────────────────────────────────────────────
export const workflowTemplateKeys = {
  all: ["workflow-templates"] as const,
  admin: () => [...workflowTemplateKeys.all, "admin"] as const,
  jobs: (id: string) => [...workflowTemplateKeys.all, "jobs", id] as const,
  options: (employerId: string, match: WorkflowMatchInput | null) =>
    [...workflowTemplateKeys.all, "options", employerId, match] as const,
};

async function send<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (res.status === 409 && data?.error === "TEMPLATE_IN_USE") throw new TemplateInUseError(Number(data.count) || 0);
  if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Workflow template request was not completed");
  return data as T;
}

// ── Admin Hooks (platform templates) ───────────────────────────────

export function useAdminWorkflowTemplates() {
  return useQuery({
    queryKey: workflowTemplateKeys.admin(),
    queryFn: () => send<{ templates: WorkflowTemplateItem[]; categoryOptions: string[] }>("/api/admin/workflow-templates", "GET"),
    staleTime: 60 * 1000,
  });
}

export function useCreateAdminWorkflowTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: WorkflowTemplatePayload) =>
      send<{ template: WorkflowTemplateItem }>("/api/admin/workflow-templates", "POST", payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: workflowTemplateKeys.all }),
  });
}

export function useUpdateAdminWorkflowTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: WorkflowTemplatePayload & { id: string }) =>
      send<{ template: WorkflowTemplateItem }>(`/api/admin/workflow-templates/${id}`, "PATCH", payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: workflowTemplateKeys.all }),
  });
}

export function useAdminWorkflowTemplateAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: WorkflowTemplateAction }) =>
      send<{ template: WorkflowTemplateItem }>(`/api/admin/workflow-templates/${id}`, "POST", { action }),
    onSuccess: () => qc.invalidateQueries({ queryKey: workflowTemplateKeys.all }),
  });
}

export function useDeleteAdminWorkflowTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => send<{ success: boolean }>(`/api/admin/workflow-templates/${id}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: workflowTemplateKeys.all }),
  });
}

/** The jobs that run on one template ("Used by N jobs"). */
export function useWorkflowTemplateJobs(id: string | null) {
  return useQuery({
    queryKey: workflowTemplateKeys.jobs(id ?? ""),
    queryFn: () => send<{ total: number; jobs: WorkflowTemplateJobRow[] }>(`/api/admin/workflow-templates/${id}/jobs`, "GET"),
    enabled: Boolean(id),
  });
}

// ── Picker (job form, job workflow tab, employer default) ─────────

/**
 * Active templates a job for this employer can run on and, when `match` is
 * given, the one it would get automatically. Staff pass the employer the job
 * is posted for; employers are resolved from their session.
 */
export function useWorkflowTemplateOptions(options: { employerId?: string | null; match?: WorkflowMatchInput | null; enabled?: boolean } = {}) {
  const employerId = options.employerId ?? "";
  const match = options.match ?? null;
  return useQuery({
    queryKey: workflowTemplateKeys.options(employerId, match),
    queryFn: () => {
      const params = new URLSearchParams();
      if (employerId) params.set("employerId", employerId);
      if (match) {
        params.set("resolve", "1");
        for (const [key, value] of Object.entries(match)) {
          if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
        }
      }
      return send<{ templates: WorkflowTemplateItem[]; resolved?: ResolvedWorkflow }>(`/api/workflow-templates?${params}`, "GET");
    },
    enabled: options.enabled ?? true,
    staleTime: 30 * 1000,
    placeholderData: (previous) => previous,
  });
}
