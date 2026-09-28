import type { Model } from "mongoose";
import Application from "@/models/Application";
import Commission from "@/models/Commission";
import Interview from "@/models/Interview";
import Job from "@/models/Job";
import Lead from "@/models/Lead";
import Placement from "@/models/Placement";
import type { AgentScope } from "./workQueue";
import {
  COMMISSION_BUCKETS,
  LEAD_STAGES,
  portfolioMatch,
  type AgentActivityTrend,
  type AgentDailyTrend,
  type AgentWindowCounts,
  type CommissionBucket,
  type CommissionBucketTotal,
  type LeadStage,
} from "./dashboardShapes";

/**
 * Time series and breakdowns for the agent home.
 *
 * The queue (workQueue.ts) says what is late; this module says how the desk
 * is moving: one point per day for the KPI sparklines and the activity chart,
 * the same counts over the previous window for the deltas, the lead funnel by
 * stage and this month's commission by status. Everything is counted from the
 * records themselves, scoped exactly as the queue scopes them.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type {
  AgentActivityTrend,
  AgentDailyTrend,
  AgentWindowCounts,
  CommissionBucket,
  CommissionBucketTotal,
  LeadStage,
} from "./dashboardShapes";
export { COMMISSION_BUCKETS, LEAD_STAGES, portfolioMatch } from "./dashboardShapes";

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

/** Counts of `dateExpr` per UTC day for documents matching `match`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function dailyCounts(model: Model<any>, match: Record<string, unknown>, dateExpr: unknown): Promise<Map<string, number>> {
  const rows = await model.aggregate<{ _id: string; count: number }>([
    { $match: match },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: dateExpr } }, count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [row._id, row.count]));
}

function sumBetween(byDay: Map<string, number>, from: Date, to: Date): number {
  let total = 0;
  for (let t = from.getTime(); t < to.getTime(); t += DAY_MS) total += byDay.get(dayKey(new Date(t))) ?? 0;
  return total;
}

/**
 * Leads created, roles posted, applications received, interviews arranged and
 * placements made per day over the last `days` days, plus the same totals for
 * the `days` before that so each KPI can say whether it is up or down.
 */
export async function getAgentActivityTrend(scope: AgentScope, now: Date, days = 30): Promise<AgentActivityTrend> {
  const start = new Date(now.getTime() - (days - 1) * DAY_MS);
  start.setUTCHours(0, 0, 0, 0);
  const previousStart = new Date(start.getTime() - days * DAY_MS);
  const since = { $gte: previousStart };
  const jobs = portfolioMatch(scope);
  const inPortfolio = scope.portfolioJobIds.length ? { jobId: { $in: scope.portfolioJobIds } } : null;

  const [leads, jobsByDay, applications, interviews, placements] = await Promise.all([
    dailyCounts(Lead, { agentId: scope.agentId, createdAt: since }, "$createdAt"),
    dailyCounts(Job, { ...jobs, deletedAt: null, createdAt: since }, "$createdAt"),
    inPortfolio
      ? dailyCounts(Application, { ...inPortfolio, $or: [{ appliedAt: since }, { appliedAt: null, createdAt: since }] }, { $ifNull: ["$appliedAt", "$createdAt"] })
      : new Map<string, number>(),
    inPortfolio ? dailyCounts(Interview, { ...inPortfolio, createdAt: since }, "$createdAt") : new Map<string, number>(),
    dailyCounts(Placement, { ...jobs, placedAt: since }, "$placedAt"),
  ]);

  const daily: AgentDailyTrend[] = [];
  const end = new Date(now.getTime() + DAY_MS);
  for (let t = start.getTime(); t < end.getTime(); t += DAY_MS) {
    const day = dayKey(new Date(t));
    daily.push({
      day,
      leads: leads.get(day) ?? 0,
      jobs: jobsByDay.get(day) ?? 0,
      applications: applications.get(day) ?? 0,
      interviews: interviews.get(day) ?? 0,
      placements: placements.get(day) ?? 0,
    });
  }
  const window = (from: Date, to: Date): AgentWindowCounts => ({
    leads: sumBetween(leads, from, to),
    jobs: sumBetween(jobsByDay, from, to),
    applications: sumBetween(applications, from, to),
    interviews: sumBetween(interviews, from, to),
    placements: sumBetween(placements, from, to),
  });
  return { daily, current: window(start, end), previous: window(previousStart, start), days };
}

/** How many of the agent's leads sit at each stage of the funnel. */
export async function getAgentLeadFunnel(agentId: AgentScope["agentId"]): Promise<Record<LeadStage, number>> {
  const rows = await Lead.aggregate<{ _id: string; count: number }>([
    { $match: { agentId } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const funnel = Object.fromEntries(LEAD_STAGES.map((stage) => [stage, 0])) as Record<LeadStage, number>;
  for (const row of rows) if (row._id in funnel) funnel[row._id as LeadStage] = row.count;
  return funnel;
}

/**
 * This month's commission lines by status — the buckets the commissions page
 * filters on. Override lines carry only superAgentId, so `agentId` is the
 * agent's own money.
 */
export async function getAgentCommissionByStatus(
  agentId: AgentScope["agentId"],
  from: Date,
  to: Date,
): Promise<Record<CommissionBucket, CommissionBucketTotal>> {
  const rows = await Commission.aggregate<{ _id: string; count: number; amount: number }>([
    { $match: { agentId, createdAt: { $gte: from, $lte: to }, status: { $in: COMMISSION_BUCKETS } } },
    { $group: { _id: "$status", count: { $sum: 1 }, amount: { $sum: "$amount" } } },
  ]);
  const buckets = Object.fromEntries(COMMISSION_BUCKETS.map((b) => [b, { count: 0, amount: 0 }])) as Record<CommissionBucket, CommissionBucketTotal>;
  for (const row of rows) if (row._id in buckets) buckets[row._id as CommissionBucket] = { count: row.count, amount: row.amount };
  return buckets;
}
