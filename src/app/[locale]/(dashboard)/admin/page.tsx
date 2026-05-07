import { auth } from "@/lib/auth/config";
import connectDB from "@/lib/db/mongoose";
import Application from "@/models/Application";
import Interview from "@/models/Interview";
import Job from "@/models/Job";
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
  jobsWithoutApplications: number;
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
  insight: string;
  toneClassName: string;
  icon: LucideIcon;
  trend: TrendSummary;
  trendClassName: string;
  href: string;
}

interface InsightItem {
  id: string;
  title: string;
  detail: string;
  action: string;
  href: string;
  tone: "critical" | "warning" | "positive";
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
}

const insightToneClasses: Record<InsightItem["tone"], string> = {
  critical:
    "rounded-[24px] border border-rose-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,241,242,0.98))] shadow-[0_24px_60px_-44px_rgba(244,63,94,0.18)] dark:border-rose-500/25 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(30,41,59,0.94))] dark:shadow-[0_24px_60px_-44px_rgba(244,63,94,0.2)]",
  warning:
    "rounded-[24px] border border-amber-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,251,235,0.98))] shadow-[0_24px_60px_-44px_rgba(245,158,11,0.16)] dark:border-amber-500/25 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(30,41,59,0.94))] dark:shadow-[0_24px_60px_-44px_rgba(245,158,11,0.18)]",
  positive:
    "rounded-[24px] border border-emerald-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(236,253,245,0.98))] shadow-[0_24px_60px_-44px_rgba(16,185,129,0.16)] dark:border-emerald-500/25 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(30,41,59,0.94))] dark:shadow-[0_24px_60px_-44px_rgba(16,185,129,0.18)]",
};

const insightBadgeClasses: Record<InsightItem["tone"], string> = {
  critical: "bg-rose-600 text-white",
  warning: "bg-amber-500 text-white",
  positive: "bg-emerald-600 text-white",
};

const insightTitleClasses: Record<InsightItem["tone"], string> = {
  critical: "text-slate-950 dark:text-slate-50",
  warning: "text-slate-950 dark:text-slate-50",
  positive: "text-slate-950 dark:text-slate-50",
};

const insightDetailClasses: Record<InsightItem["tone"], string> = {
  critical: "text-slate-600 dark:text-slate-300",
  warning: "text-slate-600 dark:text-slate-300",
  positive: "text-slate-600 dark:text-slate-300",
};

const insightActionClasses: Record<InsightItem["tone"], string> = {
  critical: "text-rose-700 hover:text-rose-800 dark:text-rose-200 dark:hover:text-rose-100",
  warning: "text-amber-700 hover:text-amber-800 dark:text-amber-200 dark:hover:text-amber-100",
  positive: "text-emerald-700 hover:text-emerald-800 dark:text-emerald-200 dark:hover:text-emerald-100",
};

const adminPanelClassName =
  "workspace-panel-surface rounded-[28px] p-6 sm:p-7";

const adminCardClassName =
  "workspace-glass-panel rounded-2xl";

const adminInteractiveCardClassName =
  "workspace-subtle-surface rounded-2xl transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:bg-card hover:shadow-[0_24px_50px_-38px_rgba(2,132,199,0.38)]";

const adminStatPanelClassName =
  "workspace-glass-panel rounded-2xl p-4 text-left";

function buildMonthBuckets(now: Date, totalMonths: number) {
  return Array.from({ length: totalMonths }, (_, index) => {
    const offset = totalMonths - index - 1;
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);

    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      key: `${date.getFullYear()}-${date.getMonth() + 1}`,
      label: date.toLocaleDateString(undefined, { month: "short" }),
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

function getTrendSummary(current: number, previous: number, suffix: string): TrendSummary {
  if (current === previous) {
    return {
      direction: "flat",
      label: `Flat ${suffix}`,
    };
  }

  if (previous === 0) {
    return {
      direction: current > 0 ? "up" : "flat",
      label: current > 0 ? `+${current} ${suffix}` : `Flat ${suffix}`,
    };
  }

  const delta = ((current - previous) / previous) * 100;
  const roundedDelta = Math.round(delta);

  return {
    direction: delta > 0 ? "up" : "down",
    label: `${roundedDelta > 0 ? "+" : ""}${roundedDelta}% ${suffix}`,
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

function formatRoleLabel(role: string | null | undefined) {
  return (role ?? "unknown")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatStatusLabel(status: string | null | undefined) {
  return (status ?? "unknown")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDateLabel(value: Date | string | undefined) {
  if (!value) {
    return "Unknown date";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function getRoleInsight(percentage: number, isDominant: boolean) {
  if (isDominant) {
    return "Dominant user group";
  }

  if (percentage < 15) {
    return "Underrepresented in the current mix";
  }

  return "Healthy share of platform access";
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

async function getAdminStats(): Promise<AdminStats> {
  await connectDB();

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthBuckets = buildMonthBuckets(now, 6);
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
    jobsWithoutApplicationsRows,
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
    Job.countDocuments({ status: "active" }),
    Job.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
    Job.countDocuments({ createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo } }),
    Application.countDocuments(),
    Application.countDocuments(getApplicationDateFilter(thirtyDaysAgo)),
    Application.countDocuments(getApplicationDateFilter(sixtyDaysAgo, thirtyDaysAgo)),
    Application.countDocuments({ status: "hired" }),
    Interview.countDocuments(),
    User.aggregate<UsersByRoleRow>([
      { $group: { _id: "$role", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Job.aggregate<{ count: number }>([
      { $match: { status: "active" } },
      {
        $lookup: {
          from: "applications",
          localField: "_id",
          foreignField: "jobId",
          as: "applications",
        },
      },
      { $addFields: { applicationCount: { $size: "$applications" } } },
      { $match: { applicationCount: 0 } },
      { $count: "count" },
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
    jobsWithoutApplications: jobsWithoutApplicationsRows[0]?.count ?? 0,
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

  if (!session?.user) {
    redirect(`/${locale}/login`);
  }

  const stats = await getAdminStats();
  const dominantRole = stats.usersByRole[0];
  const applicationsPerActiveJob = stats.activeJobs > 0 ? stats.totalApplications / stats.activeJobs : 0;
  const placementRate = stats.totalApplications > 0 ? (stats.totalPlacements / stats.totalApplications) * 100 : 0;

  const roleDistribution = stats.usersByRole.map((role, index) => {
    const percentage = stats.totalUsers > 0 ? Math.round((role.count / stats.totalUsers) * 100) : 0;

    return {
      ...role,
      percentage,
      label: formatRoleLabel(role._id),
      insight: getRoleInsight(percentage, index === 0),
      isDominant: index === 0,
    };
  });

  const usersTrend = getTrendSummary(stats.newUsersThisMonth, stats.newUsersPreviousMonth, "vs last month");
  const jobsTrend = getTrendSummary(stats.jobsCreatedThisMonth, stats.jobsCreatedPreviousMonth, "vs last month");
  const applicationsTrend = getTrendSummary(stats.applicationsThisMonth, stats.applicationsPreviousMonth, "vs last month");

  const kpis: KpiCard[] = [
    {
      label: "Total Users",
      value: stats.totalUsers.toLocaleString(),
      detail: `${stats.newUsersThisMonth} new accounts joined in the last 30 days.`,
      insight: dominantRole
        ? `${formatRoleLabel(dominantRole._id)} is still the dominant cohort.`
        : "Watch role distribution as new accounts come in.",
      toneClassName: "bg-sky-500 text-white ring-sky-400/30 dark:bg-sky-600 dark:text-white dark:ring-sky-400/30",
      icon: Users,
      trend: usersTrend,
      trendClassName: getTrendClassName(usersTrend.direction),
      href: `/${locale}/admin/users`,
    },
    {
      label: "Active Jobs",
      value: stats.activeJobs.toLocaleString(),
      detail: `${stats.jobsCreatedThisMonth} new roles opened in the last 30 days.`,
      insight: stats.jobsWithoutApplications > 0
        ? `${stats.jobsWithoutApplications} active roles still have zero applications.`
        : "Every active role is attracting candidate demand.",
      toneClassName: "bg-emerald-500 text-white ring-emerald-400/30 dark:bg-emerald-600 dark:text-white dark:ring-emerald-400/30",
      icon: Briefcase,
      trend: jobsTrend,
      trendClassName: getTrendClassName(jobsTrend.direction),
      href: `/${locale}/admin/jobs`,
    },
    {
      label: "Total Applications",
      value: stats.totalApplications.toLocaleString(),
      detail: `${stats.applicationsThisMonth} applications landed in the last 30 days.`,
      insight: `${applicationsPerActiveJob.toFixed(1)} applications per active job across the platform.`,
      toneClassName: "bg-violet-500 text-white ring-violet-400/30 dark:bg-violet-600 dark:text-white dark:ring-violet-400/30",
      icon: FileText,
      trend: applicationsTrend,
      trendClassName: getTrendClassName(applicationsTrend.direction),
      href: `/${locale}/admin/applications`,
    },
    {
      label: "Total Interviews",
      value: stats.totalInterviews.toLocaleString(),
      detail: `${stats.totalInterviews} interviews have been scheduled across the platform.`,
      insight: stats.totalInterviews > 0
        ? "Interview pipeline is active and progressing."
        : "No interviews scheduled yet — encourage employer engagement.",
      toneClassName: "bg-amber-500 text-white ring-amber-400/30 dark:bg-amber-600 dark:text-white dark:ring-amber-400/30",
      icon: Activity,
      trend: { direction: stats.totalInterviews > 0 ? "up" : "flat", label: `${stats.totalInterviews} total` },
      trendClassName: getTrendClassName(stats.totalInterviews > 0 ? "up" : "flat"),
      href: `/${locale}/admin/interviews`,
    },
  ];

  const insights: InsightItem[] = [
    {
      id: "job-demand",
      title: stats.jobsWithoutApplications > 0
        ? `${stats.jobsWithoutApplications} active jobs are missing applicant demand`
        : "Job demand is healthy across live roles",
      detail: stats.jobsWithoutApplications > 0
        ? "Review job copy, sourcing, or distribution before roles go stale."
        : "No active role is sitting without at least one application.",
      action: stats.jobsWithoutApplications > 0 ? "View Jobs" : "Open Jobs Workspace",
      href: `/${locale}/admin/jobs`,
      tone: stats.jobsWithoutApplications > 0 ? "warning" : "positive",
    },
    {
      id: "employer-activity",
      title: stats.inactiveEmployers > 0
        ? `${stats.inactiveEmployers} employers have been inactive for 7+ days`
        : "Employer activity has stayed warm this week",
      detail: stats.inactiveEmployers > 0
        ? "Re-engage accounts before new jobs or candidate reviews stall."
        : "Recent logins suggest the employer side is moving steadily.",
      action: stats.inactiveEmployers > 0 ? "Fix Now" : "Open User Management",
      href: `/${locale}/admin/users`,
      tone: stats.inactiveEmployers > 4 ? "critical" : stats.inactiveEmployers > 0 ? "warning" : "positive",
    },
    {
      id: "conversion",
      title: placementRate < 15
        ? "Application-to-placement conversion is below target"
        : "Placement conversion is holding up",
      detail: placementRate < 15
        ? `Only ${placementRate.toFixed(0)}% of applications have converted into placements so far.`
        : `${placementRate.toFixed(0)}% of applications are converting into placements.`,
      action: placementRate < 15 ? "Fix Now" : "Inspect Analytics",
      href: `/${locale}/admin/analytics`,
      tone: placementRate < 8 ? "critical" : placementRate < 15 ? "warning" : "positive",
    },
  ];

  const quickActions: QuickAction[] = [
    {
      label: "Jobs Overview",
      href: `/${locale}/admin/jobs`,
      desc: "Monitor role quality, demand, and activity across the platform.",
      badge: `${stats.activeJobs} active`,
      icon: Briefcase,
      iconClassName: "bg-emerald-50 text-emerald-600",
      badgeClassName: "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200",
    },
    {
      label: "User Management",
      href: `/${locale}/admin/users`,
      desc: "Adjust roles, access, and follow up on inactive cohorts.",
      badge: `${stats.inactiveEmployers} inactive employers`,
      icon: Users,
      iconClassName: "bg-sky-50 text-sky-600",
      badgeClassName: "bg-sky-100 text-sky-900 ring-1 ring-sky-200",
    },
    {
      label: "Jobs Management",
      href: `/${locale}/admin/jobs`,
      desc: "Audit role quality, demand, and activity from one queue.",
      badge: `${stats.jobsWithoutApplications} low-demand roles`,
      icon: Briefcase,
      iconClassName: "bg-emerald-50 text-emerald-600",
      badgeClassName: stats.jobsWithoutApplications > 0
        ? "bg-amber-100 text-amber-900 ring-1 ring-amber-200"
        : "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200",
    },
    {
      label: "Audit Logs",
      href: `/${locale}/admin/audit-logs`,
      desc: "Review sensitive changes, security events, and governance trails.",
      badge: "Security trail",
      icon: Activity,
      iconClassName: "bg-slate-100 text-slate-600",
      badgeClassName: "bg-slate-100 text-slate-800 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700",
    },
    {
      label: "Analytics",
      href: `/${locale}/admin/analytics`,
      desc: "Investigate trend shifts, conversion pressure, and market movement.",
      badge: `${stats.totalInterviews} interviews tracked`,
      icon: TrendingUp,
      iconClassName: "bg-violet-50 text-violet-600",
      badgeClassName: "bg-violet-100 text-violet-900 ring-1 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-200 dark:ring-violet-500/20",
    },
    {
      label: "Task Board",
      href: `/${locale}/admin/tasks`,
      desc: "Keep launches, fixes, and admin follow-through visible to the team.",
      badge: "Execution lane",
      icon: CheckCircle2,
      iconClassName: "bg-emerald-50 text-emerald-600",
      badgeClassName: "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-emerald-500/20",
    },
  ];

  const recentActivity: RecentActivityItem[] = [
    ...stats.recentUsers.map((user) => ({
      id: `user-${user._id}`,
      title: `${user.name} joined as ${formatRoleLabel(user.role)}`,
      detail: "New access footprint added to the platform mix.",
      href: `/${locale}/admin/users`,
      timestamp: new Date(user.createdAt),
      timestampLabel: formatDateLabel(user.createdAt),
      icon: UserPlus,
      toneClassName: "bg-sky-50 text-sky-600",
    })),
    ...stats.recentJobs.map((job) => ({
      id: `job-${job._id}`,
      title: `${job.title} was posted`,
      detail: `${formatStatusLabel(job.status)}`,
      href: `/${locale}/admin/jobs`,
      timestamp: new Date(job.createdAt),
      timestampLabel: formatDateLabel(job.createdAt),
      icon: Briefcase,
      toneClassName: "bg-emerald-50 text-emerald-600",
    })),
    ...stats.recentApplications.map((application) => ({
      id: `application-${application._id}`,
      title: application.status === "applied"
        ? "New application entered the hiring funnel"
        : `Application moved to ${formatStatusLabel(application.status)}`,
      detail: "Use analytics and follow-up workflows before momentum drops.",
      href: `/${locale}/admin/analytics`,
      timestamp: new Date(application.appliedAt ?? application.createdAt),
      timestampLabel: formatDateLabel(application.appliedAt ?? application.createdAt),
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
    { label: "Jobs", count: stats.activeJobs, toneClassName: "from-blue-600 to-sky-500" },
    { label: "Applications", count: stats.totalApplications, toneClassName: "from-violet-600 to-fuchsia-500" },
    { label: "Interviews", count: stats.totalInterviews, toneClassName: "from-amber-500 to-orange-500" },
    { label: "Placements", count: stats.totalPlacements, toneClassName: "from-emerald-600 to-green-500" },
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
              Admin workspace
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
              Admin Dashboard
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
              Platform overview, operational metrics, and shortcuts in a more action-oriented workspace that tells admin teams where to move next.
            </p>
          </div>

          <div className={`${adminStatPanelClassName} sm:min-w-[320px]`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">System watch</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{stats.activeJobs} active jobs</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {stats.totalApplications} platform applications are currently moving through the funnel.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="workspace-glass-panel rounded-2xl px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Demand</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{applicationsPerActiveJob.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">apps per active job</p>
              </div>
              <div className="workspace-glass-panel rounded-2xl px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Conversion</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{placementRate.toFixed(0)}%</p>
                <p className="text-xs text-muted-foreground">applications to placements</p>
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
              <h2 className="text-xl font-semibold tracking-tight text-foreground">Quick Actions</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Jump straight into the admin flows that keep governance and platform quality moving.
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
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${action.badgeClassName}`}>
                      {action.badge}
                    </span>
                  </div>
                  <div className="mt-5">
                    <p className="text-base font-semibold text-foreground">{action.label}</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{action.desc}</p>
                  </div>
                  <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                    Open workspace
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
              <h2 className="text-xl font-semibold tracking-tight text-foreground">Recent Activity</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Keep the dashboard alive with the latest account, job, and funnel movement.
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
        <section className={adminPanelClassName} data-surface="light-panel">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-foreground">Platform Insights</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Turn raw volume into next-step decisions before demand or conversion slip out of view.
              </p>
            </div>
            <div className="rounded-2xl border border-sky-100 bg-sky-50/70 px-3 py-2 text-right text-sky-700 shadow-sm dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">Insight engine</p>
              <p className="mt-1 text-sm font-semibold">Action-first heuristics</p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {insights.map((insight) => (
              <article
                key={insight.id}
                className={`p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_28px_60px_-44px_rgba(15,23,42,0.16)] ${insightToneClasses[insight.tone]}`}
                data-surface="light-card"
                data-tone={insight.tone}
              >
                <div className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${insightBadgeClasses[insight.tone]}`}>
                  {insight.tone === "critical" ? "Critical" : insight.tone === "warning" ? "Attention" : "Stable"}
                </div>
                <h3 className={`mt-4 text-lg font-semibold tracking-tight ${insightTitleClasses[insight.tone]}`}>{insight.title}</h3>
                <p className={`mt-2 text-sm leading-6 ${insightDetailClasses[insight.tone]}`}>{insight.detail}</p>
                <Link
                  href={insight.href}
                  className={`mt-5 inline-flex items-center gap-2 text-sm font-semibold transition-colors ${insightActionClasses[insight.tone]}`}
                >
                  {insight.action}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section className={adminPanelClassName} data-surface="light-panel">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-foreground">Hiring Funnel</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Spot where volume compresses between live roles, applications, interviews, and placements.
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 px-3 py-2 text-emerald-700 shadow-sm dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">Placements</p>
              <p className="mt-1 text-sm font-semibold">{stats.totalPlacements} closed</p>
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
                      aria-label={`${stage.label}: ${stage.count}`}
                      className={stage.count === 0
                        ? "flex h-12 items-center justify-center rounded-[18px] border border-dashed border-slate-300 px-4 text-sm font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400"
                        : `flex h-12 items-center justify-center rounded-[18px] bg-gradient-to-r ${stage.toneClassName} px-4 text-sm font-semibold text-white shadow-[0_20px_50px_-40px_rgba(15,23,42,0.5)]`}
                      style={{ width: `${stageWidth}%` }}
                    >
                      {stage.count === 0 ? `${stage.label} · No data` : stage.label}
                    </div>
                  </div>
                  {conversion !== null ? (
                    <p className="mt-2 text-center text-xs text-muted-foreground">{conversion}% move to the next stage</p>
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
              <h2 className="text-xl font-semibold tracking-tight text-foreground">Jobs vs Applications</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                See whether demand is tracking alongside role creation over the last six months.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3.5 py-1.5 text-blue-800 shadow-sm dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-100">
                <span className="h-2 w-2 rounded-full bg-blue-500" /> Jobs
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3.5 py-1.5 text-violet-800 shadow-sm dark:border-violet-500/30 dark:bg-violet-500/15 dark:text-violet-100">
                <span className="h-2 w-2 rounded-full bg-violet-500" /> Applications
              </span>
            </div>
          </div>

          <div className="mt-6 rounded-[24px] border border-border/70 bg-card/95 p-4 shadow-sm backdrop-blur-sm">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              role="img"
              aria-label="Jobs and applications trend"
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
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Jobs opened</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{stats.jobsCreatedThisMonth}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">new roles launched in the last 30 days</p>
            </div>
            <div className={`${adminCardClassName} px-4 py-4`} data-surface="light-card">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Application flow</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{stats.applicationsThisMonth}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">candidates entered the funnel this month</p>
            </div>
            <div className={`${adminCardClassName} px-4 py-4`} data-surface="light-card">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Demand ratio</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{applicationsPerActiveJob.toFixed(1)}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">applications for every active role</p>
            </div>
          </div>
        </section>

        <section className={adminPanelClassName} data-surface="light-panel">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-foreground">Users by Role</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Monitor how access is distributed across the platform and where role mix may need intervention.
              </p>
            </div>
            {dominantRole ? (
              <div className="rounded-2xl border border-sky-100 bg-sky-50/70 px-3 py-2 text-right text-sky-700 shadow-sm dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-200">Dominant user group</p>
                <p className="mt-1 text-sm font-semibold text-sky-700 dark:text-sky-100">{formatRoleLabel(dominantRole._id)}</p>
              </div>
            ) : null}
          </div>

          <div className="mt-6 space-y-4">
            {roleDistribution.map((role) => (
              <div key={role.label} className={`${adminCardClassName} px-4 py-4`} data-surface="light-card">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[15px] font-semibold text-foreground">{role.label}</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{role.insight}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">{role.percentage}%</p>
                    <p className="text-xs text-muted-foreground">{role.count} users</p>
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

