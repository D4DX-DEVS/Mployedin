"use client";

import { useQuery, useMutation, useQueryClient, UseMutationResult } from "@tanstack/react-query";
import { csrfFetch } from "@/lib/security/csrf-client";

// ── Types ──────────────────────────────────────────────────────────
export interface SavedView {
  id: string;
  name: string;
  query: string;
  createdAt: string;
}

// ── Query Keys ─────────────────────────────────────────────────────
export const savedViewKeys = {
  all: ["saved-views"] as const,
};

// ── Hooks ──────────────────────────────────────────────────────────

export interface UseSavedViewsReturn {
  views: SavedView[];
  isLoading: boolean;
  create: UseMutationResult<SavedView, Error, { name: string; query: string }>;
  remove: UseMutationResult<void, Error, string>;
}

export function useSavedViews(): UseSavedViewsReturn {
  const qc = useQueryClient();

  const { data = { views: [] }, isLoading } = useQuery({
    queryKey: savedViewKeys.all,
    queryFn: async () => {
      const res = await fetch("/api/employers/saved-views");
      if (!res.ok) throw new Error("Failed to fetch saved views");
      return res.json() as Promise<{ views: SavedView[] }>;
    },
    staleTime: 60 * 1000,
  });

  const create = useMutation({
    mutationFn: async (body: { name: string; query: string }) => {
      const res = await csrfFetch("/api/employers/saved-views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create view");
      }
      return res.json() as Promise<SavedView>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: savedViewKeys.all });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await csrfFetch(`/api/employers/saved-views?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to delete view");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: savedViewKeys.all });
    },
  });

  return {
    views: data.views,
    isLoading,
    create,
    remove,
  };
}
