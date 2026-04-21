"use client";

/**
 * React Query hook for the current user's subscription.
 *
 * - useMySubscription() — active subscription + usage
 * - useMySubscriptionHistory() — user's own history
 */

import { useQuery } from "@tanstack/react-query";

// ── Types ────────────────────────────────────────────────────────────────────

export interface MySubscription {
  _id: string;
  userId: string;
  targetRole: "employer" | "job_seeker";
  planId: string;
  planSnapshot: {
    name: string;
    tier: number;
    price: number;
    currency: string;
    billingCycle: string;
    employerLimits?: Record<string, unknown>;
    jobSeekerLimits?: Record<string, unknown>;
  };
  status: "active" | "expired" | "cancelled" | "suspended";
  startDate: string;
  endDate: string;
  autoRenew: boolean;
  usage: {
    activeJobs?: number;
    applicationsViewed?: number;
    applicationsSubmitted?: number;
    aiUsage: Record<string, number>;
  };
  usageResetAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface MyHistoryItem {
  _id: string;
  subscriptionId: string;
  action: string;
  fromPlanName?: string;
  toPlanName?: string;
  performedByRole: string;
  reason?: string;
  createdAt: string;
}

// ── Query Keys ───────────────────────────────────────────────────────────────

export const mySubscriptionKeys = {
  all: ["my-subscription"] as const,
  detail: () => [...mySubscriptionKeys.all, "detail"] as const,
  history: () => [...mySubscriptionKeys.all, "history"] as const,
};

// ── Fetch ────────────────────────────────────────────────────────────────────

async function fetchMySubscription(): Promise<MySubscription | null> {
  const res = await fetch("/api/subscriptions/my");
  if (!res.ok) throw new Error("Failed to load subscription");
  const data = await res.json();
  return data.subscription ?? null;
}

async function fetchMyHistory(): Promise<MyHistoryItem[]> {
  const res = await fetch("/api/subscriptions/history");
  if (!res.ok) throw new Error("Failed to load history");
  const data = await res.json();
  return data.history ?? [];
}

// ── Hooks ────────────────────────────────────────────────────────────────────

/** Current user's active subscription. */
export function useMySubscription() {
  return useQuery({
    queryKey: mySubscriptionKeys.detail(),
    queryFn: fetchMySubscription,
    staleTime: 60 * 1000,
  });
}

/** Current user's subscription history. */
export function useMySubscriptionHistory() {
  return useQuery({
    queryKey: mySubscriptionKeys.history(),
    queryFn: fetchMyHistory,
    staleTime: 60 * 1000,
  });
}
