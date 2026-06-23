"use client";

/**
 * React Query hook for the current user's subscription.
 *
 * - useMySubscription()         — active subscription + usage
 * - useMySubscriptionHistory()  — user's own history
 * - useAvailablePlans(role)     — public list of plans for a role (pricing grid)
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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

export interface AvailablePlan {
  _id: string;
  name: string;
  slug: string;
  targetRole: "employer" | "job_seeker";
  tier: number;
  description?: string;
  price: number;
  currency: string;
  billingCycle: string;
  isDefault: boolean;
  sortOrder: number;
  employerLimits?: {
    maxActiveJobs: number;
    maxApplicationsViewPerMonth: number;
    maxTeamMembers: number;
    analyticsLevel: "none" | "basic" | "advanced";
    dataExport: boolean;
    commTemplates: boolean;
    scorecardEvaluations: boolean;
    matchingWeightCustomization: boolean;
    workflowCustomization: boolean;
    prioritySupport: boolean;
    featuredJobListings: number;
    brandedCompanyPage: boolean;
    aiFeatures: { feature: string; enabled: boolean; monthlyLimit: number }[];
  };
  jobSeekerLimits?: {
    maxApplicationsPerMonth: number;
    profileVisibilityBoost: boolean;
    salaryInsights: boolean;
    priorityApplicationReview: boolean;
    resumeBuilderAccess: boolean;
    aiFeatures: { feature: string; enabled: boolean; monthlyLimit: number }[];
  };
}

// ── Query Keys ───────────────────────────────────────────────────────────────

export const mySubscriptionKeys = {
  all: ["my-subscription"] as const,
  detail: () => [...mySubscriptionKeys.all, "detail"] as const,
  history: () => [...mySubscriptionKeys.all, "history"] as const,
  plans: (role: string) => ["subscription-plans", role] as const,
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

async function fetchAvailablePlans(role: "employer" | "job_seeker"): Promise<AvailablePlan[]> {
  const res = await fetch(`/api/subscriptions/plans?role=${role}`);
  if (!res.ok) throw new Error("Failed to load plans");
  const data = await res.json();
  return data.plans ?? [];
}

async function selfAssignFreePlan(): Promise<MySubscription> {
  const res = await fetch("/api/subscriptions/self-assign", { method: "POST" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to activate free plan");
  return data.subscription;
}

async function toggleAutoRenew(params: { subscriptionId: string; autoRenew: boolean }): Promise<MySubscription> {
  const res = await fetch(`/api/subscriptions/${params.subscriptionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ autoRenew: params.autoRenew }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to update auto-renew");
  return data.subscription;
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

/** Available plans for a role (used to render the pricing grid). */
export function useAvailablePlans(role: "employer" | "job_seeker") {
  return useQuery({
    queryKey: mySubscriptionKeys.plans(role),
    queryFn: () => fetchAvailablePlans(role),
    staleTime: 5 * 60 * 1000,
  });
}

/** Self-assign the default (Free) plan if the user has no subscription. */
export function useSelfAssignFreePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: selfAssignFreePlan,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: mySubscriptionKeys.all });
    },
  });
}

/** Toggle auto-renew on the user's active subscription. */
export function useToggleAutoRenew() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: toggleAutoRenew,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: mySubscriptionKeys.all });
    },
  });
}
