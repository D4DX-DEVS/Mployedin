"use client";

import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PosterType, PosterFormat, DesignStyle, ShowFields, PosterTemplate, PosterVariation } from "@/lib/composer/types";

export interface PosterGenerateInput {
  type: PosterType;
  formats: PosterFormat[];
  description: string;
  style: DesignStyle;
  template: PosterTemplate;
  jobId: string;
  showFields: ShowFields;
}

interface GenerateResponse {
  id: string;
  variations: PosterVariation[];
  creditsUsed: number;
  creditsRemaining: number;
  shareSlug: string;
}

interface MoreVariationsResponse {
  id: string;
  variations: PosterVariation[];
  creditsUsed: number;
  creditsRemaining: number;
}

async function generatePosters(input: PosterGenerateInput): Promise<GenerateResponse> {
  const res = await fetch("/api/ai/poster-generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to generate posters");
  }

  return res.json();
}

async function generateMoreVariations(generationId: string): Promise<MoreVariationsResponse> {
  const res = await fetch("/api/ai/poster-more-variations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ generationId }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to generate more variations");
  }

  return res.json();
}

export function usePosterGenerate() {
  const queryClient = useQueryClient();
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [variations, setVariations] = useState<PosterVariation[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [shareSlug, setShareSlug] = useState<string | null>(null);

  const generateMutation = useMutation({
    mutationFn: generatePosters,
    onSuccess: (data) => {
      setGenerationId(data.id);
      setVariations(data.variations);
      setSelectedIndex(0);
      setShareSlug(data.shareSlug);
      queryClient.invalidateQueries({ queryKey: ["poster-credits"] });
    },
  });

  const moreMutation = useMutation({
    mutationFn: () => generateMoreVariations(generationId!),
    onSuccess: (data) => {
      setVariations(data.variations);
      queryClient.invalidateQueries({ queryKey: ["poster-credits"] });
    },
  });

  const generate = useCallback(
    (input: PosterGenerateInput) => generateMutation.mutate(input),
    [generateMutation],
  );

  const generateMore = useCallback(() => {
    if (generationId) moreMutation.mutate();
  }, [generationId, moreMutation]);

  // Load a previously saved generation into the editor (reuse from My Posters —
  // no new AI call, no credits).
  const hydrate = useCallback(
    (data: { id: string; variations: PosterVariation[]; selectedIndex?: number; shareSlug?: string | null }) => {
      setGenerationId(data.id);
      setVariations(data.variations);
      setSelectedIndex(Math.min(data.selectedIndex ?? 0, Math.max(0, data.variations.length - 1)));
      setShareSlug(data.shareSlug ?? null);
    },
    [],
  );

  return {
    generate,
    generateMore,
    hydrate,
    generationId,
    variations,
    selectedIndex,
    setSelectedIndex,
    shareSlug,
    isGenerating: generateMutation.isPending,
    isGeneratingMore: moreMutation.isPending,
    error: generateMutation.error?.message || moreMutation.error?.message || null,
    creditsRemaining: generateMutation.data?.creditsRemaining ?? null,
  };
}

