"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/shared/PageHeader";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  Sparkles,
  ArrowUpRight,
  Briefcase,
  CheckCircle2,
  Clock3,
  FileText,
  Minus,
  TrendingUp,
  UserCheck,
  Wallet,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
  title: string;
  description: string;
  metric: string;
}

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

const ALERT_STYLES: Record<AlertItem["level"], {
  Icon: typeof AlertTriangle;
  card: string;
  iconWrap: string;
  eyebrow: string;
  title: string;
  description: string;
  metric: string;
}> = {
  critical: {
    Icon: AlertTriangle,
    card: "border border-red-200 border-l-4 border-l-red-500 bg-white shadow-sm",
    iconWrap: "bg-red-100 text-red-600",
    eyebrow: "text-red-600",
    title: "text-gray-900",
    description: "text-gray-600",
    metric: "bg-red-600 text-white shadow-sm",
  },
  warning: {
    Icon: Clock3,
    card: "border border-yellow-200 border-l-4 border-l-yellow-500 bg-white shadow-sm",
    iconWrap: "bg-yellow-100 text-yellow-600",
    eyebrow: "text-yellow-600",
    title: "text-gray-900",
    description: "text-gray-600",
    metric: "bg-yellow-600 text-white shadow-sm",
  },
  positive: {
    Icon: CheckCircle2,
    card: "border border-emerald-200 border-l-4 border-l-emerald-500 bg-white shadow-sm",
    iconWrap: "bg-emerald-100 text-emerald-600",
    eyebrow: "text-emerald-600",
    title: "text-gray-900",
    description: "text-gray-600",
    metric: "bg-emerald-600 text-white shadow-sm",
  },
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return date.toLocaleDateString(undefined, {
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
    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/60 dark:text-emerald-200"
    : trend.direction === "down"
      ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800/70 dark:bg-red-950/60 dark:text-red-200"
      : "border-border bg-secondary/80 text-muted-foreground";

  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}>
      <Icon className="h-3.5 w-3.5" />
      {formatDelta(trend.delta)}
    </div>
  );
}

export default function AdminReportsPage() {
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

        setErrorMessage(error instanceof Error ? error.message : t("failedToLoadReports"));
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

  const kpis = [
    {
      label: t("totalJobs"),
      value: totalJobs.toLocaleString(),
      trend: stats?.trends.jobs,
      detail: t("totalJobsRolesDetail", { current: stats?.trends.jobs.current ?? 0 }),
      insight: t("totalJobsInsight", { count: stats?.summary.jobsWithoutApplications ?? 0 }),
      valueClassName: "text-foreground",
      indicatorClassName: "bg-blue-500",
      toneClassName: "workspace-tone-sky",
      icon: Briefcase,
      href: "../jobs",
    },
    {
      label: t("applications"),
      value: totalApplications.toLocaleString(),
      trend: stats?.trends.applications,
      detail: t("applicationsDetail", { current: stats?.trends.applications.current ?? 0 }),
      insight: t("applicationsInsight", { rate: applicationRate.toFixed(1) }),
      valueClassName: "text-foreground",
      indicatorClassName: "bg-violet-500",
      toneClassName: "workspace-tone-violet",
      icon: FileText,
      href: "../applications",
    },
    {
      label: t("placements"),
      value: totalPlacements.toLocaleString(),
      trend: stats?.trends.placements,
      detail: t("placementsDetail", { current: stats?.trends.placements.current ?? 0 }),
      insight: t("placementsInsight", { rate: Math.round(placementRate * 100) }),
      valueClassName: "text-foreground",
      indicatorClassName: totalPlacements > 0 ? "bg-emerald-500" : "bg-yellow-500",
      toneClassName: totalPlacements > 0 ? "workspace-tone-emerald" : "workspace-tone-amber",
      icon: UserCheck,
      href: "../applications?status=placed",
    },
    {
      label: t("revenue"),
      value: `$${totalRevenue.toLocaleString()}`,
      trend: stats?.trends.revenue,
      detail: t("revenueDetail", { current: (stats?.trends.revenue.current ?? 0).toLocaleString() }),
      insight: totalPlacements > 0
        ? t("revenueInsightWithPlacements", { earned: Math.round(totalRevenue / totalPlacements).toLocaleString() })
        : t("revenueInsightNoPlacements"),
      valueClassName: "text-foreground",
      indicatorClassName: totalRevenue > 0 ? "bg-amber-500" : "bg-slate-400",
      toneClassName: "workspace-tone-amber",
      icon: Wallet,
      href: "../subscriptions",
    },
  ];

  return (
    <div className="page-container space-y-4">
      {/* ── Hero Section ── */}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          {t("adminWorkspace")}
        </div>
        <PageHeader className="mt-4" title={t("reportsAndAnalytics")} description={t("platformDemandDescription")} />
      </section>

      <section className="workspace-panel-surface overflow-hidden rounded-[20px]">
        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => (
            <Link key={kpi.label} href={kpi.href} className="rounded-2xl border border-border/60 bg-card p-4 transition-shadow hover:ring-2 hover:ring-primary/20 hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${kpi.indicatorClassName}`} />
                    <p className="text-xs font-semibold text-muted-foreground">{kpi.label}</p>
                  </div>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{loading ? <span className="inline-block h-7 w-16 animate-pulse rounded bg-muted" /> : kpi.value}</p>
                </div>
                <div className={`rounded-xl p-2 ${kpi.toneClassName}`}>
                  <kpi.icon className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                {kpi.trend ? <TrendBadge trend={kpi.trend} /> : null}
                <span className="text-xs text-muted-foreground">{t("vsPrev30d")}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{kpi.insight}</p>
            </Link>
          ))}
        </div>
      </section>

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2" role="status" aria-live="polite" aria-label={t("loadingReports")}>
          <div className="workspace-panel-surface h-72 animate-pulse rounded-[20px]" />
          <div className="workspace-panel-surface h-72 animate-pulse rounded-[20px]" />
          <div className="workspace-panel-surface h-72 animate-pulse rounded-[20px] lg:col-span-2" />
        </div>
      ) : errorMessage ? (
        <section className="workspace-panel-surface rounded-[28px] border border-rose-200/80 p-5 sm:p-6 dark:border-rose-900/60" aria-label={t("a11yReportsError")}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-500">{t("unableToLoadReports")}</p>
          <p className="mt-2 text-sm leading-6 text-rose-700 dark:text-rose-200">{errorMessage}</p>
        </section>
      ) : (
        <>
          <div className="grid gap-6 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.1fr)]">
            <section className="workspace-panel-surface rounded-[28px] p-5 sm:p-6" aria-label={t("a11yPlatformAlerts")}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("actionQueue")}</p>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{t("platformAlerts")}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{t("platformAlertsDescription")}</p>
                </div>
                <div className="workspace-tone-amber rounded-2xl p-2.5">
                  <AlertTriangle className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-6 space-y-3">
                {alerts.map((alert) => {
                  const alertStyle = ALERT_STYLES[alert.level];
                  const AlertIcon = alertStyle.Icon;

                  return (
                  <div
                    key={alert.id}
                    data-alert-level={alert.level}
                    className={`rounded-xl px-5 py-5 ${alertStyle.card}`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`rounded-2xl p-2.5 ${alertStyle.iconWrap}`}>
                        <AlertIcon className="h-4.5 w-4.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${alertStyle.eyebrow}`}>{alert.level}</p>
                        <p className={`mt-2 text-base font-semibold ${alertStyle.title}`}>{alert.title}</p>
                        <p className={`mt-1 text-sm leading-6 ${alertStyle.description}`}>{alert.description}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${alertStyle.metric}`}>{alert.metric}</span>
                    </div>
                  </div>
                  );
                })}
              </div>
            </section>

            <section className="workspace-panel-surface rounded-[28px] p-5 sm:p-6" aria-label={t("a11yJobsVsApplications")}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("demandTrend")}</p>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{t("jobsVsApplications")}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{t("jobsVsApplicationsDescription")}</p>
                </div>
                <div className="workspace-tone-sky rounded-2xl p-2.5">
                  <TrendingUp className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-6 flex items-center gap-4 text-xs font-medium text-muted-foreground">
                <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> {t("jobs")}</div>
                <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-violet-500" /> {t("applicationsChartLabel")}</div>
              </div>

              {activitySeries.length ? (
                <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
                  {activitySeries.map((point) => (
                    <div key={point.label} className="rounded-[22px] border border-slate-200/80 bg-slate-50/80 px-3 py-4">
                      <div className="flex h-32 items-end justify-center gap-2" aria-label={t("jobsDemandChart", { label: point.label })}>
                        <div
                          className="w-4 rounded-t-full bg-blue-500"
                          style={{ height: `${Math.max(10, (point.jobs / maxActivityValue) * 100)}%` }}
                          title={`${point.jobs} jobs`}
                        />
                        <div
                          className="w-4 rounded-t-full bg-violet-500"
                          style={{ height: `${Math.max(10, (point.applications / maxActivityValue) * 100)}%` }}
                          title={`${point.applications} applications`}
                        />
                      </div>
                      <p className="mt-4 text-center text-sm font-semibold text-foreground">{point.label}</p>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs text-muted-foreground">
                        <div>
                          <p className="font-semibold text-foreground">{point.jobs}</p>
                          <p>{t("jobsCount")}</p>
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">{point.applications}</p>
                          <p>{t("appsCount")}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-6 rounded-2xl border border-dashed border-border/70 bg-background/60 px-4 py-6 text-sm text-muted-foreground">
                  {t("noDemandData")}
                </div>
              )}
            </section>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <section className="workspace-panel-surface rounded-[28px] p-5 sm:p-6" aria-label={t("a11yApplicationsByStatus")}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("pipelineMix")}</p>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{t("applicationsByStatus")}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{t("applicationsByStatusDescription")}</p>
                </div>
                <div className="workspace-tone-violet rounded-2xl p-2.5">
                  <FileText className="h-5 w-5" />
                </div>
              </div>

              {statusRows.length ? (
                <>
                  <div className="mt-6 flex h-4 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-label={t("applicationStatusDistribution")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={100}>
                    {statusRows.map((row) => (
                      <div
                        key={row.key}
                        className={STATUS_TONES[row.toneKey] ?? "bg-slate-400"}
                        style={{ width: `${Math.max(row.percent, row.percent > 0 ? 4 : 0)}%` }}
                        title={`${row.label}: ${row.percent}%`}
                      />
                    ))}
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    {statusRows.map((row) => (
                      <div key={row.key} className="workspace-subtle-surface rounded-[22px] px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${STATUS_TONES[row.toneKey] ?? "bg-slate-400"}`} />
                          <span className="text-sm font-semibold text-foreground">{row.label}</span>
                        </div>
                        <div className="mt-3 flex items-end justify-between gap-3">
                          <p className="text-2xl font-semibold tracking-tight text-foreground">{row.count}</p>
                          <p className="text-sm font-medium text-muted-foreground">{row.percent}%</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="mt-6 rounded-2xl border border-dashed border-border/70 bg-background/60 px-4 py-6 text-sm text-muted-foreground">
                  {t("noApplicationStatusData")}
                </div>
              )}
            </section>

            <section className="workspace-panel-surface rounded-[28px] p-5 sm:p-6" aria-label={t("a11yConversionFunnel")}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("flowEfficiency")}</p>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{t("conversionFunnel")}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{t("conversionFunnelDescription")}</p>
                </div>
                <div className="workspace-tone-emerald rounded-2xl p-2.5">
                  <UserCheck className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-6 space-y-4">
                {funnel.map((stage, index) => {
                  const previousCount = index === 0 ? stage.count : funnel[index - 1]?.count ?? stage.count;
                  const conversion = previousCount > 0 ? Math.round((stage.count / previousCount) * 100) : 0;

                  return (
                    <div key={stage.key} className="workspace-subtle-surface rounded-[22px] px-4 py-4">
                      <div className="flex items-center justify-between gap-4 text-sm">
                        <div>
                          <p className="font-semibold text-foreground">{stage.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {index === 0 ? t("baseFunnelVolume") : t("retainedFromPrevious", { conversion, previous: funnel[index - 1]?.label.toLowerCase() })}
                          </p>
                        </div>
                        <p className="text-2xl font-semibold tracking-tight text-foreground">{stage.count.toLocaleString()}</p>
                      </div>
                      <div
                        className="mt-3 h-2 overflow-hidden rounded-full bg-secondary"
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
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <section className="workspace-panel-surface rounded-[28px] p-5 sm:p-6" aria-label={t("a11yRecentJobs")}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("recentActivity")}</p>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{t("recentJobs")}</h2>
                </div>
                <div className="workspace-tone-sky rounded-2xl p-2.5">
                  <Briefcase className="h-5 w-5" />
                </div>
              </div>

              {stats?.recentJobs.length ? (
                <div className="mt-6 overflow-hidden rounded-[22px] border border-border/70 bg-background/60">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("jobTableHeaderRole")}</TableHead>
                        <TableHead>{t("jobTableHeaderApps")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.recentJobs.map((job) => (
                        <TableRow key={job.id} className="cursor-pointer hover:bg-muted/40 transition-colors">
                          <TableCell>
                            <Link href={`../jobs`} className="block">
                              <p className="font-medium text-foreground">{job.title}</p>
                              <p className="text-xs text-muted-foreground">{job.employerName} · {job.status}</p>
                            </Link>
                          </TableCell>
                          <TableCell>
                            <div className="text-right">
                              <p className="font-semibold text-foreground">{job.applicationCount}</p>
                              <p className="text-xs text-muted-foreground">{formatDate(job.createdAt)}</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="mt-6 rounded-2xl border border-dashed border-border/70 bg-background/60 px-4 py-6 text-sm text-muted-foreground">
                  {t("noRecentJobsAvailable")}
                </div>
              )}
            </section>

            <section className="workspace-panel-surface rounded-[28px] p-5 sm:p-6" aria-label={t("a11yRecentApplications")}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("recentActivity")}</p>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{t("recentApplications")}</h2>
                </div>
                <div className="workspace-tone-violet rounded-2xl p-2.5">
                  <FileText className="h-5 w-5" />
                </div>
              </div>

              {stats?.recentApplications.length ? (
                <div className="mt-6 overflow-hidden rounded-[22px] border border-border/70 bg-background/60">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("applicationTableHeaderRole")}</TableHead>
                        <TableHead>{t("applicationTableHeaderStatus")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.recentApplications.map((application) => (
                        <TableRow key={application.id} className="cursor-pointer hover:bg-muted/40 transition-colors">
                          <TableCell>
                            <Link href={`../applications`} className="block">
                              <p className="font-medium text-foreground">{application.jobTitle}</p>
                              <p className="text-xs text-muted-foreground">{application.employerName}</p>
                            </Link>
                          </TableCell>
                          <TableCell>
                            <div className="text-right">
                              <p className="font-semibold text-foreground">{application.status}</p>
                              <p className="text-xs text-muted-foreground">{formatDate(application.appliedAt)}</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="mt-6 rounded-2xl border border-dashed border-border/70 bg-background/60 px-4 py-6 text-sm text-muted-foreground">
                  {t("noRecentApplicationsAvailable")}
                </div>
              )}
            </section>

            <section className="workspace-panel-surface rounded-[28px] p-5 sm:p-6" aria-label={t("a11yTopAgents")}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("ownership")}</p>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{t("topAgents")}</h2>
                </div>
                <div className="workspace-tone-emerald rounded-2xl p-2.5">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
              </div>

              {stats?.topAgents.length ? (
                <div className="mt-6 space-y-3">
                  {stats.topAgents.map((agent, index) => (
                    <div key={agent.id} className="workspace-subtle-surface rounded-[22px] px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("rankPrefix", { index: index + 1 })}</p>
                          <p className="mt-2 text-base font-semibold text-foreground">{agent.name}</p>
                        </div>
                        <ArrowRight className="mt-1 h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm xl:grid-cols-4">
                        <div>
                          <p className="text-xs text-muted-foreground">{t("topAgentJobsMetric")}</p>
                          <p className="font-semibold text-foreground">{agent.jobs}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t("topAgentAppsMetric")}</p>
                          <p className="font-semibold text-foreground">{agent.applications}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t("topAgentPlacementsMetric")}</p>
                          <p className="font-semibold text-foreground">{agent.placements}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t("topAgentPaidMetric")}</p>
                          <p className="font-semibold text-foreground">${agent.revenue.toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-6 rounded-2xl border border-dashed border-border/70 bg-background/60 px-4 py-6 text-sm text-muted-foreground">
                  {t("noAgentPerformanceData")}
                </div>
              )}
            </section>
          </div>

          <section className="workspace-panel-surface rounded-[28px] p-5 sm:p-6" aria-label={t("a11yOperationalHighlights")}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("decisionSupport")}</p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{t("operationalHighlights")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("operationalHighlightsDescription")}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="workspace-subtle-surface rounded-[24px] p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock3 className="h-4 w-4" />
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">{t("agingQueue")}</p>
                </div>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{stats?.summary.staleOpenApplications ?? 0}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("agingQueueDescription")}</p>
              </div>
              <div className="workspace-subtle-surface rounded-[24px] p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <TrendingUp className="h-4 w-4" />
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">{t("demandEfficiency")}</p>
                </div>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{applicationRate.toFixed(1)}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("demandEfficiencyDescription")}</p>
              </div>
              <div className="workspace-subtle-surface rounded-[24px] p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Wallet className="h-4 w-4" />
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">{t("commercialYield")}</p>
                </div>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{Math.round(placementRate * 100)}%</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("commercialYieldDescription")}</p>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
