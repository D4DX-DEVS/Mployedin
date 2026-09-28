"use client";

/**
 * React Query hook for the admin Subscriptions report tab.
 * Fetches `/api/admin/subscription-dashboard?period=`.
 */

import { useQuery } from "@tanstack/react-query";
import type { PeriodPair } from "@/components/features/admin/reports/ReportCard";

export interface PlanMixRow {
  role: "employer" | "job_seeker";
  /** The plan name as stored — content, shown as is. */
  name: string;
  tier: number;
  active: number;
  paid: number;
  /** Monthly value in the report currency. */
  mrr: number;
  /** Share of total MRR, one decimal. */
  share: number;
}

export interface RenewalsDue {
  /** Same windows as /admin/subscriptions?expiring=7d|30d. */
  within7: number;
  within30: number;
  paidAutoRenew: number;
  /** Paid, auto-renew off: ends unless someone renews it. */
  paidManual: number;
  free: number;
  /** Monthly value of `paidManual`, in the report currency. */
  mrrAtRisk: number;
}

export interface CustomerConversion {
  accounts: number;
  verified: number;
  paid: number;
}

export interface SubscriptionDashboardData {
  period: { key: string; days: number };
  /** Currency of every money figure in the payload. */
  currency: string;
  /** Active subscriptions billed in any other currency: counted, never added into the money. */
  otherCurrencies: { currency: string; count: number; mrr: number }[];
  mrr: number;
  active: { total: number; paid: number; free: number };
  trends: { started: PeriodPair; lost: PeriodPair };
  plans: PlanMixRow[];
  renewals: RenewalsDue;
  /** Six months, oldest first. */
  activity: { month: string; started: number; lost: number }[];
  conversion: { employer: CustomerConversion; jobSeeker: CustomerConversion };
}

async function fetchDashboard(period: string): Promise<SubscriptionDashboardData> {
  const res = await fetch(`/api/admin/subscription-dashboard?period=${period}`);
  if (!res.ok) {
    throw new Error(`Dashboard API error: ${res.status}`);
  }
  return res.json();
}

export function useSubscriptionDashboard(period: string) {
  return useQuery({
    queryKey: ["admin", "subscription-dashboard", period],
    queryFn: () => fetchDashboard(period),
    staleTime: 30_000,
    // The previous period's figures stay on screen while the next one loads.
    placeholderData: (previous) => previous,
  });
}
