import { cache } from "react";
import connectDB from "@/lib/db/mongoose";
import Job from "@/models/Job";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

// ponytail: cache() deduplicates across all three callers — 1 DB round-trip per request regardless of how many components call this
export const getPlatformHealth = cache(async (): Promise<{ jobsWithoutApplications: number }> => {
  await connectDB();
  const [row] = await Job.aggregate<{ count: number }>([
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
  ]);
  return { jobsWithoutApplications: row?.count ?? 0 };
});

// ── KPI card: "Active Jobs" insight text ───────────────────────────

export async function KpiActiveJobsInsightText() {
  const { jobsWithoutApplications } = await getPlatformHealth();
  const t = await getTranslations("adminDashboard");
  return (
    <>
      {jobsWithoutApplications > 0
        ? t("kpis.activeJobs.zeroApplications", { count: jobsWithoutApplications })
        : t("kpis.activeJobs.healthy")}
    </>
  );
}

export function InsightTextSkeleton() {
  return <span className="inline-block h-4 w-40 rounded skeleton-shimmer" aria-hidden="true" />;
}

// ── Quick Actions: "Jobs Management" health badge ──────────────────

export async function QuickActionHealthBadge() {
  const { jobsWithoutApplications } = await getPlatformHealth();
  const t = await getTranslations("adminDashboard");
  return (
    <span
      className={`inline-flex max-w-full items-center truncate whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
        jobsWithoutApplications > 0
          ? "bg-amber-100 text-amber-900 ring-1 ring-amber-200"
          : "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200"
      }`}
    >
      {t("quickActions.jobsManagement.badge", { count: jobsWithoutApplications })}
    </span>
  );
}

export function BadgeSkeleton() {
  return <span className="inline-block h-6 w-20 rounded-full skeleton-shimmer" aria-hidden="true" />;
}

// ── Platform Insights section ──────────────────────────────────────

type InsightTone = "critical" | "warning" | "positive";

const toneClasses: Record<InsightTone, string> = {
  critical:
    "rounded-3xl border border-rose-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,241,242,0.98))] shadow-[0_24px_60px_-44px_rgba(244,63,94,0.18)]",
  warning:
    "rounded-3xl border border-amber-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,251,235,0.98))] shadow-[0_24px_60px_-44px_rgba(245,158,11,0.16)]",
  positive:
    "rounded-3xl border border-emerald-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(236,253,245,0.98))] shadow-[0_24px_60px_-44px_rgba(16,185,129,0.16)]",
};

const badgeClasses: Record<InsightTone, string> = {
  critical: "bg-rose-600 text-white",
  warning: "bg-amber-500 text-white",
  positive: "bg-emerald-600 text-white",
};

const titleClasses: Record<InsightTone, string> = {
  critical: "text-slate-950",
  warning: "text-slate-950",
  positive: "text-slate-950",
};

const detailClasses: Record<InsightTone, string> = {
  critical: "text-slate-600",
  warning: "text-slate-600",
  positive: "text-slate-600",
};

const actionClasses: Record<InsightTone, string> = {
  critical: "text-rose-700 hover:text-rose-800",
  warning: "text-amber-700 hover:text-amber-800",
  positive: "text-emerald-700 hover:text-emerald-800",
};

export async function PlatformInsightsSection({
  inactiveEmployers,
  totalPlacements,
  totalApplications,
  locale,
}: {
  inactiveEmployers: number;
  totalPlacements: number;
  totalApplications: number;
  locale: string;
}) {
  const { jobsWithoutApplications } = await getPlatformHealth();
  const t = await getTranslations("adminDashboard");
  const placementRate = totalApplications > 0 ? (totalPlacements / totalApplications) * 100 : 0;

  const insights = [
    {
      id: "job-demand",
      title: jobsWithoutApplications > 0
        ? t("insights.jobDemand.titleProblem", { count: jobsWithoutApplications })
        : t("insights.jobDemand.titleHealthy"),
      detail: jobsWithoutApplications > 0
        ? t("insights.jobDemand.detailProblem")
        : t("insights.jobDemand.detailHealthy"),
      action: jobsWithoutApplications > 0 ? t("insights.jobDemand.actionProblem") : t("insights.jobDemand.actionHealthy"),
      href: `/${locale}/admin/jobs`,
      tone: (jobsWithoutApplications > 0 ? "warning" : "positive") as InsightTone,
    },
    {
      id: "employer-activity",
      title: inactiveEmployers > 0
        ? t("insights.employerActivity.titleProblem", { count: inactiveEmployers })
        : t("insights.employerActivity.titleHealthy"),
      detail: inactiveEmployers > 0
        ? t("insights.employerActivity.detailProblem")
        : t("insights.employerActivity.detailHealthy"),
      action: inactiveEmployers > 0 ? t("common.fixNow") : t("common.openUserManagement"),
      href: `/${locale}/admin/users`,
      tone: (inactiveEmployers > 4 ? "critical" : inactiveEmployers > 0 ? "warning" : "positive") as InsightTone,
    },
    {
      id: "conversion",
      title: placementRate < 15
        ? t("insights.conversion.titleProblem")
        : t("insights.conversion.titleHealthy"),
      detail: placementRate < 15
        ? t("insights.conversion.detailProblem", { value: placementRate.toFixed(0) })
        : t("insights.conversion.detailHealthy", { value: placementRate.toFixed(0) }),
      action: placementRate < 15 ? t("common.fixNow") : t("common.inspectAnalytics"),
      href: `/${locale}/admin/analytics`,
      tone: (placementRate < 8 ? "critical" : placementRate < 15 ? "warning" : "positive") as InsightTone,
    },
  ];

  return (
    <section className="workspace-panel-surface flex flex-col rounded-2xl panel-body" data-surface="light-panel">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h2 className="heading-section font-semibold tracking-tight text-foreground">{t("sections.platformInsights.title")}</h2>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground sm:text-sm sm:leading-6">
            {t("sections.platformInsights.description")}
          </p>
        </div>
        <div className="shrink-0 self-start rounded-2xl border border-sky-100 bg-sky-50/70 text-sky-700 shadow-sm sm:text-right chip-pad">
          <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.16em] sm:text-[11px] sm:tracking-[0.18em]">{t("sections.platformInsights.engine")}</p>
          <p className="mt-1 text-xs font-semibold sm:text-sm">{t("sections.platformInsights.engineDetail")}</p>
        </div>
      </div>

      <div className="mt-4 grid flex-1 auto-rows-fr gap-3 sm:gap-4 md:grid-cols-3">
        {insights.map((insight) => (
          <article
            key={insight.id}
            className={`flex flex-col p-4 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_28px_60px_-44px_rgba(15,23,42,0.16)] sm:p-5 ${toneClasses[insight.tone]}`}
            data-surface="light-card"
            data-tone={insight.tone}
          >
            <div className={`inline-flex self-start whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] sm:text-[11px] sm:tracking-[0.18em] ${badgeClasses[insight.tone]}`}>
              {insight.tone === "critical" ? t("tones.critical") : insight.tone === "warning" ? t("tones.attention") : t("tones.stable")}
            </div>
            <h3 className={`mt-3 text-base font-semibold tracking-tight sm:mt-4 sm:text-lg ${titleClasses[insight.tone]}`}>{insight.title}</h3>
            <p className={`mt-2 text-xs leading-5 sm:text-sm sm:leading-6 ${detailClasses[insight.tone]}`}>{insight.detail}</p>
            <Link
              href={insight.href}
              className={`mt-auto inline-flex items-center gap-2 self-start pt-4 text-xs font-semibold transition-colors sm:text-sm ${actionClasses[insight.tone]}`}
            >
              {insight.action}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}

export function PlatformInsightsSkeleton() {
  return (
    <section className="workspace-panel-surface rounded-2xl sm:rounded-3xl panel-body" data-surface="light-panel" aria-hidden="true">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-52 rounded-lg skeleton-shimmer" />
          <div className="h-4 w-72 rounded skeleton-shimmer" />
        </div>
        <div className="h-14 w-28 rounded-2xl skeleton-shimmer" />
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-3xl border border-border/50 space-y-4 panel-body">
            <div className="h-5 w-16 rounded-full skeleton-shimmer" />
            <div className="h-6 w-40 rounded skeleton-shimmer" />
            <div className="space-y-1.5">
              <div className="h-4 w-full rounded skeleton-shimmer" />
              <div className="h-4 w-3/4 rounded skeleton-shimmer" />
            </div>
            <div className="h-4 w-24 rounded skeleton-shimmer" />
          </div>
        ))}
      </div>
    </section>
  );
}
