"use client";

import { useEffect, useState } from "react";
import { ReportTabs } from "@/components/features/admin/ReportTabs";
import { useLocale, useTranslations } from "next-intl";
import { PLATFORM_ALERT_ACTIONS } from "@/lib/admin/platformAlerts";
import { PageHero } from "@/components/shared/PageHero";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Briefcase,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Minus,
  Target,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Wallet,
} from "lucide-react";
import { toUserFacingError } from "@/lib/errors/user-facing";
import { formatCount, formatDate as formatIntlDate } from "@/lib/ui/intlFormat";

interface TrendData {
  current: number;
  previous: number;
  delta: number;
  direction: "up" | "down" | "flat";
}

interface ActivityPoint {
  label: string;
  jobs: number;
  applications: number;
}

interface StatusPoint {
  key: string;
  label: string;
  count: number;
  percent: number;
  toneKey: string;
}

interface FunnelPoint {
  key: string;
  label: string;
  count: number;
}

interface AlertItem {
  id: string;
  level: "critical" | "warning" | "positive";
  values?: Record<string, number>;
}

/* `/api/admin/analytics` has no locale, so it sends an alert id plus the numbers
   behind it rather than a finished sentence. The mapping lives here, spelled out
   per id so the keys stay statically greppable. An id this map doesn't know is
   skipped rather than rendered — next-intl throws on an unknown key.
   `href` is where the admin acts on the finding; null renders a plain row. The
   paths come from the shared alert registry, so the link the dashboard uses and
   the link this page uses are the same one — and both carry the filter that
   narrows the destination to the rows the alert counted. */
const ALERT_META: Record<string, {
  titleKey: string;
  descriptionKey: string;
  Icon: typeof AlertTriangle;
  href: string | null;
}> = {
  "jobs-without-applications": {
    titleKey: "alertJobsWithoutDemandTitle",
    descriptionKey: "alertJobsWithoutDemandDescription",
    Icon: Briefcase,
    href: PLATFORM_ALERT_ACTIONS["jobs-without-applications"].path,
  },
  "stale-open-applications": {
    titleKey: "alertStaleApplicationsTitle",
    descriptionKey: "alertStaleApplicationsDescription",
    Icon: Clock3,
    href: PLATFORM_ALERT_ACTIONS["stale-open-applications"].path,
  },
  "zero-placement-momentum": {
    titleKey: "alertNoPlacementMomentumTitle",
    descriptionKey: "alertNoPlacementMomentumDescription",
    Icon: Target,
    href: PLATFORM_ALERT_ACTIONS["zero-placement-momentum"].path,
  },
  "demand-softening": {
    titleKey: "alertDemandSofteningTitle",
    descriptionKey: "alertDemandSofteningDescription",
    Icon: TrendingDown,
    href: PLATFORM_ALERT_ACTIONS["demand-softening"].path,
  },
  "platform-stable": {
    titleKey: "alertPlatformStableTitle",
    descriptionKey: "alertPlatformStableDescription",
    Icon: CheckCircle2,
    href: null,
  },
};

/* Palette utilities on purpose: the semantic `bg-status-*` classes are not
   registered in the Tailwind v4 @theme block yet, so they compile to nothing. */
const LEVEL_CHIP: Record<AlertItem["level"], string> = {
  critical: "bg-rose-50 text-rose-600",
  warning: "bg-amber-50 text-amber-600",
  positive: "bg-emerald-50 text-emerald-600",
};

interface RecentJob {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  employerName: string;
  applicationCount: number;
}

interface RecentApplication {
  id: string;
  status: string;
  appliedAt: string;
  jobTitle: string;
  employerName: string;
}

interface TopAgent {
  id: string;
  name: string;
  jobs: number;
  applications: number;
  placements: number;
  revenue: number;
}

interface ReportStats {
  totalJobs: number;
  totalApplications: number;
  totalPlacements: number;
  totalRevenue: number;
  trends: {
    jobs: TrendData;
    applications: TrendData;
    placements: TrendData;
    revenue: TrendData;
  };
  activitySeries: ActivityPoint[];
  applicationsByStatus: StatusPoint[];
  funnel: FunnelPoint[];
  alerts: AlertItem[];
  recentJobs: RecentJob[];
  recentApplications: RecentApplication[];
  topAgents: TopAgent[];
  summary: {
    jobsWithoutApplications: number;
    staleOpenApplications: number;
    applicationRate: number;
    placementRate: number;
  };
}

const STATUS_TONES: Record<string, string> = {
  sky: "bg-blue-500",
  violet: "bg-violet-500",
  amber: "bg-amber-500",
  emerald: "bg-emerald-500",
  rose: "bg-rose-500",
  slate: "bg-slate-400",
};

/* The chart is drawn in a fixed viewBox and scaled by the container. 360 wide
   keeps the axis and month labels legible on a 390px phone (≈0.9 scale) instead
   of shrinking a desktop-sized drawing to two thirds. */
const CHART_W = 360;
const CHART_H = 190;
const CHART_PAD_X = 30;
const CHART_PAD_Y = 26;

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return formatIntlDate(date, {
    month: "short",
    day: "numeric",
  });
}

function formatDelta(delta: number) {
  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`;
}

function TrendBadge({ trend }: { trend: TrendData }) {
  const Icon = trend.direction === "up"
    ? ArrowUpRight
    : trend.direction === "down"
      ? ArrowDownRight
      : Minus;
  const className = trend.direction === "up"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : trend.direction === "down"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : "border-border bg-secondary/80 text-muted-foreground";

  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}>
      <Icon className="h-3.5 w-3.5" />
      {formatDelta(trend.delta)}
    </div>
  );
}

/* The softening alert carries a signed delta (e.g. -90.5); the sentence already
   says "down", so the number itself renders unsigned. */
function findingValues(alert: AlertItem): Record<string, number> {
  const values = alert.values ?? {};
  if (alert.id === "demand-softening") {
    return { ...values, delta: Math.abs(values.delta ?? 0) };
  }

  return values;
}

export default function AdminReportsPage() {
  const locale = useLocale();
  const t = useTranslations("adminReports");
  const [stats, setStats] = useState<ReportStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();

    fetch("/api/admin/analytics", { signal: controller.signal })
      .then((r) => {
        if (!r.ok) {
          throw new Error(t("failedToLoadReports"));
        }

        return r.json();
      })
      .then((data: ReportStats) => {
        if (!isActive) return;
        setStats(data);
      })
      .catch((error: unknown) => {
        if (!isActive || (error instanceof Error && error.name === "AbortError")) {
          return;
        }

        setErrorMessage(toUserFacingError(error, { fallback: t("failedToLoadReports") }).message);
      })
      .finally(() => {
        if (isActive) {
          setLoading(false);
        }
      });

    return () => {
      isActive = false;
      controller.abort();
    };
  }, []);

  const totalRevenue = stats?.totalRevenue ?? 0;
  const totalApplications = stats?.totalApplications ?? 0;
  const totalPlacements = stats?.totalPlacements ?? 0;
  const totalJobs = stats?.totalJobs ?? 0;
  const alerts = stats?.alerts ?? [];
  const statusRows = stats?.applicationsByStatus ?? [];
  const funnel = stats?.funnel ?? [];
  const activitySeries = stats?.activitySeries ?? [];
  const maxActivityValue = Math.max(1, ...activitySeries.flatMap((row) => [row.jobs, row.applications]));
  const maxFunnelValue = Math.max(1, ...funnel.map((stage) => stage.count));
  const applicationRate = stats?.summary.applicationRate ?? 0;
  const placementRate = stats?.summary.placementRate ?? 0;

  const chartInnerW = CHART_W - CHART_PAD_X * 2;
  const chartInnerH = CHART_H - CHART_PAD_Y * 2;
  const xFor = (index: number) => activitySeries.length > 1
    ? CHART_PAD_X + (index * chartInnerW) / (activitySeries.length - 1)
    : CHART_W / 2;
  const yFor = (value: number) => CHART_H - CHART_PAD_Y - (value / maxActivityValue) * chartInnerH;
  const demandPath = (key: "jobs" | "applications") => activitySeries
    .map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(index).toFixed(1)} ${yFor(point[key]).toFixed(1)}`)
    .join(" ");

  const viewAllLinkClassName = "mt-3 inline-flex min-h-9 items-center gap-1.5 self-start text-xs font-semibold text-primary transition-colors hover:text-primary/80";

  const kpis = [
    {
      label: t("totalJobs"),
      value: formatCount(totalJobs),
      trend: stats?.trends.jobs,
      detail: t("totalJobsRolesDetail", { current: stats?.trends.jobs.current ?? 0 }),
      insight: t("totalJobsInsight", { count: stats?.summary.jobsWithoutApplications ?? 0 }),
      valueClassName: "text-foreground",
      indicatorClassName: "bg-blue-500",
      toneClassName: "workspace-tone-sky",
      icon: Briefcase,
      href: `/${locale}/admin/jobs`,
    },
    {
      label: t("applications"),
      value: formatCount(totalApplications),
      trend: stats?.trends.applications,
      detail: t("applicationsDetail", { current: stats?.trends.applications.current ?? 0 }),
      insight: t("applicationsInsight", { rate: applicationRate.toFixed(1) }),
      valueClassName: "text-foreground",
      indicatorClassName: "bg-violet-500",
      toneClassName: "workspace-tone-violet",
      icon: FileText,
      href: `/${locale}/admin/applications`,
    },
    {
      label: t("placements"),
      value: formatCount(totalPlacements),
      trend: stats?.trends.placements,
      detail: t("placementsDetail", { current: stats?.trends.placements.current ?? 0 }),
      insight: t("placementsInsight", { rate: Math.round(placementRate * 100) }),
      valueClassName: "text-foreground",
      indicatorClassName: totalPlacements > 0 ? "bg-emerald-500" : "bg-yellow-500",
      toneClassName: totalPlacements > 0 ? "workspace-tone-emerald" : "workspace-tone-amber",
      icon: UserCheck,
      href: `/${locale}/admin/applications?status=placed`,
    },
    {
      label: t("revenue"),
      value: `$${formatCount(totalRevenue)}`,
      trend: stats?.trends.revenue,
      detail: t("revenueDetail", { current: formatCount((stats?.trends.revenue.current ?? 0)) }),
      insight: totalPlacements > 0
        ? t("revenueInsightWithPlacements", { earned: formatCount(Math.round(totalRevenue / totalPlacements)) })
        : t("revenueInsightNoPlacements"),
      valueClassName: "text-foreground",
      indicatorClassName: totalRevenue > 0 ? "bg-amber-500" : "bg-slate-400",
      toneClassName: "workspace-tone-amber",
      icon: Wallet,
      href: `/${locale}/admin/subscriptions`,
    },
  ];

  return (
    <div className="page-container">
      <ReportTabs />
      <PageHero
        compact
        compactOnMobile
        title={t("reportsAndAnalytics")}
        description={t("platformDemandDescription")}
      />

      <section className="workspace-panel-surface overflow-hidden rounded-3xl">
        {/* Phones get a four-across strip like the employer headers: value over
            label, no icon chip, and the "vs prev 30d" caption and insight
            sentence held back for wider screens. As four 210px tiles these
            four figures filled the whole first screen. */}
        <div className="grid grid-cols-4 gap-1.5 p-2 sm:grid-cols-2 sm:gap-3 sm:p-5 xl:grid-cols-4">
          {kpis.map((kpi) => (
            <Link key={kpi.label} href={kpi.href} className="rounded-xl border border-border/60 bg-card p-2 text-center transition-shadow hover:ring-2 hover:ring-primary/20 hover:shadow-md sm:rounded-2xl sm:text-start sm:card-pad">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 flex-col items-center sm:block">
                  <p className="order-2 line-clamp-2 text-[10px] font-semibold leading-tight text-muted-foreground sm:text-xs">
                    <span className={`me-1.5 hidden h-2 w-2 rounded-full align-middle sm:inline-block ${kpi.indicatorClassName}`} />
                    {kpi.label}
                  </p>
                  <p className="order-1 text-base font-semibold tracking-tight text-foreground sm:mt-2 sm:text-2xl">{loading ? <span className="inline-block h-7 w-16 animate-pulse rounded bg-muted" /> : kpi.value}</p>
                </div>
                <div className={`hidden rounded-xl p-2 sm:block ${kpi.toneClassName}`}>
                  <kpi.icon className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-1 hidden items-center gap-2 sm:mt-3 sm:flex">
                {kpi.trend ? <TrendBadge trend={kpi.trend} /> : null}
                <span className="text-xs text-muted-foreground">{t("vsPrev30d")}</span>
              </div>
              <p className="mt-2 hidden text-xs leading-5 text-muted-foreground sm:block">{kpi.insight}</p>
            </Link>
          ))}
        </div>
      </section>

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2" role="status" aria-live="polite" aria-label={t("loadingReports")}>
          <div className="workspace-panel-surface h-72 animate-pulse rounded-3xl" />
          <div className="workspace-panel-surface h-72 animate-pulse rounded-3xl" />
          <div className="workspace-panel-surface h-72 animate-pulse rounded-3xl lg:col-span-2" />
        </div>
      ) : errorMessage ? (
        <section className="workspace-panel-surface rounded-3xl border border-rose-200/80 panel-body" aria-label={t("a11yReportsError")}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-500">{t("unableToLoadReports")}</p>
          <p className="mt-2 text-sm leading-6 text-rose-700">{errorMessage}</p>
        </section>
      ) : (
        <>
          <div className="grid gap-6 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.1fr)]">
            <section className="workspace-panel-surface rounded-3xl panel-body" aria-label={t("a11yKeyFindings")}>
              {/* Chip beside the short title, description below: a global admin
                  rule force-wraps bare flex rows on phones, so a chip next to a
                  long description dropped to its own line. */}
              <div className="flex items-start justify-between gap-4">
                <h2 className="heading-section font-semibold tracking-tight text-foreground">{t("keyFindings")}</h2>
                <div className="workspace-tone-amber shrink-0 rounded-2xl p-2.5">
                  <AlertTriangle className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{t("keyFindingsDescription")}</p>

              <div className="mt-4 divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 bg-card">
                {alerts.map((alert) => {
                  const meta = ALERT_META[alert.id];
                  if (!meta) return null;
                  const values = findingValues(alert);
                  const FindingIcon = meta.Icon;
                  const inner = (
                    <>
                      <span className={`shrink-0 rounded-xl p-2 ${LEVEL_CHIP[alert.level]}`}>
                        <FindingIcon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-foreground">{t(meta.titleKey, values)}</span>
                        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{t(meta.descriptionKey, values)}</span>
                      </span>
                    </>
                  );

                  return meta.href ? (
                    <Link
                      key={alert.id}
                      href={`/${locale}${meta.href}`}
                      data-alert-level={alert.level}
                      className="flex min-h-11 items-center gap-3 px-3.5 py-3 transition-colors hover:bg-muted/40"
                    >
                      {inner}
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180" />
                    </Link>
                  ) : (
                    <div
                      key={alert.id}
                      data-alert-level={alert.level}
                      className="flex min-h-11 items-center gap-3 px-3.5 py-3"
                    >
                      {inner}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="workspace-panel-surface rounded-3xl panel-body" aria-label={t("a11yHiringDemand")}>
              <div className="flex items-start justify-between gap-4">
                <h2 className="heading-section font-semibold tracking-tight text-foreground">{t("hiringDemand")}</h2>
                <div className="workspace-tone-sky shrink-0 rounded-2xl p-2.5">
                  <TrendingUp className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{t("hiringDemandDescription")}</p>

              <div className="mt-4 flex items-center gap-4 text-xs font-medium text-muted-foreground">
                <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> {t("jobs")}</div>
                <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-violet-500" /> {t("applicationsChartLabel")}</div>
              </div>

              {activitySeries.length ? (
                <div className="mt-4 rounded-2xl border border-border/70 bg-secondary/30 p-3">
                  <svg
                    viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                    role="img"
                    aria-label={t("hiringDemandChartAria")}
                    className="w-full text-muted-foreground"
                    preserveAspectRatio="xMidYMid meet"
                  >
                    {[0.25, 0.5, 0.75, 1].map((tick) => {
                      const y = CHART_H - CHART_PAD_Y - chartInnerH * tick;

                      return (
                        <g key={tick}>
                          <line
                            x1={CHART_PAD_X}
                            y1={y}
                            x2={CHART_W - CHART_PAD_X}
                            y2={y}
                            stroke="rgba(71,85,105,0.28)"
                            strokeDasharray="4 6"
                          />
                          <text x={2} y={y + 3.5} fill="currentColor" className="fill-current text-[10px]">
                            {Math.round(maxActivityValue * tick)}
                          </text>
                        </g>
                      );
                    })}

                    <path d={demandPath("jobs")} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" />
                    <path d={demandPath("applications")} fill="none" stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round" />

                    {activitySeries.map((point, index) => (
                      <g key={point.label}>
                        <circle cx={xFor(index)} cy={yFor(point.jobs)} r="3.5" fill="#3b82f6" />
                        <circle cx={xFor(index)} cy={yFor(point.applications)} r="3.5" fill="#8b5cf6" />
                        <text x={xFor(index)} y={CHART_H - 6} textAnchor="middle" fill="currentColor" className="fill-current text-[10px]">
                          {point.label}
                        </text>
                      </g>
                    ))}
                  </svg>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-border/70 bg-background/60 px-4 py-6 text-sm text-muted-foreground">
                  {t("noDemandData")}
                </div>
              )}
            </section>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <section className="workspace-panel-surface rounded-3xl panel-body" aria-label={t("a11yApplicationsByStatus")}>
              <div className="flex items-start justify-between gap-4">
                <h2 className="heading-section font-semibold tracking-tight text-foreground">{t("applicationsByStatus")}</h2>
                <div className="workspace-tone-violet shrink-0 rounded-2xl p-2.5">
                  <FileText className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{t("applicationsByStatusDescription")}</p>

              {statusRows.length ? (
                <>
                  <div className="mt-4 flex h-4 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-label={t("applicationStatusDistribution")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={100}>
                    {statusRows.map((row) => (
                      <div
                        key={row.key}
                        className={STATUS_TONES[row.toneKey] ?? "bg-slate-400"}
                        style={{ width: `${Math.max(row.percent, row.percent > 0 ? 4 : 0)}%` }}
                        title={`${row.label}: ${row.percent}%`}
                      />
                    ))}
                  </div>

                  <div className="mt-3 divide-y divide-border/60">
                    {statusRows.map((row) => (
                      <div key={row.key} className="flex min-h-11 items-center gap-2.5 py-2">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_TONES[row.toneKey] ?? "bg-slate-400"}`} />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{row.label}</span>
                        <span className="text-sm font-semibold text-foreground">{row.count}</span>
                        <span className="w-14 text-end text-xs font-medium text-muted-foreground">{row.percent}%</span>
                      </div>
                    ))}
                  </div>

                  <Link href={`/${locale}/admin/applications`} className={viewAllLinkClassName}>
                    {t("viewAllApplications")}
                    <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
                  </Link>
                </>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-border/70 bg-background/60 px-4 py-6 text-sm text-muted-foreground">
                  {t("noApplicationStatusData")}
                </div>
              )}
            </section>

            <section className="workspace-panel-surface rounded-3xl panel-body" aria-label={t("a11yHiringFunnel")}>
              <div className="flex items-start justify-between gap-4">
                <h2 className="heading-section font-semibold tracking-tight text-foreground">{t("hiringFunnel")}</h2>
                <div className="workspace-tone-emerald shrink-0 rounded-2xl p-2.5">
                  <UserCheck className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{t("hiringFunnelDescription")}</p>

              <div className="mt-4 space-y-4">
                {funnel.map((stage, index) => {
                  const previousCount = index === 0 ? stage.count : funnel[index - 1]?.count ?? stage.count;
                  const conversion = previousCount > 0 ? Math.round((stage.count / previousCount) * 100) : 0;

                  return (
                    <div key={stage.key}>
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-sm font-medium text-foreground">{stage.label}</p>
                        <p className="text-base font-semibold tracking-tight text-foreground">{formatCount(stage.count)}</p>
                      </div>
                      <div
                        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary"
                        role="progressbar"
                        aria-label={t("funnelStage", { label: stage.label })}
                        aria-valuemin={0}
                        aria-valuemax={maxFunnelValue}
                        aria-valuenow={stage.count}
                      >
                        <div
                          className="h-full rounded-full bg-[linear-gradient(135deg,_rgba(59,130,246,1),_rgba(139,92,246,1))]"
                          style={{ width: `${Math.min(100, (stage.count / maxFunnelValue) * 100)}%` }}
                        />
                      </div>
                      {index > 0 ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("retainedFromPrevious", { conversion, previous: funnel[index - 1]?.label.toLowerCase() })}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <section className="workspace-panel-surface rounded-3xl panel-body" aria-label={t("a11yTopAgents")}>
              <div className="flex items-start justify-between gap-4">
                <h2 className="heading-section font-semibold tracking-tight text-foreground">{t("topAgents")}</h2>
                <div className="workspace-tone-emerald shrink-0 rounded-2xl p-2.5">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
              </div>

              {stats?.topAgents.length ? (
                <>
                  <div className="mt-4 divide-y divide-border/60">
                    {stats.topAgents.slice(0, 3).map((agent, index) => (
                      <Link key={agent.id} href={`/${locale}/admin/agents`} className="flex min-h-11 items-center gap-3 py-2.5 transition-colors hover:bg-muted/40">
                        <span className="w-7 shrink-0 text-xs font-semibold text-muted-foreground">#{index + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">{agent.name}</span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {t("agentRowSummary", { jobs: agent.jobs, applications: agent.applications, placements: agent.placements })}
                          </span>
                        </span>
                        {agent.revenue > 0 ? (
                          <span className="shrink-0 text-sm font-semibold text-foreground">${formatCount(agent.revenue)}</span>
                        ) : null}
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180" />
                      </Link>
                    ))}
                  </div>

                  <Link href={`/${locale}/admin/agents`} className={viewAllLinkClassName}>
                    {t("viewAllAgents")}
                    <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
                  </Link>
                </>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-border/70 bg-background/60 px-4 py-6 text-sm text-muted-foreground">
                  {t("noAgentPerformanceData")}
                </div>
              )}
            </section>

            <section className="workspace-panel-surface rounded-3xl panel-body" aria-label={t("a11yRecentJobs")}>
              <div className="flex items-start justify-between gap-4">
                <h2 className="heading-section font-semibold tracking-tight text-foreground">{t("recentJobs")}</h2>
                <div className="workspace-tone-sky shrink-0 rounded-2xl p-2.5">
                  <Briefcase className="h-5 w-5" />
                </div>
              </div>

              {stats?.recentJobs.length ? (
                <>
                  <div className="mt-4 divide-y divide-border/60">
                    {stats.recentJobs.slice(0, 3).map((job) => (
                      <Link key={job.id} href={`/${locale}/admin/jobs`} className="flex min-h-11 items-center gap-3 py-2.5 transition-colors hover:bg-muted/40">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">{job.title}</span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{job.employerName}</span>
                        </span>
                        <span className="shrink-0 text-end">
                          <span className="block text-xs font-medium text-foreground">{job.status}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">{formatDate(job.createdAt)}</span>
                        </span>
                      </Link>
                    ))}
                  </div>

                  <Link href={`/${locale}/admin/jobs`} className={viewAllLinkClassName}>
                    {t("viewAllJobs")}
                    <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
                  </Link>
                </>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-border/70 bg-background/60 px-4 py-6 text-sm text-muted-foreground">
                  {t("noRecentJobsAvailable")}
                </div>
              )}
            </section>

            <section className="workspace-panel-surface rounded-3xl panel-body" aria-label={t("a11yRecentApplications")}>
              <div className="flex items-start justify-between gap-4">
                <h2 className="heading-section font-semibold tracking-tight text-foreground">{t("recentApplications")}</h2>
                <div className="workspace-tone-violet shrink-0 rounded-2xl p-2.5">
                  <FileText className="h-5 w-5" />
                </div>
              </div>

              {stats?.recentApplications.length ? (
                <>
                  <div className="mt-4 divide-y divide-border/60">
                    {stats.recentApplications.slice(0, 3).map((application) => (
                      <Link key={application.id} href={`/${locale}/admin/applications`} className="flex min-h-11 items-center gap-3 py-2.5 transition-colors hover:bg-muted/40">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">{application.jobTitle}</span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{application.employerName}</span>
                        </span>
                        <span className="shrink-0 text-end">
                          <span className="block text-xs font-medium text-foreground">{application.status}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">{formatDate(application.appliedAt)}</span>
                        </span>
                      </Link>
                    ))}
                  </div>

                  <Link href={`/${locale}/admin/applications`} className={viewAllLinkClassName}>
                    {t("viewAllApplications")}
                    <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
                  </Link>
                </>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-border/70 bg-background/60 px-4 py-6 text-sm text-muted-foreground">
                  {t("noRecentApplicationsAvailable")}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
