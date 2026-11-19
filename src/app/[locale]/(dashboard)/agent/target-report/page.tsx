"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Target } from "lucide-react";
import { useState } from "react";
import { AgentSectionTabs, AGENT_PERFORMANCE_TABS } from "@/components/features/agent/AgentSectionTabs";
import { TargetYearSelect, defaultTargetYears } from "@/components/features/targets/TargetYearSelect";
import { ErrorState } from "@/components/shared/ErrorState";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import type { OwnerKpi } from "@/lib/targets/kpiCalculator";
import { achievement } from "@/lib/targets/achievement";
import { formatCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/ui/intlFormat";
import { MyEmployersCard } from "./_components/MyEmployersCard";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface KpiTargetReportResponse {
  year: number;
  profile: {
    targetType: string;
    kpis: OwnerKpi;
    jobTarget?: number;
    conversionTarget?: number;
    revenueTarget?: number;
    setByRole?: string;
    overriddenByAdmin: boolean;
    currency: string;
    periods: Array<{
      startDate: string;
      endDate: string;
      jobTarget?: number;
      conversionTarget?: number;
      revenueTarget?: number;
    }>;
  } | null;
}

interface KpiCardProps {
  label: string;
  actual: number;
  target?: number;
  currency?: string;
  isMonetary?: boolean;
}

function KpiCard({ label, actual, target, currency, isMonetary }: KpiCardProps) {
  const achievementPercent = target ? achievement(actual, target) : null;
  const displayValue = isMonetary && currency ? formatCurrency(actual, currency, "code") : String(actual);

  return (
    <div className="rounded-2xl border border-border/70 bg-card/90 p-4 sm:p-5">
      <p className="text-xs sm:text-sm font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl sm:text-3xl font-bold text-foreground">{displayValue}</p>
      {target ? (
        <>
          <div className="mt-3 h-1.5 rounded-full bg-muted/50 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary/60 transition-all"
              style={{ width: `${Math.min(achievementPercent ?? 0, 100)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {achievementPercent ?? 0}% of {isMonetary && currency ? formatCurrency(target, currency, "code") : target}
          </p>
        </>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">No target set</p>
      )}
    </div>
  );
}

export default function AgentTargetReportPage() {
  const t = useTranslations("profitTargets");
  const tc = useTranslations("common");
  const locale = useLocale();
  const currentYear = String(new Date().getFullYear());
  const years = defaultTargetYears();
  const [year, setYear] = useUrlFilter("year", currentYear, { allow: years });
  const [viewMode, setViewMode] = useState<"month" | "year">("year");

  const { data, isLoading, isError, refetch } = useQuery<KpiTargetReportResponse>({
    queryKey: ["agent", "target-report", year],
    queryFn: async () => {
      const response = await fetch(`/api/agent/target-report?year=${year}`);
      if (!response.ok) throw new Error(`Target report error: ${response.status}`);
      return response.json();
    },
    staleTime: 5 * 60_000,
    placeholderData: (previous) => previous,
  });

  const profile = data?.profile;
  const kpis = profile?.kpis;

  return (
    <div className="page-container print:space-y-4">
      <div className="print:hidden">
        <AgentSectionTabs tabs={AGENT_PERFORMANCE_TABS} ariaLabelKey="performanceTabsLabel" />
      </div>
      <WorkspaceHeader
        title={t("kpi3ReportTitle")}
        context={t("kpi3ReportContext", { year })}
        actions={<div className="max-sm:[&_button]:w-24"><TargetYearSelect value={year} onChange={setYear} label={t("yearLabel")} years={years} /></div>}
      />

      {isError && !data ? (
        <ErrorState title={t("failedToLoadReport")} onRetry={() => { void refetch(); }} retryLabel={t("retry")} />
      ) : isLoading || !data ? (
        <div className="space-y-4" role="status" aria-live="polite" aria-label={t("loading")}>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-28 animate-pulse rounded-2xl bg-muted/50" />
            ))}
          </div>
          <div className="h-72 animate-pulse rounded-2xl bg-muted/50" />
        </div>
      ) : !profile ? (
        <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
          <Target className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <h2 className="heading-section font-semibold">{t("reportEmptyTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("reportEmptyDescription")}</p>
        </div>
      ) : kpis ? (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label={t("kpiJobsAcquired")}
              actual={kpis.totals.jobs}
              target={profile.jobTarget}
            />
            <KpiCard
              label={t("kpiOnboarded")}
              actual={kpis.totals.onboarded}
              target={profile.conversionTarget}
            />
            <KpiCard
              label={t("kpiInvoicedRevenue")}
              actual={kpis.totals.revenue}
              target={profile.revenueTarget}
              currency={profile.currency}
              isMonetary
            />
            <div className="rounded-2xl border border-border/70 bg-card/90 p-4 sm:p-5">
              <p className="text-xs sm:text-sm font-semibold uppercase tracking-widest text-muted-foreground">{t("kpiMyCommission")}</p>
              <p className="mt-2 text-2xl sm:text-3xl font-bold text-foreground">
                {formatCurrency(kpis.commission.approved + kpis.commission.paid, profile.currency, "code")}
              </p>
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Approved</span>
                  <span className="font-semibold">{formatCurrency(kpis.commission.approved, profile.currency, "code")}</span>
                </div>
                <div className="flex justify-between">
                  <span>Paid</span>
                  <span className="font-semibold">{formatCurrency(kpis.commission.paid, profile.currency, "code")}</span>
                </div>
              </div>
            </div>
          </div>

          {/* View Mode Toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode("year")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                viewMode === "year"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80 text-foreground"
              }`}
            >
              {t("yearLabel")}
            </button>
            <button
              onClick={() => setViewMode("month")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                viewMode === "month"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80 text-foreground"
              }`}
            >
              {tc("month")}
            </button>
          </div>

          {/* Monthly Breakdown Table */}
          {viewMode === "month" && (
            <div className="rounded-2xl border border-border/60 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead>{t("kpiTableMonth")}</TableHead>
                    <TableHead className="text-right">{t("kpiJobsAcquired")}</TableHead>
                    <TableHead className="text-right">{t("kpiOnboarded")}</TableHead>
                    <TableHead className="text-right">{t("kpiInvoicedRevenue")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {kpis.months.map((month) => (
                    <TableRow key={month.month} className="bg-transparent hover:bg-muted/5">
                      <TableCell className="font-medium">
                        {formatDate(new Date(Date.UTC(parseInt(year), month.month - 1, 15)), { month: "short", timeZone: "UTC" }, locale)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{month.jobs}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{month.onboarded}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatCurrency(month.revenue, profile.currency, "code")}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/20 font-semibold">
                    <TableCell>{t("kpiTableTotal")}</TableCell>
                    <TableCell className="text-right">{kpis.totals.jobs}</TableCell>
                    <TableCell className="text-right">{kpis.totals.onboarded}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(kpis.totals.revenue, profile.currency, "code")}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}

          {/* Yearly Summary with Periods */}
          {viewMode === "year" && (
            <div className="rounded-2xl border border-border/60 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead>{t("kpiTableMonth")}</TableHead>
                    <TableHead className="text-right">{t("kpiJobsAcquired")}</TableHead>
                    <TableHead className="text-right">{t("kpiOnboarded")}</TableHead>
                    <TableHead className="text-right">{t("kpiInvoicedRevenue")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {kpis.periods.map((period, idx) => (
                    <TableRow key={idx} className="bg-transparent hover:bg-muted/5">
                      <TableCell className="font-medium">
                        {formatDate(period.startDate, undefined, locale)} – {formatDate(period.endDate, undefined, locale)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{period.jobs}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{period.onboarded}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatCurrency(period.revenue, profile.currency, "code")}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/20 font-semibold">
                    <TableCell>{t("kpiTableTotal")}</TableCell>
                    <TableCell className="text-right">{kpis.totals.jobs}</TableCell>
                    <TableCell className="text-right">{kpis.totals.onboarded}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(kpis.totals.revenue, profile.currency, "code")}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}

          {/* Target Info */}
          <div className="rounded-2xl border border-border/70 bg-card/50 p-4 sm:p-5 text-sm text-muted-foreground">
            <p>
              {profile.setByRole === "admin"
                ? t("kpiSetByAdmin")
                : profile.setByRole === "super_agent"
                  ? t("kpiSetBySuperAgent")
                  : null}
              {profile.overriddenByAdmin && ` · ${t("overriddenByAdmin")}`}
            </p>
          </div>
        </div>
      ) : null}

      <MyEmployersCard year={year} />
    </div>
  );
}
