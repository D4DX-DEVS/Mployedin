"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, ArrowRight, Briefcase, FileText, Filter, TrendingUp, UserCheck, Wallet } from "lucide-react";
import { ReportTabs } from "@/components/features/admin/ReportTabs";
import { PageHero } from "@/components/shared/PageHero";
import { ErrorState } from "@/components/shared/ErrorState";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { PLATFORM_ALERT_ACTIONS } from "@/lib/admin/platformAlerts";
import { DASHBOARD_PERIODS, DEFAULT_DASHBOARD_PERIOD } from "@/lib/admin/dashboard/period";
import { formatCount } from "@/lib/ui/intlFormat";
import {
  ChangeBadge, ReportCardHeader, ReportEmpty, reportCardClassName, reportLinkClassName, type PeriodPair,
} from "@/components/features/admin/reports/ReportCard";
import { ReportKpiGrid, type ReportKpi } from "@/components/features/admin/reports/ReportKpiGrid";
import { TrendLineChart } from "@/components/features/admin/reports/TrendLineChart";
import { AttentionList, type AlertItem } from "./_components/attention-list";

/*
 * Platform report: four totals, then two rows of two cards —
 *   Hiring activity (trend)      | Attention needed (what to act on)
 *   Hiring conversion (funnel)   | Application status (where things are now)
 * The per-row lists (top agents, recent jobs, recent applications) are gone:
 * each already has its own page, and a report summarises rather than repeats.
 */

interface ActivityPoint {
  /** ISO year-month, e.g. "2026-04". */
  month: string;
  jobs: number;
  applications: number;
}

const ACTIVITY_SERIES = [
  { key: "jobs", color: "#3b82f6" },
  { key: "applications", color: "#8b5cf6" },
];

interface StatusPoint {
  /** The application status itself, e.g. "interview_scheduled". */
  key: string;
  count: number;
  percent: number;
}

interface RevenueSummary {
  /** Null when nothing has been collected yet. */
  currency: string | null;
  total: number;
  /** Other currencies, listed but never added into `total`. */
  others: { currency: string; total: number }[];
}

interface ReportStats {
  period: { key: string; days: number };
  totalJobs: number;
  totalApplications: number;
  totalPlacements: number;
  revenue: RevenueSummary;
  trends: { jobs: PeriodPair; applications: PeriodPair; placements: PeriodPair; revenue: PeriodPair };
  activitySeries: ActivityPoint[];
  applicationsByStatus: StatusPoint[];
  conversion: { applications: number; reachedInterview: number; reachedOffer: number; hired: number };
  jobHealth: { active: number; withoutApplications: number };
  alerts: AlertItem[];
}

/* Status names are the admin dashboard's own, so this page says "Applied"
   where the dashboard pipeline does. Spelled out per status so every key stays
   statically greppable; a status the map doesn't know reads "Unknown". */
const STATUS_LABEL_KEYS: Record<string, string> = {
  applied: "statuses.applied",
  shortlisted: "statuses.shortlisted",
  interview_scheduled: "statuses.interviewScheduled",
  selected: "statuses.selected",
  offer: "statuses.offer",
  hired: "statuses.hired",
  rejected: "statuses.rejected",
  withdrawn: "statuses.withdrawn",
};

/* One hue for every stage, as in the dashboard pipeline: the label names the
   stage, so colour only marks the two outcomes. Eight categorical colours used
   to repeat (Applied and Offer both blue, Selected and Hired both green). */
const STATUS_BARS: Record<string, string> = {
  hired: "bg-emerald-500",
  rejected: "bg-primary/60",
  withdrawn: "bg-primary/35",
};

/** Share of `whole`, whole-number percent; null when there is nothing to divide by. */
function shareOf(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

export default function AdminReportsPage() {
  const locale = useLocale();
  const t = useTranslations("adminReports");
  const tDashboard = useTranslations("adminDashboard");
  const statusLabel = (status: string) => tDashboard(STATUS_LABEL_KEYS[status] ?? "statuses.unknown");
  // The reporting window lives in the URL, as on the dashboard, so a refresh or
  // a shared link shows the same numbers.
  const [period, setPeriod] = useUrlFilter("period", DEFAULT_DASHBOARD_PERIOD, { allow: DASHBOARD_PERIODS });
  const [stats, setStats] = useState<ReportStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);

    fetch(`/api/admin/analytics?period=${period}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<ReportStats>;
      })
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setFailed(true);
        setLoading(false);
      });

    return () => controller.abort();
  }, [period, attempt]);

  const days = stats?.period.days ?? Number.parseInt(period, 10);
  const revenue = stats?.revenue ?? { currency: null, total: 0, others: [] };
  const alerts = stats?.alerts ?? [];
  const statusRows = stats?.applicationsByStatus ?? [];
  const maxStatusCount = Math.max(1, ...statusRows.map((row) => row.count));
  const activitySeries = stats?.activitySeries ?? [];
  const count = (value: number) => formatCount(value, undefined, locale);

  /* One currency per figure, formatted by Intl — the card used to print a
     hardcoded "$" over whatever currencies it had added together. */
  const formatRevenue = (amount: number, notation: "standard" | "compact" = "standard") => revenue.currency
    ? formatCount(amount, { style: "currency", currency: revenue.currency, notation, maximumFractionDigits: 0 }, locale)
    : formatCount(amount, { notation }, locale);

  const changeLabels = { new: t("trendNew"), none: t("trendNoChange") };
  /* The badge compares the selected period with the one before, so the line
     above it says what this period holds. */
  const changeFooter = (pair: PeriodPair, formatValue: (value: number) => string) => (
    <>
      <ChangeBadge pair={pair} formatValue={formatValue} labels={changeLabels} />
      <span className="text-xs text-muted-foreground">{t("vsPreviousPeriod", { days })}</span>
    </>
  );

  // Each card is an all-time total.
  const kpis: ReportKpi[] = stats ? [
    {
      key: "jobs",
      label: t("totalJobs"),
      value: count(stats.totalJobs),
      detail: t("kpiJobsDetail", { current: stats.trends.jobs.current, days }),
      footer: changeFooter(stats.trends.jobs, count),
      dot: "bg-blue-500",
      tone: "workspace-tone-sky",
      icon: Briefcase,
      href: `/${locale}/admin/jobs`,
    },
    {
      key: "applications",
      label: t("applications"),
      value: count(stats.totalApplications),
      detail: t("kpiApplicationsDetail", { current: stats.trends.applications.current, days }),
      footer: changeFooter(stats.trends.applications, count),
      dot: "bg-violet-500",
      tone: "workspace-tone-violet",
      icon: FileText,
      href: `/${locale}/admin/applications`,
    },
    {
      // Placement records, so the card opens the placements list.
      key: "placements",
      label: t("placements"),
      value: count(stats.totalPlacements),
      detail: t("kpiPlacementsDetail", { current: stats.trends.placements.current, days }),
      footer: changeFooter(stats.trends.placements, count),
      dot: stats.totalPlacements > 0 ? "bg-emerald-500" : "bg-yellow-500",
      tone: stats.totalPlacements > 0 ? "workspace-tone-emerald" : "workspace-tone-amber",
      icon: UserCheck,
      href: `/${locale}/admin/placements`,
    },
    {
      // Money collected on invoices — the dashboard's "Collected" source. It
      // used to be the sum of commissions paid out to agents.
      key: "revenue",
      label: t("revenue"),
      value: formatRevenue(revenue.total),
      // A full currency figure is wider than a quarter of a phone screen.
      phoneValue: formatRevenue(revenue.total, "compact"),
      detail: t("kpiRevenueDetail", { amount: formatRevenue(stats.trends.revenue.current), days }),
      footer: changeFooter(stats.trends.revenue, (value: number) => formatRevenue(value)),
      note: revenue.others.length > 0 ? t("revenueOtherCurrencies", { count: revenue.others.length }) : null,
      dot: revenue.total > 0 ? "bg-amber-500" : "bg-slate-400",
      tone: "workspace-tone-amber",
      icon: Wallet,
      href: `/${locale}/admin/invoices`,
    },
  ] : [];

  const conversion = stats?.conversion;
  const conversionStages = conversion ? [
    { key: "applications", label: t("stageApplications"), count: conversion.applications, share: null },
    { key: "interview", label: t("stageInterview"), count: conversion.reachedInterview, share: t("shareOfApplications", { share: shareOf(conversion.reachedInterview, conversion.applications) ?? 0 }) },
    { key: "offer", label: t("stageOffer"), count: conversion.reachedOffer, share: t("shareOfInterviews", { share: shareOf(conversion.reachedOffer, conversion.reachedInterview) ?? 0 }) },
    { key: "hired", label: t("stageHired"), count: conversion.hired, share: t("shareOfOffers", { share: shareOf(conversion.hired, conversion.reachedOffer) ?? 0 }) },
  ] : [];
  const jobHealth = stats?.jobHealth;

  return (
    <div className="page-container">
      <ReportTabs />
      <PageHero
        compact
        compactOnMobile
        title={t("reportsAndAnalytics")}
        description={t("platformDemandDescription")}
        actions={(
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger aria-label={tDashboard("toolbar.period")} className="h-10 w-[10.5rem] rounded-xl border-border/70 bg-background/90 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DASHBOARD_PERIODS.map((key) => (
                <SelectItem key={key} value={key}>{tDashboard(`toolbar.periods.${key}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />

      {failed ? (
        <ErrorState title={t("unableToLoadReports")} description={t("failedToLoadReports")} onRetry={retry} />
      ) : loading && !stats ? (
        <div className="space-y-6" role="status" aria-live="polite" aria-label={t("loadingReports")}>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="workspace-panel-surface h-16 animate-pulse rounded-2xl sm:h-36" />
            ))}
          </div>
          <div className="grid gap-6 xl:grid-cols-12">
            <div className="workspace-panel-surface h-80 animate-pulse rounded-3xl xl:col-span-7" />
            <div className="workspace-panel-surface h-80 animate-pulse rounded-3xl xl:col-span-5" />
          </div>
        </div>
      ) : stats ? (
        <div className={`space-y-6 transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          <ReportKpiGrid kpis={kpis} ariaLabel={t("a11yTotals")} />

          <div className="grid gap-6 xl:grid-cols-12">
            <section className={`${reportCardClassName} xl:col-span-7`} aria-label={t("hiringActivity")}>
              <ReportCardHeader title={t("hiringActivity")} description={t("hiringActivityDescription")} icon={TrendingUp} tone="workspace-tone-sky" />

              <div className="mt-4 flex items-center gap-4 text-xs font-medium text-muted-foreground">
                <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> {t("jobs")}</span>
                <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-violet-500" /> {t("applicationsChartLabel")}</span>
              </div>

              {activitySeries.some((point) => point.jobs > 0 || point.applications > 0) ? (
                <div className="mt-4 flex flex-1 items-center rounded-2xl border border-border/70 bg-secondary/30 p-3">
                  <TrendLineChart
                    series={ACTIVITY_SERIES}
                    points={activitySeries.map((point) => ({ month: point.month, values: { jobs: point.jobs, applications: point.applications } }))}
                    locale={locale}
                    ariaLabel={t("hiringDemandChartAria")}
                  />
                </div>
              ) : (
                <ReportEmpty>{t("noDemandData")}</ReportEmpty>
              )}
            </section>

            <section className={`${reportCardClassName} xl:col-span-5`} aria-label={t("attentionNeeded")}>
              <ReportCardHeader title={t("attentionNeeded")} description={t("attentionNeededDescription")} icon={AlertTriangle} tone="workspace-tone-amber" />

              <AttentionList alerts={alerts} locale={locale} />

              {/* The dashboard's queue is the full list; this card is its summary. */}
              <Link href={`/${locale}/admin?tab=attention`} className={reportLinkClassName}>
                {t("openAttentionQueue")}
                <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
              </Link>
            </section>
          </div>

          <div className="grid gap-6 xl:grid-cols-12">
            <section className={`${reportCardClassName} xl:col-span-7`} aria-label={t("hiringConversion")}>
              <ReportCardHeader title={t("hiringConversion")} description={t("hiringConversionDescription")} icon={Filter} tone="workspace-tone-emerald" />

              {conversion && conversion.applications > 0 ? (
                <ol className="mt-4 space-y-3">
                  {conversionStages.map((stage) => (
                    <li key={stage.key} data-stage={stage.key}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-medium text-foreground">{stage.label}</span>
                        <span className="text-base font-semibold tabular-nums text-foreground">{count(stage.count)}</span>
                      </div>
                      {/* Bars sized by count against applications, never by the
                          conversion rate — a 55% step drawn longest for 6 people. */}
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary">
                        <div
                          className={`h-full rounded-full ${stage.key === "hired" ? "bg-emerald-500" : "bg-primary"}`}
                          style={{ width: `${stage.count === 0 ? 0 : Math.max(2, (stage.count / conversion.applications) * 100)}%` }}
                        />
                      </div>
                      {stage.share ? <p className="mt-1 text-xs text-muted-foreground">{stage.share}</p> : null}
                    </li>
                  ))}
                </ol>
              ) : (
                <ReportEmpty>{t("noApplicationStatusData")}</ReportEmpty>
              )}

              {/* Jobs are a separate question from candidates: are roles
                  attracting anyone at all. */}
              {jobHealth ? (
                <div className="mt-auto pt-5">
                  <h3 className="text-xs font-semibold text-muted-foreground">{t("jobHealthTitle")}</h3>
                  <dl className="mt-2 grid grid-cols-3 gap-2">
                    {[
                      { key: "active", label: t("jobHealthActive"), value: jobHealth.active, href: `/${locale}/admin/jobs?status=active` },
                      { key: "receiving", label: t("jobHealthReceiving"), value: Math.max(0, jobHealth.active - jobHealth.withoutApplications), href: null },
                      { key: "none", label: t("jobHealthNone"), value: jobHealth.withoutApplications, href: `/${locale}${PLATFORM_ALERT_ACTIONS["jobs-without-applications"].path}` },
                    ].map((item) => {
                      const body = (
                        <>
                          <dt className="text-xs text-muted-foreground">{item.label}</dt>
                          <dd className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{count(item.value)}</dd>
                        </>
                      );
                      return item.href ? (
                        <Link key={item.key} href={item.href} className="rounded-xl bg-secondary/40 px-3 py-2 transition-colors hover:bg-secondary/70">{body}</Link>
                      ) : (
                        <div key={item.key} className="rounded-xl bg-secondary/40 px-3 py-2">{body}</div>
                      );
                    })}
                  </dl>
                </div>
              ) : null}
            </section>

            <section className={`${reportCardClassName} xl:col-span-5`} aria-label={t("applicationsByStatus")}>
              <ReportCardHeader title={t("applicationsByStatus")} description={t("applicationsByStatusDescription")} icon={FileText} tone="workspace-tone-violet" />

              {statusRows.length ? (
                <ul className="mt-4 space-y-1">
                  {statusRows.map((row) => (
                    <li key={row.key}>
                      <Link
                        href={`/${locale}/admin/applications?status=${row.key}`}
                        data-status={row.key}
                        className="grid min-h-9 grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)_2.5rem_3rem] items-center gap-2.5 rounded-lg px-1 transition-colors hover:bg-muted/40"
                      >
                        <span className="truncate text-sm text-foreground">{statusLabel(row.key)}</span>
                        <span className="h-2 overflow-hidden rounded-full bg-secondary">
                          <span
                            className={`block h-full rounded-full ${STATUS_BARS[row.key] ?? "bg-primary"}`}
                            style={{ width: `${row.count === 0 ? 0 : Math.max(3, (row.count / maxStatusCount) * 100)}%` }}
                          />
                        </span>
                        <span className="text-end text-sm font-semibold tabular-nums text-foreground">{count(row.count)}</span>
                        <span className="text-end text-xs tabular-nums text-muted-foreground">{row.percent}%</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <ReportEmpty>{t("noApplicationStatusData")}</ReportEmpty>
              )}

              <Link href={`/${locale}/admin/applications`} className={reportLinkClassName}>
                {t("viewAllApplications")}
                <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
              </Link>
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
