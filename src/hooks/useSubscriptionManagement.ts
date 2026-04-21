"use client";

/**
 * React Query hooks for subscription management (admin operations).
 *
 * - useAssignSubscription()
 * - useChangeSubscription()
 * - useCancelSubscription()
 * - useRenewSubscription()
 * - useUserSubscription(userId)
 * - useSubscriptionHistory(userId)
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SubscriptionItem {
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
  assignedBy: string;
  assignedByRole: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface HistoryItem {
  _id: string;
  userId: string;
  subscriptionId: string;
  action: string;
  fromPlanName?: string;
  toPlanName?: string;
  performedByRole: string;
  reason?: string;
  createdAt: string;
}

interface AssignPayload {
  userId: string;
  planId: string;
  startDate?: string;
  endDate?: string;
  autoRenew?: boolean;
  notes?: string;
}

interface ChangePayload {
  userId: string;
  newPlanId: string;
  reason?: string;
}

interface CancelPayload {
  subscriptionId: string;
  reason?: string;
}

interface RenewPayload {
  subscriptionId: string;
  notes?: string;
}

// ── Query Keys ───────────────────────────────────────────────────────────────

export const subscriptionKeys = {
  all: ["subscriptions"] as const,
  user: (userId: string) => [...subscriptionKeys.all, "user", userId] as const,
  history: (userId: string) => [...subscriptionKeys.all, "history", userId] as const,
};

// ── Fetch Helpers ────────────────────────────────────────────────────────────

async function fetchUserSubscription(userId: string): Promise<SubscriptionItem | null> {
  const res = await fetch(`/api/subscriptions/${userId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to fetch subscription");
  const data = await res.json();
  return data.subscription;
}

async function fetchHistory(userId: string): Promise<HistoryItem[]> {
  const res = await fetch(`/api/subscriptions/history?userId=${encodeURIComponent(userId)}`);
  if (!res.ok) throw new Error("Failed to fetch history");
  const data = await res.json();
  return data.history;
}

// ── Hooks ────────────────────────────────────────────────────────────────────

/** Fetch a user's active subscription (admin view). */
export function useUserSubscription(userId: string | undefined) {
  return useQuery({
    queryKey: subscriptionKeys.user(userId ?? ""),
    queryFn: () => fetchUserSubscription(userId!),
    enabled: !!userId,
    staleTime: 30 * 1000,
  });
}

/** Fetch subscription history for a user. */
export function useSubscriptionHistory(userId: string | undefined) {
  return useQuery({
    queryKey: subscriptionKeys.history(userId ?? ""),
    queryFn: () => fetchHistory(userId!),
    enabled: !!userId,
    staleTime: 30 * 1000,
  });
}

/** Assign a subscription plan to a user. */
export function useAssignSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: AssignPayload) => {
      const res = await fetch("/api/subscriptions/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Assign failed" }));
        throw new Error(err.error ?? "Assign failed");
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: subscriptionKeys.user(vars.userId) });
      qc.invalidateQueries({ queryKey: subscriptionKeys.history(vars.userId) });
    },
  });
}

/** Upgrade or downgrade a user's subscription. */
export function useChangeSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ChangePayload) => {
      const res = await fetch("/api/subscriptions/change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Change failed" }));
        throw new Error(err.error ?? "Change failed");
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: subscriptionKeys.user(vars.userId) });
      qc.invalidateQueries({ queryKey: subscriptionKeys.history(vars.userId) });
    },
  });
}

/** Cancel a subscription. */
export function useCancelSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CancelPayload) => {
      const res = await fetch(`/api/subscriptions/${payload.subscriptionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: payload.reason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Cancel failed" }));
        throw new Error(err.error ?? "Cancel failed");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: subscriptionKeys.all });
    },
  });
}

/** Renew an expired subscription. */
export function useRenewSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: RenewPayload) => {
      const res = await fetch("/api/subscriptions/renew", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Renew failed" }));
        throw new Error(err.error ?? "Renew failed");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: subscriptionKeys.all });
    },
  });
}

// ── Bulk Assign ──────────────────────────────────────────────────────────────

interface BulkAssignPayload {
  userIds: string[];
  planId: string;
  autoRenew?: boolean;
  notes?: string;
}

export interface BulkAssignResult {
  assigned: number;
  total: number;
  results: Array<{ userId: string; status: "assigned" | "skipped" | "error"; reason?: string }>;
}

/** Bulk-assign a subscription plan to multiple users. */
export function useBulkAssignSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: BulkAssignPayload): Promise<BulkAssignResult> => {
      const res = await fetch("/api/subscriptions/bulk-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Bulk assign failed" }));
        throw new Error(err.error ?? "Bulk assign failed");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: subscriptionKeys.all });
    },
  });
}
