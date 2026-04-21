"use client";

/**
 * Client-side feature gating hook.
 *
 * Fetches the user's full feature gate map from the server and provides
 * a simple `allowed` / `remaining` interface per feature.
 *
 * Usage:
 *   const { allowed, remaining, isLoading } = useFeatureGate("ai_cv_extraction");
 *   if (!allowed) return <UpgradePrompt />;
 */

import { useQuery } from "@tanstack/react-query";

// ── Types ────────────────────────────────────────────────────────────────────

interface FeatureGateEntry {
  allowed: boolean;
  limit?: number;
  used?: number;
  remaining?: number;
}

interface FeatureGateResponse {
  features: Record<string, FeatureGateEntry>;
  bypass: boolean;
}

// ── Query Key ────────────────────────────────────────────────────────────────

export const featureGateKeys = {
  all: ["feature-gate"] as const,
};

// ── Fetch ────────────────────────────────────────────────────────────────────

async function fetchFeatureGateMap(): Promise<FeatureGateResponse> {
  const res = await fetch("/api/subscriptions/feature-gate");
  if (!res.ok) throw new Error("Failed to load feature gates");
  return res.json();
}

// ── Hook: Full map ───────────────────────────────────────────────────────────

/**
 * Fetch the full feature gate map. Typically used once at the layout level,
 * then individual components use `useFeatureGate(feature)`.
 */
export function useFeatureGateMap() {
  return useQuery({
    queryKey: featureGateKeys.all,
    queryFn: fetchFeatureGateMap,
    staleTime: 2 * 60 * 1000,
  });
}

// ── Hook: Single feature ─────────────────────────────────────────────────────

/**
 * Check if a single feature is allowed for the current user.
 *
 * Returns `{ allowed, limit, used, remaining, isLoading }`.
 * If the user is admin/agent (bypass), everything is allowed.
 */
export function useFeatureGate(feature: string) {
  const { data, isLoading } = useFeatureGateMap();

  if (isLoading) {
    return { allowed: false, isLoading: true, limit: undefined, used: undefined, remaining: undefined };
  }

  // Admin/agent bypass
  if (data?.bypass) {
    return { allowed: true, isLoading: false, limit: undefined, used: undefined, remaining: undefined };
  }

  const entry = data?.features?.[feature];

  return {
    allowed: entry?.allowed ?? false,
    isLoading: false,
    limit: entry?.limit,
    used: entry?.used,
    remaining: entry?.remaining,
  };
}
