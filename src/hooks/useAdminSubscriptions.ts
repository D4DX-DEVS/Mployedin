"use client";

/**
 * React Query hook for the admin subscriptions list (paginated, filterable).
 */

import { useQuery, keepPreviousData } from "@tanstack/react-query";

// ── Types ────────────────────────────────────────────────────────────────────

export interface AdminSubscriptionUser {
  _id: string;
  name: string;
  email: string;
  role: string;
  profileImage?: string;
}

export interface AdminSubscriptionItem {
  _id: string;
  userId: AdminSubscriptionUser | null;
  targetRole: "employer" | "job_seeker";
  planId: string;
  planSnapshot: {
    name: string;
    tier: number;
    price: number;
    currency: string;
    billingCycle: string;
  };
  status: "active" | "expired" | "cancelled" | "suspended";
  startDate: string;
  endDate: string;
  autoRenew: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminSubscriptionsFilters {
  page?: number;
  limit?: number;
  status?: string;
  role?: string;
  planId?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  autoRenew?: string;
  dateFrom?: string;
  dateTo?: string;
}

interface AdminSubscriptionsResponse {
  subscriptions: AdminSubscriptionItem[];
  total: number;
  page: number;
  totalPages: number;
}

// ── Query Keys ───────────────────────────────────────────────────────────────

export const adminSubscriptionKeys = {
  all: ["admin-subscriptions"] as const,
  list: (filters: AdminSubscriptionsFilters) =>
    [...adminSubscriptionKeys.all, filters] as const,
};

// ── Fetch ────────────────────────────────────────────────────────────────────

async function fetchAdminSubscriptions(
  filters: AdminSubscriptionsFilters,
): Promise<AdminSubscriptionsResponse> {
  const params = new URLSearchParams();
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.status) params.set("status", filters.status);
  if (filters.role) params.set("role", filters.role);
  if (filters.planId) params.set("planId", filters.planId);
  if (filters.search) params.set("search", filters.search);
  if (filters.sortBy) params.set("sortBy", filters.sortBy);
  if (filters.sortOrder) params.set("sortOrder", filters.sortOrder);
  if (filters.autoRenew) params.set("autoRenew", filters.autoRenew);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);

  const res = await fetch(`/api/admin/subscriptions?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to load subscriptions");
  return res.json();
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useAdminSubscriptions(filters: AdminSubscriptionsFilters) {
  return useQuery({
    queryKey: adminSubscriptionKeys.list(filters),
    queryFn: () => fetchAdminSubscriptions(filters),
    staleTime: 30 * 1000,
    placeholderData: keepPreviousData,
  });
}
