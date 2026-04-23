"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PosterDesign } from "@/app/api/ai/poster-content/route";

interface PosterAIInput {
  title: string;
  description?: string;
  companyName?: string;
  industry?: string;
  category?: string;
  location?: { country?: string; city?: string; isRemote?: boolean };
  salary?: {
    min?: number;
    max?: number;
    currency?: string;
    period?: string;
    isNegotiable?: boolean;
  };
  skills?: string[];
  benefits?: string[];
  experienceMin?: number;
  experienceMax?: number;
  workMode?: string;
  employmentType?: string;
  vacancies?: number;
}

const DEFAULT_DESIGN: PosterDesign = {
  template: "professional",
  tagline: "",
  highlights: [],
  cta: "Apply Now!",
  accentColor: "#6366F1",
  contentPriority: ["salary", "skills", "location"],
  socialCaption: "",
};

async function fetchPosterDesign(input: PosterAIInput): Promise<PosterDesign> {
  const res = await fetch("/api/ai/poster-content", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw new Error("Failed to generate poster design");
  }

  const data = await res.json();
  return data.design;
}

export function usePosterAI(jobId: string, input: PosterAIInput | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["poster-ai", jobId],
    queryFn: () => fetchPosterDesign(input!),
    enabled: !!input && !!input.title,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });

  const regenerate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["poster-ai", jobId] });
  }, [queryClient, jobId]);

  return {
    design: query.data ?? DEFAULT_DESIGN,
    isLoading: query.isLoading,
    error: query.error,
    regenerate,
    isReady: query.isSuccess,
  };
}
