"use client";

import { useQuery } from "@tanstack/react-query";

interface PosterCreditsData {
  used: number;
  limit: number;
  remaining: number;
  resetDate: string;
  plan: string;
}

async function fetchCredits(): Promise<PosterCreditsData> {
  const res = await fetch("/api/employers/poster-credits");
  if (!res.ok) throw new Error("Failed to fetch credits");
  return res.json();
}

export function usePosterCredits() {
  const query = useQuery({
    queryKey: ["poster-credits"],
    queryFn: fetchCredits,
    staleTime: 30 * 1000, // 30 seconds
    retry: 1,
  });

  return {
    credits: query.data,
    isLoading: query.isLoading,
    error: query.error,
  };
}
