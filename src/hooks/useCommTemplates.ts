import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CommTemplateType } from "@/models/CommTemplate";

// ── Types ──────────────────────────────────────────────────────────
export interface CommTemplate {
  _id: string;
  name: string;
  type: CommTemplateType;
  subject: string;
  body: string;
  isDefault: boolean;
  createdAt: string;
}

interface CommTemplatesResponse {
  templates: CommTemplate[];
}

// ── Query Keys ─────────────────────────────────────────────────────
export const commTemplateKeys = {
  all: ["comm-templates"] as const,
  lists: () => [...commTemplateKeys.all, "list"] as const,
  list: (type?: CommTemplateType | "all") => [...commTemplateKeys.lists(), type ?? "all"] as const,
};

// ── Fetcher ────────────────────────────────────────────────────────
async function fetchCommTemplates(type?: CommTemplateType | "all"): Promise<CommTemplate[]> {
  const url = !type || type === "all"
    ? "/api/employers/comm-templates"
    : `/api/employers/comm-templates?type=${type}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch communication templates");
  const data: CommTemplatesResponse = await res.json();
  return data.templates ?? [];
}

// ── Hooks ──────────────────────────────────────────────────────────

/** Fetch communication templates with optional type filter */
export function useCommTemplates(type?: CommTemplateType | "all") {
  return useQuery({
    queryKey: commTemplateKeys.list(type),
    queryFn: () => fetchCommTemplates(type),
    staleTime: 5 * 60 * 1000,
  });
}

/** Create a new communication template */
export function useCreateCommTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (formData: { name: string; type: CommTemplateType; subject: string; body: string }) => {
      const res = await fetch("/api/employers/comm-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error ?? "Failed to create template");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: commTemplateKeys.lists() });
    },
  });
}

/** Update an existing communication template */
export function useUpdateCommTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ templateId, ...data }: { templateId: string; name?: string; type?: CommTemplateType; subject?: string; body?: string }) => {
      const res = await fetch(`/api/employers/comm-templates/${templateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update template");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: commTemplateKeys.lists() });
    },
  });
}

/** Delete a communication template */
export function useDeleteCommTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (templateId: string) => {
      const res = await fetch(`/api/employers/comm-templates/${templateId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete template");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: commTemplateKeys.lists() });
    },
  });
}
