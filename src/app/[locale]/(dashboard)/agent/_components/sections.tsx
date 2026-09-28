import { cache } from "react";
import { getTranslations } from "next-intl/server";
import { connectDB } from "@/lib/db/mongoose";
import logger from "@/lib/logger";
import Application from "@/models/Application";
import Commission from "@/models/Commission";
import Job from "@/models/Job";
import Lead from "@/models/Lead";
import Placement from "@/models/Placement";
import TargetProfile from "@/models/TargetProfile";
import type { ApplicationStatus } from "@/models/Application";
import { AgentTodayQueue, type AgentTodayQueueLabels } from "@/components/features/agent/AgentTodayQueue";
import {
  AgentCommissionPanel,
  AgentKpiStrip,
  AgentLeadFunnel,
  AgentPipelinePanel,
  AgentRolePerformance,
  AgentTargetPanel,
  AgentTrendPanel,
  type AgentRoleMetric,
  type AgentTranslator,
} from "@/components/features/agent/dashboard";
import { portfolioMatch } from "@/lib/agents/dashboardShapes";
import { getAgentActivityTrend, getAgentCommissionByStatus, getAgentLeadFunnel } from "@/lib/agents/dashboardTrends";
import { getAgentActionCounts, getAgentQueueItems, type AgentScope } from "@/lib/agents/workQueue";
import { calculateMonthlyAchievements, type MonthlyAchievement } from "@/lib/targets/profileAchievementCalculator";
import { SectionError } from "../../admin/_components/section-error";

/** What every section needs; resolved once by the page. */
export interface AgentSectionContext {
  locale: string;
  userId: string;
  /** Null when the signed-in user has no Agent document yet. */
  scope: AgentScope | null;
  currency: string;
  now: Date;
}

/**
 * Runs one section's queries. A failure renders that section's error state
 * with a retry; the sections around it are unaffected.
 */
async function load<T>(section: string, run: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false }> {
  try {
    await connectDB();
    return { ok: true, data: await run() };
  } catch (err) {
    logger.error({ err, section }, "[agent/dashboard] section query failed");
    return { ok: false };
  }
}

function Failed({ id, title, t }: { id: string; title: string; t: AgentTranslator }) {
  return <SectionError id={id} title={title} message={t("sectionError.message")} retryLabel={t("sectionError.retry")} />;
}

/* ── This month, the way the target report and the commissions page count it ── */

const pad = (n: number) => String(n).padStart(2, "0");

export function monthWindow(now: Date) {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthFrom = `${year}-${pad(month)}-01`;
  const monthTo = `${year}-${pad(month)}-${pad(new Date(year, month, 0).getDate())}`;
  // /api/commissions reads ?dateFrom/?dateTo exactly like this.
  const from = new Date(monthFrom);
  const to = new Date(monthTo);
  to.setHours(23, 59, 59, 999);
  return { year, month, monthFrom, monthTo, from, to, query: `dateFrom=${monthFrom}&dateTo=${monthTo}` };
}

const monthLabel = (now: Date, locale: string) => now.toLocaleDateString(locale === "ar" ? "ar" : "en-GB", { month: "long", year: "numeric" });

/* ── Shared loaders: `cache` keeps one query per context per request ── */

interface Portfolio {
  activeJobs: number;
  vacanciesPosted: number;
  leadsGenerated: number;
  leadsConverted: number;
  placementsCount: number;
  byStatus: Partial<Record<ApplicationStatus, number>>;
  totalApps: number;
  interviewRate: number;
  offerRate: number;
  jobMetrics: AgentRoleMetric[];
}

const EMPTY_PORTFOLIO: Portfolio = {
  activeJobs: 0,
  vacanciesPosted: 0,
  leadsGenerated: 0,
  leadsConverted: 0,
  placementsCount: 0,
  byStatus: {},
  totalApps: 0,
  interviewRate: 0,
  offerRate: 0,
  jobMetrics: [],
};

const interviewsOf = (counts: Record<string, number>) =>
  (counts["interview_scheduled"] ?? 0) + (counts["selected"] ?? 0) + (counts["offer"] ?? 0) + (counts["hired"] ?? 0);
const offersOf = (counts: Record<string, number>) => (counts["offer"] ?? 0) + (counts["hired"] ?? 0);

/**
 * Every figure counted live across the portfolio: jobs owned directly or via
 * assigned employers. The funnel used to read the `performance.*` counters on
 * the Agent document — fire-and-forget increments that only tick on one API
 * path — so it showed "0 placements" over a book with placements in it.
 */
const portfolio = cache(async (ctx: AgentSectionContext): Promise<Portfolio> => {
  const { scope } = ctx;
  if (!scope) return EMPTY_PORTFOLIO;
  const { agentId } = scope;
  const portfolioFilter = portfolioMatch(scope);
  const jobFilter = { ...portfolioFilter, deletedAt: null };

  const [activeJobs, vacanciesPosted, leadsGenerated, leadsConverted, placementsCount, perJobCounts, recentJobDocs] = await Promise.all([
    Job.countDocuments({ ...jobFilter, status: "active" }),
    Job.countDocuments(jobFilter),
    Lead.countDocuments({ agentId }),
    Lead.countDocuments({ agentId, status: "converted" }),
    Placement.countDocuments(portfolioFilter),
    // Per-job status counts across the ENTIRE portfolio, for the donut, the
    // rates and the busiest roles alike.
    Application.aggregate<{ _id: { jobId: unknown; status: string }; count: number }>([
      {
        $lookup: {
          from: "jobs",
          localField: "jobId",
          foreignField: "_id",
          as: "job",
          pipeline: [{ $match: jobFilter }, { $project: { _id: 1 } }],
        },
      },
      { $match: { "job.0": { $exists: true } } },
      { $group: { _id: { jobId: "$jobId", status: "$status" }, count: { $sum: 1 } } },
    ]),
    // Live roles only, across the whole portfolio.
    Job.find({ ...jobFilter, status: "active" }).select("_id title status").sort({ createdAt: -1 }).limit(200).lean(),
  ]);

  const jobMap = new Map<string, Record<string, number>>();
  const byStatus: Partial<Record<ApplicationStatus, number>> = {};
  for (const row of perJobCounts) {
    const jid = String(row._id.jobId);
    if (!jobMap.has(jid)) jobMap.set(jid, {});
    jobMap.get(jid)![row._id.status] = row.count;
    const status = row._id.status as ApplicationStatus;
    byStatus[status] = (byStatus[status] ?? 0) + row.count;
  }

  let totalApps = 0;
  let totalInterviews = 0;
  let totalOffers = 0;
  jobMap.forEach((counts) => {
    totalApps += Object.values(counts).reduce((a, b) => a + b, 0);
    totalInterviews += interviewsOf(counts);
    totalOffers += offersOf(counts);
  });

  // The five busiest live roles.
  const jobMetrics: AgentRoleMetric[] = (recentJobDocs as { _id: unknown; title?: string; status?: string }[])
    .map((j) => {
      const counts = jobMap.get(String(j._id)) ?? {};
      const apps = Object.values(counts).reduce((a, b) => a + b, 0);
      const intvs = interviewsOf(counts);
      const offs = offersOf(counts);
      return {
        jobId: String(j._id),
        title: j.title ?? "",
        status: j.status ?? "active",
        applications: apps,
        interviews: intvs,
        offers: offs,
        interviewRate: apps > 0 ? Math.round((intvs / apps) * 100) : 0,
        offerRate: apps > 0 ? Math.round((offs / apps) * 100) : 0,
      };
    })
    .sort((a, b) => b.applications - a.applications)
    .slice(0, 5);

  return {
    activeJobs,
    vacanciesPosted,
    leadsGenerated,
    leadsConverted,
    placementsCount,
    byStatus,
    totalApps,
    interviewRate: totalApps > 0 ? Math.round((totalInterviews / totalApps) * 100) : 0,
    offerRate: totalApps > 0 ? Math.round((totalOffers / totalApps) * 100) : 0,
    jobMetrics,
  };
});

const activity = cache(async (ctx: AgentSectionContext) =>
  ctx.scope
    ? getAgentActivityTrend(ctx.scope, ctx.now)
    : (async () => {
        // No agent document yet: an empty window rather than a failed section.
        const zero = { leads: 0, jobs: 0, applications: 0, interviews: 0, placements: 0 };
        return { daily: [], current: zero, previous: zero, days: 30 };
      })(),
);

/* ── Sections ── */

/** Headline numbers: book size, live roles, 30-day movement, this month's commission. */
export async function KpiSection(ctx: AgentSectionContext) {
  const t = await getTranslations("agentDashboard");
  const month = monthWindow(ctx.now);
  const result = await load("kpi", async () => {
    const [book, trend, commissionRows] = await Promise.all([
      portfolio(ctx),
      activity(ctx),
      ctx.scope
        ? // Pending + approved + paid: the three cards on the commissions page.
          // Override lines carry only superAgentId, so agentId is this agent's own.
          Commission.aggregate<{ total: number }>([
            { $match: { agentId: ctx.scope.agentId, createdAt: { $gte: month.from, $lte: month.to }, status: { $in: ["pending", "approved", "paid"] } } },
            { $group: { _id: null, total: { $sum: "$amount" } } },
          ])
        : Promise.resolve([] as { total: number }[]),
    ]);
    return {
      employerCount: ctx.scope?.assignedEmployerIds.length ?? 0,
      activeJobs: book.activeJobs,
      vacanciesPosted: book.vacanciesPosted,
      placementsTotal: book.placementsCount,
      trend,
      commission: { amount: commissionRows[0]?.total ?? 0, currency: ctx.currency, href: `/${ctx.locale}/agent/commissions?${month.query}` },
    };
  });
  if (!result.ok) return <Failed id="agent-kpi" title={t("kpi.title")} t={t} />;
  return <AgentKpiStrip data={result.data} locale={ctx.locale} t={t} />;
}

/** This month's target from the super-agent's split, measured by the target report's own calculator. */
export async function TargetSection(ctx: AgentSectionContext) {
  const t = await getTranslations("agentDashboard");
  const { year, month } = monthWindow(ctx.now);
  const result = await load("target", async () => {
    // The same profile /api/agent/target-report reads.
    const profile = await TargetProfile.findOne({ assigneeId: ctx.userId, assigneeRole: "agent", year, status: "active" })
      .select("monthlyTargets currency")
      .lean<{ currency?: string; monthlyTargets?: { month: number; employerTarget: number; employeeTarget: number; financeTarget: number }[] } | null>();
    const monthTarget = profile?.monthlyTargets?.find((m) => m.month === month);
    let achievement: MonthlyAchievement | null = null;
    if (monthTarget && (monthTarget.employerTarget > 0 || monthTarget.employeeTarget > 0 || monthTarget.financeTarget > 0)) {
      const [first] = await calculateMonthlyAchievements(ctx.userId, "agent", year, [monthTarget]);
      achievement = first ?? null;
    }
    return { achievement, currency: profile?.currency ?? ctx.currency, monthLabel: monthLabel(ctx.now, ctx.locale) };
  });
  if (!result.ok) return <Failed id="agent-target" title={t("target.title")} t={t} />;
  return <AgentTargetPanel data={result.data} locale={ctx.locale} t={t} />;
}

/** What is late, through the same module the nav badges use, so the two always agree. */
export async function QueueSection(ctx: AgentSectionContext) {
  const tQueue = await getTranslations("agentQueue");
  const t = await getTranslations("agentDashboard");
  // Never cached: a stale queue hides work or sends the agent to records that
  // no longer need them.
  const result = await load("queue", async () =>
    ctx.scope
      ? Promise.all([getAgentQueueItems(ctx.scope, 6), getAgentActionCounts(ctx.scope)])
      : ([[], { overdueTasks: 0, dueFollowUps: 0, interviewsAwaitingOutcome: 0, offersAwaitingResponse: 0, newCandidates: 0 }] as const),
  );
  if (!result.ok) return <Failed id="agent-today-queue" title={tQueue("title")} t={t} />;
  const [items, counts] = result.data;
  const total = counts.dueFollowUps + counts.overdueTasks + counts.interviewsAwaitingOutcome + counts.offersAwaitingResponse + counts.newCandidates;
  // Strings are resolved here, not inside the panel: the shared dashboard
  // components take copy as props, which keeps the panel synchronous.
  const labels: AgentTodayQueueLabels = {
    title: tQueue("title"),
    description: total > 0 ? tQueue("titleWithCount", { count: total }) : tQueue("titleClear"),
    viewTasks: tQueue("viewTasks"),
    summary: {
      dueFollowUps: tQueue("summary.dueFollowUps"),
      overdueTasks: tQueue("summary.overdueTasks"),
      interviewsAwaitingOutcome: tQueue("summary.interviewsAwaitingOutcome"),
      offersAwaitingResponse: tQueue("summary.offersAwaitingResponse"),
      newCandidates: tQueue("summary.newCandidates"),
    },
    kind: {
      followUp: tQueue("kind.followUp"),
      task: tQueue("kind.task"),
      interviewOutcome: tQueue("kind.interviewOutcome"),
      offerResponse: tQueue("kind.offerResponse"),
      newCandidate: tQueue("kind.newCandidate"),
    },
    reason: {
      followUp: tQueue("reason.followUp"),
      task: tQueue("reason.task"),
      interviewOutcome: tQueue("reason.interviewOutcome"),
      offerResponse: tQueue("reason.offerResponse"),
      newCandidate: tQueue("reason.newCandidate"),
    },
    lateness: Object.fromEntries(
      items.map((item) => [`${item.kind}-${item.id}`, item.daysLate > 0 ? tQueue("daysLate", { days: item.daysLate }) : tQueue("dueToday")]),
    ),
    emptyTitle: tQueue("empty.title"),
    emptyDescription: tQueue("empty.description"),
  };
  return <AgentTodayQueue items={[...items]} counts={counts} locale={ctx.locale} labels={labels} />;
}

/** Leads, applications and placements per day over the last 30 days. */
export async function TrendSection(ctx: AgentSectionContext) {
  const t = await getTranslations("agentDashboard");
  const result = await load("trend", () => activity(ctx));
  if (!result.ok) return <Failed id="agent-trend" title={t("trends.title")} t={t} />;
  return <AgentTrendPanel daily={result.data.daily} days={result.data.days} locale={ctx.locale} t={t} />;
}

/** Employer leads by stage. */
export async function LeadFunnelSection(ctx: AgentSectionContext) {
  const t = await getTranslations("agentDashboard");
  const result = await load("leadFunnel", async () => {
    const [book, stages] = await Promise.all([
      portfolio(ctx),
      ctx.scope
        ? getAgentLeadFunnel(ctx.scope.agentId)
        : Promise.resolve({ new: 0, contacted: 0, interested: 0, negotiating: 0, converted: 0, lost: 0 }),
    ]);
    return { stages, total: book.leadsGenerated, converted: book.leadsConverted };
  });
  if (!result.ok) return <Failed id="agent-lead-funnel" title={t("leadFunnel.title")} t={t} />;
  return <AgentLeadFunnel data={result.data} locale={ctx.locale} t={t} />;
}

/** Pipeline by status, the busiest roles and this month's commission by status. */
export async function RecruitmentSection(ctx: AgentSectionContext) {
  const t = await getTranslations("agentDashboard");
  const month = monthWindow(ctx.now);
  const result = await load("recruitment", async () => {
    const [book, buckets] = await Promise.all([
      portfolio(ctx),
      ctx.scope
        ? getAgentCommissionByStatus(ctx.scope.agentId, month.from, month.to)
        : Promise.resolve({ pending: { count: 0, amount: 0 }, approved: { count: 0, amount: 0 }, paid: { count: 0, amount: 0 }, disputed: { count: 0, amount: 0 } }),
    ]);
    return { book, buckets };
  });
  if (!result.ok) {
    return (
      <>
        <Failed id="agent-pipeline" title={t("pipelineStatus.title")} t={t} />
        <Failed id="agent-role-performance" title={t("rolePerformance.title")} t={t} />
        <Failed id="agent-commission" title={t("commission.title")} t={t} />
      </>
    );
  }
  const { book, buckets } = result.data;
  return (
    <>
      <AgentPipelinePanel byStatus={book.byStatus} locale={ctx.locale} t={t} />
      <AgentRolePerformance
        rows={book.jobMetrics}
        totals={{ applications: book.totalApps, interviewRate: book.interviewRate, offerRate: book.offerRate }}
        locale={ctx.locale}
        t={t}
      />
      <AgentCommissionPanel
        data={{ buckets, currency: ctx.currency, monthQuery: month.query, monthLabel: monthLabel(ctx.now, ctx.locale) }}
        locale={ctx.locale}
        t={t}
      />
    </>
  );
}

