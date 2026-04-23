"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export type ZoneDisplayStyle = "plain" | "pill" | "card" | "button" | "badge";

export interface TextZone {
  id: string;
  field: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
  fontWeight: number;
  color: string;
  align: "left" | "center" | "right";
  visible: boolean;
  /** Visual treatment for this zone */
  displayStyle?: ZoneDisplayStyle;
  /** Background color (hex with optional alpha) */
  bgColor?: string;
  /** Border radius in px */
  borderRadius?: number;
  /** Inner padding in px */
  padding?: number;
}

export interface PosterTemplateItem {
  _id: string;
  name: string;
  category: string;
  backgroundImages: { landscape?: string; square?: string; story?: string };
  textZones: { landscape: TextZone[]; square: TextZone[]; story: TextZone[] };
  defaultAccentColor: string;
  isActive: boolean;
  sortOrder: number;
  previewUrl?: string;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  items: PosterTemplateItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const posterTemplateKeys = {
  all: ["poster-templates"] as const,
  list: (params?: Record<string, string>) =>
    [...posterTemplateKeys.all, "list", params ?? {}] as const,
  detail: (id: string) => [...posterTemplateKeys.all, "detail", id] as const,
};

async function fetchList(params?: Record<string, string>): Promise<ListResponse> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`/api/admin/poster-templates?${qs}`);
  if (!res.ok) throw new Error("Failed to load poster templates");
  return res.json();
}

async function fetchOne(id: string): Promise<PosterTemplateItem> {
  const res = await fetch(`/api/admin/poster-templates/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error("Failed to load poster template");
  const data = await res.json();
  return data.template;
}

export function usePosterTemplates(params?: Record<string, string>) {
  return useQuery({
    queryKey: posterTemplateKeys.list(params),
    queryFn: () => fetchList(params),
    staleTime: 60_000,
  });
}

export function usePosterTemplate(id: string) {
  return useQuery({
    queryKey: posterTemplateKeys.detail(id),
    queryFn: () => fetchOne(id),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useCreatePosterTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch("/api/admin/poster-templates", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to create template");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: posterTemplateKeys.all });
    },
  });
}

export function useUpdatePosterTemplate(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: FormData | Record<string, unknown>) => {
      const isFormData = body instanceof FormData;
      const res = await fetch(
        `/api/admin/poster-templates/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          ...(isFormData
            ? { body }
            : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to update template");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: posterTemplateKeys.all });
    },
  });
}

export function useDeletePosterTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(
        `/api/admin/poster-templates/${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to delete template");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: posterTemplateKeys.all });
    },
  });
}

/** Employer-facing: active templates only */
export function useActivePosterTemplates(category?: string) {
  const params = category ? { category } : undefined;
  return useQuery({
    queryKey: ["active-poster-templates", params ?? {}],
    queryFn: async () => {
      const qs = params ? `?${new URLSearchParams(params)}` : "";
      const res = await fetch(`/api/poster-templates${qs}`);
      if (!res.ok) throw new Error("Failed to load templates");
      const data = await res.json();
      return data.items as PosterTemplateItem[];
    },
    staleTime: 5 * 60_000,
  });
}

/* ────────────────────────────────────────────────────────────── */
/*  AI chat-style poster layout assistant                        */
/* ────────────────────────────────────────────────────────────── */

export interface AIChatRequest {
  message: string;
  format: "landscape" | "square" | "story";
  category: string;
  accentColor?: string;
  hasBackground: boolean;
  currentZoneFields: string[];
}

export interface AIChatResponse {
  reply: string;
  zones?: Omit<TextZone, "id">[];
  suggestedAccentColor?: string;
  colorPalette?: string[];
}

export function useAIPosterChat() {
  return useMutation({
    mutationFn: async (input: AIChatRequest): Promise<AIChatResponse> => {
      const res = await fetch("/api/ai/poster-layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          err.error ?? "AI request failed. Please try again."
        );
      }
      return res.json();
    },
  });
}
