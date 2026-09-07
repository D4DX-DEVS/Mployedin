"use client";

/**
 * Admin Subscription Dashboard — Enterprise SaaS Analytics
 *
 * Redesigned layout: Hero → KPIs → Alerts → Revenue Health →
 * Revenue Trend + Plan Performance → Conversion Funnel + Plan Distribution →
 * Top Customers + Top Agents → Renewal Forecast + Activity → Invoice Health + Revenue by Country.
 */

import { AlertTriangle, TrendingUp, DollarSign, Users, Zap } from "lucide-react";
import { ReportTabs } from "@/components/features/admin/ReportTabs";
import { useTranslations } from "next-intl";
import { exportCSV } from "@/lib/export";
import { ErrorState } from "@/components/shared/ErrorState";
import type { SubscriptionDashboardData } from "@/components/features/subscription-dashboard/useSubscriptionDashboard";
import { useSubscriptionDashboard } from "@/components/features/subscription-dashboard/useSubscriptionDashboard";
import { SubscriptionHero } from "@/components/features/subscription-dashboard/SubscriptionHero";
import type { DashboardHeaderMetric } from "@/components/shared/DashboardPageHeader";
import { formatCount } from "@/lib/ui/intlFormat";
import { RevenueTrendChart } from "@/components/features/subscription-dashboard/RevenueTrendChart";
import { SubscriptionFunnel } from "@/components/features/subscription-dashboard/SubscriptionFunnel";
import { PlanDistributionChart } from "@/components/features/subscription-dashboard/PlanDistributionChart";
import { TopCustomersTable } from "@/components/features/subscription-dashboard/TopCustomersTable";
import { TopSellingAgentsTable } from "@/components/features/subscription-dashboard/TopSellingAgentsTable";
import { RenewalForecast } from "@/components/features/subscription-dashboard/RenewalForecast";
import { RecentActivityFeed } from "@/components/features/subscription-dashboard/RecentActivityFeed";
import { InvoiceHealthCards } from "@/components/features/subscription-dashboard/InvoiceHealthCards";
import { RevenueByCountry } from "@/components/features/subscription-dashboard/RevenueByCountry";
import { RevenueHealthCards } from "@/components/features/subscription-dashboard/RevenueHealthCards";
import { AlertsCenter } from "@/components/features/subscription-dashboard/AlertsCenter";
import { PlanPerformanceTable } from "@/components/features/subscription-dashboard/PlanPerformanceTable";
import { ConversionFunnelChart } from "@/components/features/subscription-dashboard/ConversionFunnelChart";

// ── Export ───────────────────────────────────────────────────────────────────

// ponytail: flat metric summary only. Per-row tables (customers, agents, invoices)
// already export from their own pages — add sheets here only if asked.
function buildExportRows(data: SubscriptionDashboardData): { metric: string; value: string }[] {
  const groups: [string, object][] = [
    ["Overview", data.overview],
    ["Revenue Health", data.revenueHealth],
    ["Invoices", data.invoiceHealth],
    ["Alerts", data.alerts],
    ["Conversion Funnel", data.conversionFunnel],
  ];

  return groups.flatMap(([group, metrics]) =>
    Object.entries(metrics).map(([key, value]) => ({
      metric: `${group} — ${key}`,
      value: String(value),
    })),
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function AdminSubscriptionDashboardPage() {
  const t = useTranslations("adminSubscriptionDashboard");
  const { data, isLoading, isFetching, error, refetch } = useSubscriptionDashboard();

  /* ── Loading skeleton ── */
  if (isLoading) {
    return (
      <div className="page-container">
      <ReportTabs />
        <div className="h-32 animate-pulse rounded-3xl bg-background/70" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-background/70" />
          ))}
        </div>
        <div className="h-20 animate-pulse rounded-2xl bg-background/70" />
        <div className="h-64 animate-pulse rounded-2xl bg-background/70" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="h-56 animate-pulse rounded-2xl bg-background/70" />
          <div className="h-56 animate-pulse rounded-2xl bg-background/70" />
        </div>
      </div>
    );
  }

  /* ── Error state ── */
  if (error || !data) {
    return (
      <div className="page-container">
        <SubscriptionHero />
        <ErrorState title={t("failedToLoadDashboardData")} onRetry={() => refetch()} />
      </div>
    );
  }

  /* ── Build header metrics from KPI data ── */
  const headerMetrics: readonly DashboardHeaderMetric[] = [
    { label: t("mrrLabel"), value: `AED ${formatCount(data.overview.mrr)}`, icon: DollarSign, iconSurfaceClassName: "bg-indigo-50", iconClassName: "text-indigo-600" },
    { label: t("activeSubscriptionsLabel"), value: formatCount(data.overview.active), icon: Users, iconSurfaceClassName: "bg-emerald-50", iconClassName: "text-emerald-600" },
    { label: t("monthlyGrowthLabel"), value: `${data.kpiComparisons.mrrChange >= 0 ? "+" : ""}${data.kpiComparisons.mrrChange}%`, icon: TrendingUp, iconSurfaceClassName: "bg-blue-50", iconClassName: "text-blue-600" },
    { label: t("churnRateLabel"), value: `${data.overview.churnRate}%`, icon: Zap, iconSurfaceClassName: "bg-amber-50", iconClassName: "text-amber-600" },
  ];

  return (
    <div className="page-container">
      {/* ── Hero with Quick Actions ── */}
      <SubscriptionHero
        metrics={headerMetrics}
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
        onExport={() =>
          exportCSV(
            buildExportRows(data),
            [
              { header: t("exportHeaderMetric"), key: "metric" },
              { header: t("exportHeaderValue"), key: "value" },
            ],
            "subscription-dashboard.csv",
          )
        }
      />

      {/* ── Alerts Center (shown only if there are alerts) ── */}
      <AlertsCenter data={data.alerts} />

      {/* ── Revenue Trend + Plan Performance (side by side on large) ── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <RevenueTrendChart data={data.revenueTrend} />
        </div>
        <PlanPerformanceTable data={data.planPerformance} />
      </div>

      {/* ── Revenue Health Metrics ── */}
      <RevenueHealthCards data={data.revenueHealth} />

      {/* ── Conversion Funnel + Plan Distribution ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ConversionFunnelChart data={data.conversionFunnel} />
        <PlanDistributionChart
          data={data.planDistribution}
          totalMrr={data.overview.mrr}
        />
      </div>

      {/* ── Plan Split (Employer/Jobseeker) + Top Customers ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SubscriptionFunnel
          employer={data.subscriptionFunnel.employer}
          jobSeeker={data.subscriptionFunnel.jobSeeker}
        />
        <TopCustomersTable data={data.topCustomers} />
      </div>

      {/* ── Renewal Forecast + Recent Activity ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RenewalForecast data={data.renewalForecast} />
        <RecentActivityFeed data={data.recentActivity} />
      </div>

      {/* ── Bottom Row: Invoices + Revenue by Country + Top Agents (3 columns) ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <InvoiceHealthCards data={data.invoiceHealth} />
        <RevenueByCountry data={data.revenueByCountry} />
        <TopSellingAgentsTable data={data.topAgents} />
      </div>
    </div>
  );
}
