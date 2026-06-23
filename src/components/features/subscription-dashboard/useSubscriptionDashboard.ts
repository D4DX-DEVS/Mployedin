"use client";

/**
 * React Query hook for the Subscription Dashboard.
 * Fetches from the REST endpoint /api/admin/subscription-dashboard.
 */

import { useQuery } from "@tanstack/react-query";

// ── Fetch ────────────────────────────────────────────────────────────────────

async function fetchDashboard(): Promise<SubscriptionDashboardData> {
  const res = await fetch("/api/admin/subscription-dashboard");
  if (!res.ok) {
    throw new Error(`Dashboard API error: ${res.status}`);
  }
  return res.json();
}

export interface DashboardOverview {
  total: number;
  active: number;
  expired: number;
  cancelled: number;
  suspended: number;
  mrr: number;
  arr: number;
  churnRate: number;
  expiringSoon: number;
  cancelledThisMonth: number;
  employerActive: number;
  jobSeekerActive: number;
  paidActiveCount: number;
}

export interface KpiComparisons {
  totalPrev: number;
  activePrev: number;
  mrrPrev: number;
  churnPrev: number;
  cancelledPrev: number;
  totalChange: number;
  activeChange: number;
  mrrChange: number;
  churnChange: number;
  cancelledChange: number;
}

export interface RevenueTrendPoint {
  month: string;
  year: number;
  monthNum: number;
  mrr: number;
  newSubs: number;
  employerMrr: number;
  jobSeekerMrr: number;
}

export interface FunnelStage {
  name: string;
  count: number;
  percentage: number;
}

export interface PlanDistributionItem {
  planName: string;
  tier: number;
  revenue: number;
  percentage: number;
  count: number;
}

export interface TopCustomer {
  userId: string;
  name: string;
  email: string;
  planName: string;
  tier: number;
  mrr: number;
  since: string;
}

export interface TopAgent {
  agentId: string;
  name: string;
  subscriptionsSold: number;
  revenue: number;
}

export interface RenewalBucket {
  count: number;
  revenue: number;
}

export interface RenewalForecast {
  totalRenewing: number;
  expectedRevenue: number;
  within7: RenewalBucket;
  within15: RenewalBucket;
  within30: RenewalBucket;
}

export interface ActivityItem {
  id: string;
  userName: string;
  userEmail: string;
  action: string;
  toPlanName: string | null;
  fromPlanName: string | null;
  performedByName: string | null;
  reason: string | null;
  createdAt: string;
}

export interface InvoiceHealth {
  paidCount: number;
  pendingCount: number;
  overdueCount: number;
  collectedRevenue: number;
}

export interface CountryRevenue {
  country: string;
  revenue: number;
  subscriptions: number;
  percentage: number;
}

export interface RevenueHealth {
  arpu: number;
  ltv: number;
  newRevenue: number;
  expansionRevenue: number;
  churnedRevenue: number;
  netRevenue: number;
}

export interface PlanPerformanceItem {
  planName: string;
  tier: number;
  activeUsers: number;
  revenue: number;
  churn: number;
  growth: number;
  newThisMonth: number;
  cancelledThisMonth: number;
}

export interface Alerts {
  failedPayments: number;
  expiringSoon: number;
  highRiskAccounts: number;
  disputes: number;
  total: number;
}

export interface ConversionFunnel {
  totalUsers: number;
  verified: number;
  onboarded: number;
  trial: number;
  paid: number;
  renewed: number;
}

export interface SubscriptionDashboardData {
  overview: DashboardOverview;
  kpiComparisons: KpiComparisons;
  revenueTrend: RevenueTrendPoint[];
  subscriptionFunnel: {
    employer: FunnelStage[];
    jobSeeker: FunnelStage[];
  };
  planDistribution: PlanDistributionItem[];
  topCustomers: TopCustomer[];
  topAgents: TopAgent[];
  renewalForecast: RenewalForecast;
  recentActivity: ActivityItem[];
  invoiceHealth: InvoiceHealth;
  revenueByCountry: CountryRevenue[];
  revenueHealth: RevenueHealth;
  planPerformance: PlanPerformanceItem[];
  alerts: Alerts;
  conversionFunnel: ConversionFunnel;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useSubscriptionDashboard() {
  return useQuery({
    queryKey: ["admin", "subscription-dashboard"],
    queryFn: fetchDashboard,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
