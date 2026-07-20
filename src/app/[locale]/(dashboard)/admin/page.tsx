import { auth } from "@/lib/auth/config";
import connectDB from "@/lib/db/mongoose";
import Application from "@/models/Application";
import Interview from "@/models/Interview";
import Job from "@/models/Job";
import Placement from "@/models/Placement";
import User from "@/models/User";
import {
  Activity,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  FileText,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense, type ReactNode } from "react";
import {
  BadgeSkeleton,
  InsightTextSkeleton,
  KpiActiveJobsInsightText,
  PlatformInsightsSection,
  PlatformInsightsSkeleton,
  QuickActionHealthBadge,
} from "./_components/platform-health";

interface UsersByRoleRow {
  _id: string | null;
  count: number;
}

interface MonthlyAggregateRow {
  _id: {
    year: number;
    month: number;
  };
  count: number;
}

interface RecentUserRow {
  _id: string;
  name: string;
  role: string;
  createdAt: Date | string;
}

interface RecentJobRow {
  _id: string;
  title: string;
  status: string;
  createdAt: Date | string;
}

interface RecentApplicationRow {
  _id: string;
  status: string;
  appliedAt?: Date | string;
  createdAt: Date | string;
}

interface MonthlyTrendPoint {
  key: string;
  label: string;
  jobs: number;
  applications: number;
}

interface AdminStats {
  totalUsers: number;
  newUsersThisMonth: number;
  newUsersPreviousMonth: number;
  activeJobs: number;
  jobsCreatedThisMonth: number;
  jobsCreatedPreviousMonth: number;
  totalApplications: number;
  applicationsThisMonth: number;
  applicationsPreviousMonth: number;
  totalInterviews: number;
  totalPlacements: number;
  inactiveEmployers: number;
  usersByRole: UsersByRoleRow[];
  monthlyTrend: MonthlyTrendPoint[];
  recentUsers: RecentUserRow[];
  recentJobs: RecentJobRow[];
  recentApplications: RecentApplicationRow[];
}

type TrendDirection = "up" | "down" | "flat";

interface TrendSummary {
  direction: TrendDirection;
  label: string;
}

interface KpiCard {
  label: string;
  value: string;
  detail: string;
  insight: ReactNode;
  toneClassName: string;
  icon: LucideIcon;
  trend: TrendSummary;
  trendClassName: string;
  href: string;
}

interface RecentActivityItem {
  id: string;
  title: string;
  detail: string;
  href: string;
  timestamp: Date;
  timestampLabel: string;
  icon: LucideIcon;
  toneClassName: string;
}

interface QuickAction {
  label: string;
  href: string;
  desc: string;
  badge: string;
  icon: LucideIcon;
  iconClassName: string;
  badgeClassName: string;
  badgeNode?: ReactNode;
}

type DashboardTranslator = Awaited<ReturnType<typeof getTranslations>>;

const adminPanelClassName =
  "workspace-panel-surface rounded-[28px] p-6 sm:p-7";

const adminCardClassName =
  "workspace-glass-panel rounded-2xl";

const adminInteractiveCardClassName =
  "workspace-subtle-surface rounded-2xl transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:bg-card hover:shadow-[0_24px_50px_-38px_rgba(2,132,199,0.38)]";

const adminStatPanelClassName =
  "workspace-glass-panel rounded-2xl p-4 text-left";

function buildMonthBuckets(now: Date, totalMonths: number, locale: string) {
  return Array.from({ length: totalMonths }, (_, index) => {
    const offset = totalMonths - index - 1;
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);

    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      key: `${date.getFullYear()}-${date.getMonth() + 1}`,
      label: date.toLocaleDateString(locale, { month: "short" }),
      start: date,
    };
  });
}

function mapMonthlyCounts(rows: MonthlyAggregateRow[]) {
  return rows.reduce<Map<string, number>>((accumulator, row) => {
    accumulator.set(`${row._id.year}-${row._id.month}`, row.count);
    return accumulator;
  }, new Map<string, number>());
}

function getApplicationDateFilter(start: Date, end?: Date) {
  const appliedAtRange = end ? { $gte: start, $lt: end } : { $gte: start };
  const createdAtRange = end ? { $gte: start, $lt: end } : { $gte: start };

  return {
    $or: [
      { appliedAt: appliedAtRange },
      {
        $and: [
          { $or: [{ appliedAt: { $exists: false } }, { appliedAt: null }] },
          { createdAt: createdAtRange },
        ],
      },
    ],
  };
}

function getTrendSummary(
  current: number,
  previous: number,
  suffix: string,
  t: DashboardTranslator,
): TrendSummary {
  if (current === previous) {
    return {
      direction: "flat",
      label: t("trend.flat", { suffix }),
    };
  }

  if (previous === 0) {
    return {
      direction: current > 0 ? "up" : "flat",
      label: current > 0 ? t("trend.count", { count: current, suffix }) : t("trend.flat", { suffix }),
    };
  }

  const delta = ((current - previous) / previous) * 100;
  const roundedDelta = Math.round(delta);

  return {
    direction: delta > 0 ? "up" : "down",
    label: t("trend.percent", { value: roundedDelta > 0 ? `+${roundedDelta}` : roundedDelta, suffix }),
  };
}

function getTrendClassName(direction: TrendDirection, positiveWhenDown = false) {
  const effectiveDirection = positiveWhenDown
    ? direction === "up"
      ? "down"
      : direction === "down"
        ? "up"
        : "flat"
    : direction;

  if (effectiveDirection === "up") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (effectiveDirection === "down") {
    return "bg-rose-100 text-rose-700";
  }

  return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
}

function formatRoleLabel(role: string | null | undefined, t: DashboardTranslator) {
  switch (role) {
    case "admin":
      return t("roles.admin");
    case "super_agent":
      return t("roles.superAgent");
    case "agent":
      return t("roles.agent");
    case "employer":
      return t("roles.employer");
    case "job_seeker":
      return t("roles.jobSeeker");
    default:
      return t("roles.unknown");
  }
}

function formatStatusLabel(status: string | null | undefined, t: DashboardTranslator) {
  switch (status) {
    case "active":
      return t("statuses.active");
    case "draft":
      return t("statuses.draft");
    case "closed":
      return t("statuses.closed");
    case "expired":
      return t("statuses.expired");
    case "applied":
      return t("statuses.applied");
    case "interview_scheduled":
      return t("statuses.interviewScheduled");
    case "selected":
      return t("statuses.selected");
    case "offer":
      return t("statuses.offer");
    case "hired":
      return t("statuses.hired");
    case "shortlisted":
      return t("statuses.shortlisted");
    case "rejected":
      return t("statuses.rejected");
    case "withdrawn":
      return t("statuses.withdrawn");
    default:
      return t("statuses.unknown");
  }
}

function formatDateLabel(value: Date | string | undefined, locale: string, t: DashboardTranslator) {
  if (!value) {
    return t("dates.unknown");
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return t("dates.unknown");
  }

  return date.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
  });
}

function getRoleInsight(percentage: number, isDominant: boolean, t: DashboardTranslator) {
  if (isDominant) {
    return t("roleInsights.dominant");
  }

  if (percentage < 15) {
    return t("roleInsights.underrepresented");
  }

  return t("roleInsights.healthy");
}

function buildLinePoints(values: number[], width: number, height: number, padding: number, maxValue: number) {
  const safeValues = values.length > 0 ? values : [0];
  const normalizedMaxValue = Math.max(1, maxValue);
  const usableWidth = Math.max(1, width - padding * 2);
  const usableHeight = Math.max(1, height - padding * 2);

  return safeValues.map((value, index) => {
    const x = padding + (usableWidth / Math.max(1, safeValues.length - 1)) * index;
    const y = height - padding - (value / normalizedMaxValue) * usableHeight;
    return { x, y };
  });
}

function buildSvgPath(points: Array<{ x: number; y: number }>) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

async function getFastStats(locale: string): Promise<AdminStats> {
  await connectDB();

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthBuckets = buildMonthBuckets(now, 6, locale);
  const monthlyWindowStart = monthBuckets[0]?.start ?? new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalUsers,
    newUsersThisMonth,
    newUsersPreviousMonth,
    inactiveEmployers,
    activeJobs,
    jobsCreatedThisMonth,
    jobsCreatedPreviousMonth,
    totalApplications,
    applicationsThisMonth,
    applicationsPreviousMonth,
    totalPlacements,
    totalInterviews,
    usersByRole,
    monthlyJobsRows,
    recentJobs,
    monthlyApplicationsRows,
    recentApplications,
    recentUsers,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
    User.countDocuments({ createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo } }),
    User.countDocuments({
      role: "employer",
      $or: [{ lastLogin: { $lt: sevenDaysAgo } }, { lastLogin: { $exists: false } }, { lastLogin: null }],
    }),
    Job.countDocuments({ status: "active", deletedAt: null }),
    Job.countDocuments({ createdAt: { $gte: thirtyDaysAgo }, deletedAt: null }),
    Job.countDocuments({ createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo }, deletedAt: null }),
    Application.countDocuments(),
    Application.countDocuments(getApplicationDateFilter(thirtyDaysAgo)),
    Application.countDocuments(getApplicationDateFilter(sixtyDaysAgo, thirtyDaysAgo)),
    Placement.countDocuments(),
    Interview.countDocuments(),
    User.aggregate<UsersByRoleRow>([
      { $group: { _id: "$role", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Job.aggregate<MonthlyAggregateRow>([
      { $match: { createdAt: { $gte: monthlyWindowStart } } },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]),
    Job.aggregate<RecentJobRow>([
      { $sort: { createdAt: -1 } },
      { $limit: 4 },
      {
        $project: {
          title: 1,
          status: 1,
          createdAt: 1,
        },
      },
    ]),
    Application.aggregate<MonthlyAggregateRow>([
      {
        $addFields: {
          effectiveAppliedAt: { $ifNull: ["$appliedAt", "$createdAt"] },
        },
      },
      { $match: { effectiveAppliedAt: { $gte: monthlyWindowStart } } },
      {
        $group: {
          _id: {
            year: { $year: "$effectiveAppliedAt" },
            month: { $month: "$effectiveAppliedAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]),
    Application.aggregate<RecentApplicationRow>([
      {
        $addFields: {
          effectiveAppliedAt: { $ifNull: ["$appliedAt", "$createdAt"] },
        },
      },
      { $sort: { effectiveAppliedAt: -1 } },
      { $limit: 4 },
      {
        $project: {
          status: 1,
          appliedAt: 1,
          createdAt: 1,
        },
      },
    ]),
    User.aggregate<RecentUserRow>([
      { $sort: { createdAt: -1 } },
      { $limit: 4 },
      {
        $project: {
          name: 1,
          role: 1,
          createdAt: 1,
        },
      },
    ]),
  ]);

  const jobCountsByMonth = mapMonthlyCounts(monthlyJobsRows);
  const applicationCountsByMonth = mapMonthlyCounts(monthlyApplicationsRows);
  const monthlyTrend = monthBuckets.map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    jobs: jobCountsByMonth.get(bucket.key) ?? 0,
    applications: applicationCountsByMonth.get(bucket.key) ?? 0,
  }));

  return {
    totalUsers,
    newUsersThisMonth,
    newUsersPreviousMonth,
    activeJobs,
    jobsCreatedThisMonth,
    jobsCreatedPreviousMonth,
    totalApplications,
    applicationsThisMonth,
    applicationsPreviousMonth,
    totalInterviews,
    totalPlacements,
    inactiveEmployers,
    usersByRole,
    monthlyTrend,
    recentUsers,
    recentJobs,
    recentApplications,
  };
}

export default async function AdminDashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const session = await auth();
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("adminDashboard");

  if (!session?.user) {
    redirect(`/${locale}/login`);
  }

  const stats = await getFastStats(locale);
  const dominantRole = stats.usersByRole[0];
  const applicationsPerActiveJob = stats.activeJobs > 0 ? stats.totalApplications / stats.activeJobs : 0;
  const placementRate = stats.totalApplications > 0 ? (stats.totalPlacements / stats.totalApplications) * 100 : 0;

  const KNOWN_ROLES = new Set(["admin", "super_agent", "agent", "employer", "job_seeker"]);
  const knownRoles = stats.usersByRole.filter((role) => KNOWN_ROLES.has(String(role._id)));
  const otherCount = stats.usersByRole
    .filter((role) => !KNOWN_ROLES.has(String(role._id)))
    .reduce((sum, role) => sum + role.count, 0);
  const mergedRoles = otherCount > 0 ? [...knownRoles, { _id: null, count: otherCount }] : knownRoles;

  const roleDistribution = mergedRoles.map((role, index) => {
    const percentage = stats.totalUsers > 0 ? Math.round((role.count / stats.totalUsers) * 100) : 0;

    return {
      ...role,
      percentage,
      label: formatRoleLabel(role._id, t),
      insight: getRoleInsight(percentage, index === 0, t),
      isDominant: index === 0,
    };
  });

  const trendSuffix = t("trend.vsLastMonth");
  const usersTrend = getTrendSummary(stats.newUsersThisMonth, stats.newUsersPreviousMonth, trendSuffix, t);
  const jobsTrend = getTrendSummary(stats.jobsCreatedThisMonth, stats.jobsCreatedPreviousMonth, trendSuffix, t);
  const applicationsTrend = getTrendSummary(stats.applicationsThisMonth, stats.applicationsPreviousMonth, trendSuffix, t);

  const kpis: KpiCard[] = [
    {
      label: t("kpis.totalUsers.label"),
      value: stats.totalUsers.toLocaleString(locale),
      detail: t("kpis.totalUsers.detail", { count: stats.newUsersThisMonth }),
      insight: dominantRole
        ? t("kpis.totalUsers.dominant", { role: formatRoleLabel(dominantRole._id, t) })
        : t("kpis.totalUsers.fallback"),
      toneClassName: "bg-sky-500 text-white ring-sky-400/30 dark:bg-sky-600 dark:text-white dark:ring-sky-400/30",
      icon: Users,
      trend: usersTrend,
      trendClassName: getTrendClassName(usersTrend.direction),
      href: `/${locale}/admin/users`,
    },
    {
      label: t("kpis.activeJobs.label"),
      value: stats.activeJobs.toLocaleString(locale),
      detail: t("kpis.activeJobs.detail", { count: stats.jobsCreatedThisMonth }),
      insight: (
        <Suspense fallback={<InsightTextSkeleton />}>
          <KpiActiveJobsInsightText />
        </Suspense>
      ),
      toneClassName: "bg-emerald-500 text-white ring-emerald-400/30 dark:bg-emerald-600 dark:text-white dark:ring-emerald-400/30",
      icon: Briefcase,
      trend: jobsTrend,
      trendClassName: getTrendClassName(jobsTrend.direction),
      href: `/${locale}/admin/jobs`,
    },
    {
      label: t("kpis.totalApplications.label"),
      value: stats.totalApplications.toLocaleString(locale),
      detail: t("kpis.totalApplications.detail", { count: stats.applicationsThisMonth }),
      insight: t("kpis.totalApplications.insight", { value: applicationsPerActiveJob.toFixed(1) }),
      toneClassName: "bg-violet-500 text-white ring-violet-400/30 dark:bg-violet-600 dark:text-white dark:ring-violet-400/30",
      icon: FileText,
      trend: applicationsTrend,
      trendClassName: getTrendClassName(applicationsTrend.direction),
      href: `/${locale}/admin/applications`,
    },
    {
      label: t("kpis.totalInterviews.label"),
      value: stats.totalInterviews.toLocaleString(locale),
      detail: t("kpis.totalInterviews.detail", { count: stats.totalInterviews }),
      insight: stats.totalInterviews > 0
        ? t("kpis.totalInterviews.active")
        : t("kpis.totalInterviews.empty"),
      toneClassName: "bg-amber-500 text-white ring-amber-400/30 dark:bg-amber-600 dark:text-white dark:ring-amber-400/30",
      icon: Activity,
      trend: { direction: stats.totalInterviews > 0 ? "up" : "flat", label: t("trend.total", { count: stats.totalInterviews }) },
      trendClassName: getTrendClassName(stats.totalInterviews > 0 ? "up" : "flat"),
      href: `/${locale}/admin/interviews`,
    },
  ];

  const quickActions: QuickAction[] = [
    {
      label: t("quickActions.jobsOverview.label"),
      href: `/${locale}/admin/jobs`,
      desc: t("quickActions.jobsOverview.desc"),
      badge: t("quickActions.jobsOverview.badge", { count: stats.activeJobs }),
      icon: Briefcase,
      iconClassName: "bg-emerald-50 text-emerald-600",
      badgeClassName: "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200",
    },
    {
      label: t("quickActions.userManagement.label"),
      href: `/${locale}/admin/users`,
      desc: t("quickActions.userManagement.desc"),
      badge: t("quickActions.userManagement.badge", { count: stats.inactiveEmployers }),
      icon: Users,
      iconClassName: "bg-sky-50 text-sky-600",
      badgeClassName: "bg-sky-100 text-sky-900 ring-1 ring-sky-200",
    },
    {
      label: t("quickActions.jobsManagement.label"),
      href: `/${locale}/admin/jobs`,
      desc: t("quickActions.jobsManagement.desc"),
      badge: "",
      badgeNode: (
        <Suspense fallback={<BadgeSkeleton />}>
          <QuickActionHealthBadge />
        </Suspense>
      ),
      icon: Briefcase,
      iconClassName: "bg-emerald-50 text-emerald-600",
      badgeClassName: "",
    },
    {
      label: t("quickActions.auditLogs.label"),
      href: `/${locale}/admin/audit-logs`,
      desc: t("quickActions.auditLogs.desc"),
      badge: t("quickActions.auditLogs.badge"),
      icon: Activity,
      iconClassName: "bg-slate-100 text-slate-600",
      badgeClassName: "bg-slate-100 text-slate-800 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700",
    },
    {
      label: t("quickActions.analytics.label"),
      href: `/${locale}/admin/analytics`,
      desc: t("quickActions.analytics.desc"),
      badge: t("quickActions.analytics.badge", { count: stats.totalInterviews }),
      icon: TrendingUp,
      iconClassName: "bg-violet-50 text-violet-600",
      badgeClassName: "bg-violet-100 text-violet-900 ring-1 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-200 dark:ring-violet-500/20",
    },

  ];

  const recentActivity: RecentActivityItem[] = [
    ...stats.recentUsers.map((user) => ({
      id: `user-${user._id}`,
      title: t("recent.userJoined", { name: user.name, role: formatRoleLabel(user.role, t) }),
      detail: t("recent.userDetail"),
      href: `/${locale}/admin/users`,
      timestamp: new Date(user.createdAt),
      timestampLabel: formatDateLabel(user.createdAt, locale, t),
      icon: UserPlus,
      toneClassName: "bg-sky-50 text-sky-600",
    })),
    ...stats.recentJobs.map((job) => ({
      id: `job-${job._id}`,
      title: t("recent.jobPosted", { title: job.title }),
      detail: formatStatusLabel(job.status, t),
      href: `/${locale}/admin/jobs`,
      timestamp: new Date(job.createdAt),
      timestampLabel: formatDateLabel(job.createdAt, locale, t),
      icon: Briefcase,
      toneClassName: "bg-emerald-50 text-emerald-600",
    })),
    ...stats.recentApplications.map((application) => ({
      id: `application-${application._id}`,
      title: application.status === "applied"
        ? t("recent.applicationNew")
        : t("recent.applicationMoved", { status: formatStatusLabel(application.status, t) }),
      detail: t("recent.applicationDetail"),
      href: `/${locale}/admin/analytics`,
      timestamp: new Date(application.appliedAt ?? application.createdAt),
      timestampLabel: formatDateLabel(application.appliedAt ?? application.createdAt, locale, t),
      icon: FileText,
      toneClassName: "bg-violet-50 text-violet-600",
    })),
  ]
    .filter((activity) => !Number.isNaN(activity.timestamp.getTime()))
    .sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime())
    .slice(0, 6);

  const chartWidth = 560;
  const chartHeight = 220;
  const chartPadding = 22;
  const chartMaxValue = Math.max(
    1,
    ...stats.monthlyTrend.flatMap((point) => [point.jobs, point.applications]),
  );
  const jobsLinePoints = buildLinePoints(
    stats.monthlyTrend.map((point) => point.jobs),
    chartWidth,
    chartHeight,
    chartPadding,
    chartMaxValue,
  );
  const applicationsLinePoints = buildLinePoints(
    stats.monthlyTrend.map((point) => point.applications),
    chartWidth,
    chartHeight,
    chartPadding,
    chartMaxValue,
  );

  const funnelStages = [
    { label: t("funnel.jobs"), count: stats.activeJobs, toneClassName: "from-blue-600 to-sky-500" },
    { label: t("funnel.applications"), count: stats.totalApplications, toneClassName: "from-violet-600 to-fuchsia-500" },
    { label: t("funnel.interviews"), count: stats.totalInterviews, toneClassName: "from-amber-500 to-orange-500" },
    { label: t("funnel.placements"), count: stats.totalPlacements, toneClassName: "from-emerald-600 to-green-500" },
  ];
  const funnelMax = Math.max(1, ...funnelStages.map((stage) => stage.count));

  return (
    <div className="page-container space-y-6 pb-6">
      <section
        className="workspace-hero-surface overflow-hidden rounded-[28px] p-7 sm:p-8"
        data-surface="light-hero"
      >
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              {t("hero.eyebrow")}
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
              {t("hero.title")}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
              {t("hero.description")}
            </p>
          </div>

          <div className={`${adminStatPanelClassName} sm:min-w-[320px]`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("systemWatch.eyebrow")}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{t("systemWatch.activeJobs", { count: stats.activeJobs })}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {t("systemWatch.applications", { count: stats.totalApplications })}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="workspace-glass-panel rounded-2xl px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("systemWatch.demand")}</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{applicationsPerActiveJob.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">{t("systemWatch.appsPerJob")}</p>
              </div>
              <div className="workspace-glass-panel rounded-2xl px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("systemWatch.conversion")}</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{placementRate.toFixed(0)}%</p>
                <p className="text-xs text-muted-foreground">{t("systemWatch.applicationsToPlacements")}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;

            return (
              <Link
                key={kpi.label}
                href={kpi.href}
                className="block"
              >
              <article
                className={`${adminCardClassName} p-6 cursor-pointer hover:ring-2 hover:ring-primary/20 transition-all`}
                data-surface="light-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{kpi.label}</p>
                    <p className="mt-4 text-3xl font-semibold tracking-tight text-foreground">{kpi.value}</p>
                  </div>
                  <div className={`rounded-2xl p-2.5 ring-1 ring-inset ${kpi.toneClassName}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
                <div className={`mt-4 inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold ${kpi.trendClassName}`}>
                  <TrendingUp className="h-3.5 w-3.5" />
                  {kpi.trend.label}
                </div>
                <p className="mt-4 text-sm font-medium leading-6 text-foreground">{kpi.detail}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{kpi.insight}</p>
              </article>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <section className={adminPanelClassName} data-surface="light-panel">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-foreground">{t("sections.quickActions.title")}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {t("sections.quickActions.description")}
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {quickActions.map((action, idx) => {
              const Icon = action.icon;

              return (
                <Link
                  key={`${action.href}-${idx}`}
                  href={action.href}
                  className={`${adminInteractiveCardClassName} group flex min-h-[176px] flex-col justify-between p-6`}
                  data-surface="light-card"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className={`rounded-2xl p-2.5 ${action.iconClassName}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    {action.badgeNode ?? (
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${action.badgeClassName}`}>
                        {action.badge}
                      </span>
                    )}
                  </div>
                  <div className="mt-5">
                    <p className="text-base font-semibold text-foreground">{action.label}</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{action.desc}</p>
                  </div>
                  <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                    {t("common.openWorkspace")}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className={adminPanelClassName} data-surface="light-panel">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-foreground">{t("sections.recentActivity.title")}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t("sections.recentActivity.description")}
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {recentActivity.map((activity) => {
              const Icon = activity.icon;

              return (
                <Link
                  key={activity.id}
                  href={activity.href}
                  className={`${adminInteractiveCardClassName} group flex items-start gap-3 px-5 py-5`}
                  data-surface="light-card"
                >
                  <div className={`rounded-2xl p-2.5 ring-1 ring-inset ${activity.toneClassName}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">{activity.title}</p>
                      <span className="shrink-0 text-xs font-medium text-muted-foreground">{activity.timestampLabel}</span>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{activity.detail}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <Suspense fallback={<PlatformInsightsSkeleton />}>
          <PlatformInsightsSection
            inactiveEmployers={stats.inactiveEmployers}
            totalPlacements={stats.totalPlacements}
            totalApplications={stats.totalApplications}
            locale={locale}
          />
        </Suspense>

        <section className={adminPanelClassName} data-surface="light-panel">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-foreground">{t("sections.hiringFunnel.title")}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t("sections.hiringFunnel.description")}
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 px-3 py-2 text-emerald-700 shadow-sm dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">{t("funnel.placements")}</p>
              <p className="mt-1 text-sm font-semibold">{t("sections.hiringFunnel.closed", { count: stats.totalPlacements })}</p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {funnelStages.map((stage, index) => {
              const nextStage = funnelStages[index + 1];
              const stageWidth = stage.count === 0 ? 18 : Math.max(34, Math.round((stage.count / funnelMax) * 100));
              const conversion = nextStage && stage.count > 0
                ? Math.round((nextStage.count / stage.count) * 100)
                : null;

              return (
                <div key={stage.label}>
                  <div className="flex items-center justify-between text-sm font-medium text-foreground">
                    <span>{stage.label}</span>
                    <span>{stage.count.toLocaleString()}</span>
                  </div>
                  <div className="mt-2 flex justify-center">
                    <div
                      aria-label={t("sections.hiringFunnel.stageAria", { label: stage.label, count: stage.count })}
                      className={stage.count === 0
                        ? "flex h-12 items-center justify-center rounded-[18px] border border-dashed border-slate-300 px-4 text-sm font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400"
                        : `flex h-12 items-center justify-center rounded-[18px] bg-gradient-to-r ${stage.toneClassName} px-4 text-sm font-semibold text-white shadow-[0_20px_50px_-40px_rgba(15,23,42,0.5)]`}
                      style={{ width: `${stageWidth}%` }}
                    >
                      {stage.count === 0 ? t("sections.hiringFunnel.noData", { label: stage.label }) : stage.label}
                    </div>
                  </div>
                  {conversion !== null ? (
                    <p className="mt-2 text-center text-xs text-muted-foreground">{t("sections.hiringFunnel.nextStage", { value: conversion })}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className={adminPanelClassName} data-surface="light-panel">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-foreground">{t("sections.trends.title")}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t("sections.trends.description")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3.5 py-1.5 text-blue-800 shadow-sm dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-100">
                <span className="h-2 w-2 rounded-full bg-blue-500" /> {t("funnel.jobs")}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3.5 py-1.5 text-violet-800 shadow-sm dark:border-violet-500/30 dark:bg-violet-500/15 dark:text-violet-100">
                <span className="h-2 w-2 rounded-full bg-violet-500" /> {t("funnel.applications")}
              </span>
            </div>
          </div>

          <div className="mt-6 rounded-[24px] border border-border/70 bg-card/95 p-4 shadow-sm backdrop-blur-sm">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              role="img"
              aria-label={t("sections.trends.chartAria")}
              className="h-[260px] w-full text-muted-foreground"
              preserveAspectRatio="none"
            >
              {[0.25, 0.5, 0.75, 1].map((tick) => {
                const y = chartHeight - chartPadding - (chartHeight - chartPadding * 2) * tick;

                return (
                  <g key={tick}>
                    <line
                      x1={chartPadding}
                      y1={y}
                      x2={chartWidth - chartPadding}
                      y2={y}
                      stroke="rgba(71,85,105,0.28)"
                      strokeDasharray="4 6"
                    />
                    <text x={4} y={y + 4} fill="currentColor" className="fill-current text-[10px]">
                      {Math.round(chartMaxValue * tick)}
                    </text>
                  </g>
                );
              })}

              <path d={buildSvgPath(jobsLinePoints)} fill="none" stroke="#3b82f6" strokeWidth="3.5" strokeLinecap="round" />
              <path d={buildSvgPath(applicationsLinePoints)} fill="none" stroke="#8b5cf6" strokeWidth="3.5" strokeLinecap="round" />

              {jobsLinePoints.map((point, index) => (
                <g key={`jobs-${stats.monthlyTrend[index]?.key ?? index}`}>
                  <circle cx={point.x} cy={point.y} r="4.5" fill="#3b82f6" />
                  <text x={point.x} y={chartHeight - 4} textAnchor="middle" fill="currentColor" className="fill-current text-[10px]">
                    {stats.monthlyTrend[index]?.label}
                  </text>
                </g>
              ))}

              {applicationsLinePoints.map((point, index) => (
                <circle key={`applications-${stats.monthlyTrend[index]?.key ?? index}`} cx={point.x} cy={point.y} r="4.5" fill="#8b5cf6" />
              ))}
            </svg>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div className={`${adminCardClassName} px-4 py-4`} data-surface="light-card">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("sections.trends.jobsOpened")}</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{stats.jobsCreatedThisMonth}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{t("sections.trends.jobsOpenedDesc")}</p>
            </div>
            <div className={`${adminCardClassName} px-4 py-4`} data-surface="light-card">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("sections.trends.applicationFlow")}</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{stats.applicationsThisMonth}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{t("sections.trends.applicationFlowDesc")}</p>
            </div>
            <div className={`${adminCardClassName} px-4 py-4`} data-surface="light-card">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("sections.trends.demandRatio")}</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{applicationsPerActiveJob.toFixed(1)}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{t("sections.trends.demandRatioDesc")}</p>
            </div>
          </div>
        </section>

        <section className={adminPanelClassName} data-surface="light-panel">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-foreground">{t("sections.usersByRole.title")}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t("sections.usersByRole.description")}
              </p>
            </div>
            {dominantRole ? (
              <div className="rounded-2xl border border-sky-100 bg-sky-50/70 px-3 py-2 text-right text-sky-700 shadow-sm dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-200">{t("roleInsights.dominant")}</p>
                <p className="mt-1 text-sm font-semibold text-sky-700 dark:text-sky-100">{formatRoleLabel(dominantRole._id, t)}</p>
              </div>
            ) : null}
          </div>

          <div className="mt-6 space-y-4">
            {roleDistribution.map((role, index) => (
              <div key={`${role._id ?? "unknown"}-${index}`} className={`${adminCardClassName} px-4 py-4`} data-surface="light-card">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[15px] font-semibold text-foreground">{role.label}</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{role.insight}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">{role.percentage}%</p>
                    <p className="text-xs text-muted-foreground">{t("sections.usersByRole.userCount", { count: role.count })}</p>
                  </div>
                </div>
                <div className="mt-4 h-2.5 overflow-hidden rounded-full border border-border/60 bg-background/95 shadow-inner">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(135deg,_rgba(14,165,233,0.92),_rgba(37,99,235,0.92))] transition-all duration-1000 ease-out"
                    style={{ width: `${Math.max(6, role.percentage)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

