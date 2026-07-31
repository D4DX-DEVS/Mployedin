"use client";

/**
 * Admin Subscription Dashboard — Enterprise SaaS Analytics
 *
 * Redesigned layout: Hero → KPIs → Alerts → Revenue Health →
 * Revenue Trend + Plan Performance → Conversion Funnel + Plan Distribution →
 * Top Customers + Top Agents → Renewal Forecast + Activity → Invoice Health + Revenue by Country.
 */

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { exportCSV } from "@/lib/export";
import type { SubscriptionDashboardData } from "@/components/features/subscription-dashboard/useSubscriptionDashboard";
import { useSubscriptionDashboard } from "@/components/features/subscription-dashboard/useSubscriptionDashboard";
import { SubscriptionHero } from "@/components/features/subscription-dashboard/SubscriptionHero";
import { KpiCardsRow } from "@/components/features/subscription-dashboard/KpiCardsRow";
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
      <div className="page-container space-y-5">
        <div className="h-32 animate-pulse rounded-[28px] bg-background/70" />
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
      <div className="page-container space-y-5">
        <SubscriptionHero />
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            {t("failedToLoadDashboardData")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container space-y-5">
      {/* ── Hero with Quick Actions ── */}
      <SubscriptionHero
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
        onExport={() =>
          exportCSV(
            buildExportRows(data),
            [
              { header: "Metric", key: "metric" },
              { header: "Value", key: "value" },
            ],
            "subscription-dashboard.csv",
          )
        }
      />

      {/* ── KPI Cards (4 main metrics) ── */}
      <KpiCardsRow overview={data.overview} comparisons={data.kpiComparisons} revenueTrend={data.revenueTrend} />

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
