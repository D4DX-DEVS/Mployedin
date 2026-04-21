import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { MatchingWeights } from "./useMatchingWeights";

// ── Types ──────────────────────────────────────────────────────────
export interface MatchingWeightTemplateItem {
  _id: string;
  name: string;
  description?: string;
  scope: "system" | "employer";
  employerId?: string;
  weights: MatchingWeights;
  tags?: string[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MatchingWeightTemplatePayload {
  name: string;
  description?: string;
  weights: MatchingWeights;
  tags?: string[];
  isDefault?: boolean;
}

// ── Query Keys ─────────────────────────────────────────────────────
export const matchingWeightTemplateKeys = {
  all: ["matching-weight-templates"] as const,
  lists: () => [...matchingWeightTemplateKeys.all, "list"] as const,
  admin: () => [...matchingWeightTemplateKeys.all, "admin"] as const,
  employer: () => [...matchingWeightTemplateKeys.all, "employer"] as const,
};

// ── Admin Hooks (system scope) ─────────────────────────────────────

async function fetchAdminTemplates(): Promise<MatchingWeightTemplateItem[]> {
  const res = await fetch("/api/admin/matching-weight-templates");
  if (!res.ok) throw new Error("Failed to load matching weight templates");
  const data = await res.json();
  return data.templates;
}

export function useAdminMatchingWeightTemplates() {
  return useQuery({
    queryKey: matchingWeightTemplateKeys.admin(),
    queryFn: fetchAdminTemplates,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateAdminMatchingWeightTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: MatchingWeightTemplatePayload) => {
      const res = await fetch("/api/admin/matching-weight-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to create template");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: matchingWeightTemplateKeys.all }),
  });
}

export function useUpdateAdminMatchingWeightTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: MatchingWeightTemplatePayload & { id: string }) => {
      const res = await fetch(`/api/admin/matching-weight-templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to update template");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: matchingWeightTemplateKeys.all }),
  });
}

export function useDeleteAdminMatchingWeightTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/matching-weight-templates/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete template");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: matchingWeightTemplateKeys.all }),
  });
}

// ── Employer Hooks (system + employer scope) ───────────────────────

async function fetchEmployerTemplates(): Promise<MatchingWeightTemplateItem[]> {
  const res = await fetch("/api/employers/matching-weight-templates");
  if (!res.ok) throw new Error("Failed to load matching weight templates");
  const data = await res.json();
  return data.templates;
}

export function useEmployerMatchingWeightTemplates() {
  return useQuery({
    queryKey: matchingWeightTemplateKeys.employer(),
    queryFn: fetchEmployerTemplates,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateEmployerMatchingWeightTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: MatchingWeightTemplatePayload) => {
      const res = await fetch("/api/employers/matching-weight-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to create template");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: matchingWeightTemplateKeys.all }),
  });
}

export function useUpdateEmployerMatchingWeightTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: MatchingWeightTemplatePayload & { id: string }) => {
      const res = await fetch(`/api/employers/matching-weight-templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to update template");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: matchingWeightTemplateKeys.all }),
  });
}

export function useDeleteEmployerMatchingWeightTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/employers/matching-weight-templates/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete template");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: matchingWeightTemplateKeys.all }),
  });
}
