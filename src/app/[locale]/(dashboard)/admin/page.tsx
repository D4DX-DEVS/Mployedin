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
  FileText,
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
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { DashboardNextAction, DashboardSignalStrip } from "@/components/shared/DashboardOverview";
import { formatCount } from "@/lib/ui/intlFormat";

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
  "workspace-panel-surface rounded-2xl p-4 sm:p-5";

const adminCardClassName =
  "workspace-glass-panel rounded-xl";

const adminInteractiveCardClassName =
  "workspace-subtle-surface rounded-2xl transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:bg-card hover:shadow-[0_24px_50px_-38px_rgba(2,132,199,0.38)]";

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

  return "bg-slate-100 text-slate-600";
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
      toneClassName: "bg-sky-500 text-white ring-sky-400/30",
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
      toneClassName: "bg-emerald-500 text-white ring-emerald-400/30",
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
      toneClassName: "bg-violet-500 text-white ring-violet-400/30",
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
      toneClassName: "bg-amber-500 text-white ring-amber-400/30",
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
      badgeClassName: "bg-slate-100 text-slate-800 ring-1 ring-slate-200",
    },
    {
      label: t("quickActions.analytics.label"),
      href: `/${locale}/admin/analytics`,
      desc: t("quickActions.analytics.desc"),
      badge: t("quickActions.analytics.badge", { count: stats.totalInterviews }),
      icon: TrendingUp,
      iconClassName: "bg-violet-50 text-violet-600",
      badgeClassName: "bg-violet-100 text-violet-900 ring-1 ring-violet-200",
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

  const nextAction = stats.inactiveEmployers > 0
    ? {
        title: t("quickActions.userManagement.label"),
        description: t("quickActions.userManagement.desc"),
        href: `/${locale}/admin/users`,
        icon: Users,
        badge: t("taskFirst.attention"),
      }
    : stats.totalInterviews === 0 && stats.totalApplications > 0
      ? {
          title: t("quickActions.analytics.label"),
          description: t("kpis.totalInterviews.empty"),
          href: `/${locale}/admin/analytics`,
          icon: TrendingUp,
          badge: t("taskFirst.investigate"),
        }
      : {
          title: t("quickActions.auditLogs.label"),
          description: t("quickActions.auditLogs.desc"),
          href: `/${locale}/admin/audit-logs`,
          icon: Activity,
          badge: t("taskFirst.review"),
        };

  const signals = kpis.map((kpi) => ({
    label: kpi.label,
    value: kpi.value,
    href: kpi.href,
    icon: kpi.icon,
  }));

  return (
    <div className="page-container dashboard-overview-page">
      <DashboardPageHeader
        icon={Activity}
        eyebrow={t("hero.eyebrow")}
        title={t("hero.title")}
        description={t("hero.description")}
        summary={{
          label: t("systemWatch.eyebrow"),
          value: t("systemWatch.activeJobs", { count: stats.activeJobs }),
          note: t("systemWatch.applications", { count: stats.totalApplications }),
        }}
      />

      <DashboardNextAction
        headingId="admin-next-action"
        title={t("taskFirst.recommendedNext")}
        description={t("taskFirst.nextDescription")}
        actionTitle={nextAction.title}
        actionDescription={nextAction.description}
        actionLabel={t("taskFirst.openAction")}
        href={nextAction.href}
        icon={nextAction.icon}
        badge={nextAction.badge}
      />

      <DashboardSignalStrip headingId="admin-signals" title={t("taskFirst.atAGlance")} signals={signals} />

      <div className="grid items-stretch gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <section className="workspace-panel-surface flex flex-col rounded-2xl panel-body" data-surface="light-panel">
          <div>
            <h2 className="heading-section font-semibold tracking-tight text-foreground">
              {t("sections.quickActions.title")}
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
              {t("sections.quickActions.description")}
            </p>
          </div>

          {/* auto-rows-fr = every card same height; the trailing odd card spans
              both columns instead of leaving a dead half-row gap. */}
          <div className="admin-quick-actions-grid mt-3 grid min-w-0 flex-1 auto-rows-fr grid-cols-1 gap-2 sm:grid-cols-2 sm:[&>a:last-child:nth-child(odd)]:col-span-2">
            {quickActions.map((action, idx) => {
              const Icon = action.icon;

              return (
                <Link
                  key={`${action.href}-${idx}`}
                  href={action.href}
                  className={`${adminInteractiveCardClassName} group flex w-full min-w-0 max-w-full items-start gap-2.5 overflow-hidden p-3`}
                  data-surface="light-card"
                >
                  <div className={`shrink-0 rounded-lg p-2 ${action.iconClassName}`}>
                    <Icon className="h-4 w-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    {/* flex-wrap so the badge drops to its own line instead of truncating
                        ("72 INACTIVE EMPLOY…") when it can't fit beside the label on phones. */}
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="min-w-0 flex-1 text-sm font-semibold leading-5 text-foreground">
                        {action.label}
                      </p>
                      {action.badgeNode ?? (
                        <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] ${action.badgeClassName}`}>
                          {action.badge}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 [overflow-wrap:anywhere] text-xs leading-4 text-muted-foreground">
                      {action.desc}
                    </p>
                  </div>

                  <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-primary transition-transform group-hover:translate-x-0.5 rtl:rotate-180" />
                </Link>
              );
            })}
          </div>
        </section>

        <section className="workspace-panel-surface flex flex-col rounded-2xl panel-body" data-surface="light-panel">
          <div>
            <h2 className="heading-section font-semibold tracking-tight text-foreground">
              {t("sections.recentActivity.title")}
            </h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {t("sections.recentActivity.description")}
            </p>
          </div>

          <div className="workspace-subtle-surface mt-3 overflow-hidden rounded-xl">
            {recentActivity.map((activity) => {
              const Icon = activity.icon;

              return (
                <Link
                  key={activity.id}
                  href={activity.href}
                  className="group flex items-start gap-2.5 border-b border-border/50 transition-colors last:border-b-0 hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary panel-head"
                  data-surface="light-card"
                >
                  <div className={`shrink-0 rounded-lg p-2 ring-1 ring-inset ${activity.toneClassName}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <p className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
                        {activity.title}
                      </p>
                      <span className="shrink-0 text-[10px] font-medium text-muted-foreground">
                        {activity.timestampLabel}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] leading-4 text-muted-foreground">
                      {activity.detail}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      </div>

      <div className="order-1 grid items-stretch gap-4 xl:grid-cols-[1.02fr_0.98fr]">
        <Suspense fallback={<PlatformInsightsSkeleton />}>
          <PlatformInsightsSection
            inactiveEmployers={stats.inactiveEmployers}
            totalPlacements={stats.totalPlacements}
            totalApplications={stats.totalApplications}
            locale={locale}
          />
        </Suspense>

        <section className={`${adminPanelClassName} flex flex-col`} data-surface="light-panel">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div>
              <h2 className="heading-section font-semibold tracking-tight text-foreground">{t("sections.hiringFunnel.title")}</h2>
              <p className="mt-2 text-xs leading-5 text-muted-foreground sm:text-sm sm:leading-6">
                {t("sections.hiringFunnel.description")}
              </p>
            </div>
            <div className="shrink-0 self-start rounded-2xl border border-emerald-100 bg-emerald-50/80 text-emerald-700 shadow-sm chip-pad">
              <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.16em] sm:text-[11px] sm:tracking-[0.18em]">{t("funnel.placements")}</p>
              <p className="mt-1 text-xs font-semibold sm:text-sm">{t("sections.hiringFunnel.closed", { count: stats.totalPlacements })}</p>
            </div>
          </div>

          <div className="mt-4 grid flex-1 auto-rows-fr grid-cols-2 gap-2.5">
            {funnelStages.map((stage, index) => {
              const nextStage = funnelStages[index + 1];
              const stageWidth = stage.count === 0 ? 0 : Math.max(6, Math.round((stage.count / funnelMax) * 100));
              const conversion = nextStage && stage.count > 0
                ? Math.round((nextStage.count / stage.count) * 100)
                : null;

              return (
                <div
                  key={stage.label}
                  aria-label={t("sections.hiringFunnel.stageAria", { label: stage.label, count: stage.count })}
                  className="workspace-glass-panel card-pad flex flex-col rounded-xl"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-xs font-semibold text-muted-foreground">{stage.label}</span>
                    <span className="text-xl font-semibold tracking-tight text-foreground">{formatCount(stage.count)}</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${stage.toneClassName}`}
                      style={{ width: `${stageWidth}%` }}
                    />
                  </div>
                  {conversion !== null ? (
                    <p className="mt-auto pt-2 text-[11px] text-muted-foreground">{t("sections.hiringFunnel.nextStage", { value: conversion })}</p>
                  ) : (
                    <p className="mt-auto pt-2 text-[11px] text-muted-foreground">
                      {stage.count === 0 ? t("sections.hiringFunnel.noData", { label: stage.label }) : t("sections.hiringFunnel.closed", { count: stage.count })}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="order-3 grid items-stretch gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <section className={`${adminPanelClassName} flex flex-col`} data-surface="light-panel">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="heading-section font-semibold tracking-tight text-foreground">{t("sections.trends.title")}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t("sections.trends.description")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3.5 py-1.5 text-blue-800 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-blue-500" /> {t("funnel.jobs")}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3.5 py-1.5 text-violet-800 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-violet-500" /> {t("funnel.applications")}
              </span>
            </div>
          </div>

          {/* Chart takes the slack so this panel matches its taller neighbour
              instead of ending in dead whitespace. */}
          <div className="mt-4 flex flex-1 rounded-2xl border border-border/70 bg-card/95 shadow-sm backdrop-blur-sm chip-pad">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              role="img"
              aria-label={t("sections.trends.chartAria")}
              className="h-full min-h-[190px] w-full text-muted-foreground"
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

          <div className="mt-4 grid shrink-0 grid-cols-3 gap-2 sm:gap-4">
            <div className={`${adminCardClassName} px-2.5 py-3 sm:px-4 sm:py-4`} data-surface="light-card">
              <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:text-[11px] sm:tracking-[0.18em]">{t("sections.trends.jobsOpened")}</p>
              <p className="mt-1.5 text-lg font-semibold tracking-tight text-foreground sm:mt-2 sm:text-2xl">{stats.jobsCreatedThisMonth}</p>
              <p className="mt-1 hidden text-sm leading-6 text-muted-foreground sm:block">{t("sections.trends.jobsOpenedDesc")}</p>
            </div>
            <div className={`${adminCardClassName} px-2.5 py-3 sm:px-4 sm:py-4`} data-surface="light-card">
              <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:text-[11px] sm:tracking-[0.18em]">{t("sections.trends.applicationFlow")}</p>
              <p className="mt-1.5 text-lg font-semibold tracking-tight text-foreground sm:mt-2 sm:text-2xl">{stats.applicationsThisMonth}</p>
              <p className="mt-1 hidden text-sm leading-6 text-muted-foreground sm:block">{t("sections.trends.applicationFlowDesc")}</p>
            </div>
            <div className={`${adminCardClassName} px-2.5 py-3 sm:px-4 sm:py-4`} data-surface="light-card">
              <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:text-[11px] sm:tracking-[0.18em]">{t("sections.trends.demandRatio")}</p>
              <p className="mt-1.5 text-lg font-semibold tracking-tight text-foreground sm:mt-2 sm:text-2xl">{applicationsPerActiveJob.toFixed(1)}</p>
              <p className="mt-1 hidden text-sm leading-6 text-muted-foreground sm:block">{t("sections.trends.demandRatioDesc")}</p>
            </div>
          </div>
        </section>

        <section className={`${adminPanelClassName} flex flex-col`} data-surface="light-panel">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div>
              <h2 className="heading-section font-semibold tracking-tight text-foreground">{t("sections.usersByRole.title")}</h2>
              <p className="mt-2 text-xs leading-5 text-muted-foreground sm:text-sm sm:leading-6">
                {t("sections.usersByRole.description")}
              </p>
            </div>
            {dominantRole ? (
              <div className="shrink-0 self-start rounded-2xl border border-sky-100 bg-sky-50/70 text-sky-700 shadow-sm sm:text-right chip-pad">
                <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-700 sm:text-[11px] sm:tracking-[0.18em]">{t("roleInsights.dominant")}</p>
                <p className="mt-1 text-xs font-semibold text-sky-700 sm:text-sm">{formatRoleLabel(dominantRole._id, t)}</p>
              </div>
            ) : null}
          </div>

          {/* One compact row per role instead of six stacked cards — six card
              blocks made this panel ~2x taller than the chart beside it. */}
          {/* Rows share the leftover height instead of leaving a gap under the
              list when the chart beside it is taller. Text size never changes. */}
          <div className="workspace-subtle-surface mt-4 flex flex-1 flex-col overflow-hidden rounded-xl">
            {roleDistribution.map((role, index) => (
              <div
                key={`${role._id ?? "unknown"}-${index}`}
                className="flex flex-1 items-center gap-3 border-b border-border/50 last:border-b-0 panel-head"
                data-surface="light-card"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <p className="shrink-0 text-[13px] font-semibold text-foreground">{role.label}</p>
                    <p className="min-w-0 truncate text-[11px] leading-4 text-muted-foreground">{role.insight}</p>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-background/95 ring-1 ring-inset ring-border/60">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(135deg,_rgba(14,165,233,0.92),_rgba(37,99,235,0.92))] transition-all duration-1000 ease-out"
                      style={{ width: `${Math.max(6, role.percentage)}%` }}
                    />
                  </div>
                </div>
                <div className="shrink-0 text-end">
                  <p className="text-[13px] font-semibold tabular-nums text-foreground">{role.percentage}%</p>
                  <p className="text-[10px] tabular-nums text-muted-foreground">
                    {t("sections.usersByRole.userCount", { count: role.count })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
