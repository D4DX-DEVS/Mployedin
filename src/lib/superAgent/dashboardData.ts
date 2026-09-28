import type { Types } from "mongoose";
import { getSuperAgentBook, getSuperAgentScope, type RegionInfo } from "@/lib/auth/agentRestrictions";
import { EMPTY_AGENT_PERFORMANCE, getLiveAgentPerformance } from "@/lib/agentPerformance";
import { isValidTimeZone } from "@/lib/datetime/zone";
import { dayStartInZone, monthStartInZone, recentDayKeys, recentMonthKeys } from "@/lib/datetime/zonedMonth";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import User from "@/models/User";
import Employer from "@/models/Employer";
import Job from "@/models/Job";
import Application from "@/models/Application";
import Placement from "@/models/Placement";
import Lead from "@/models/Lead";
import Commission from "@/models/Commission";
import ExhibitionRequest from "@/models/ExhibitionRequest";
import TargetProfile from "@/models/TargetProfile";

/**
 * Everything the super-agent home shows, counted live from the collections.
 *
 * Scope is the canonical one — getSuperAgentScope(), team ∪ region — and each
 * figure is counted with the same filter as the list page it opens, so the
 * number on the card is the number of rows the SA lands on. "This month" is
 * the calendar month in the super-agent's own time zone.
 *
 * The loader is split into one context step (scope + filters) and five
 * independent parts so the page can stream each section as its own queries
 * finish; `loadSuperAgentDashboard` runs them all for callers that want the
 * whole picture at once.
 */

const FALLBACK_TIME_ZONE = "Asia/Dubai";
export const ACTIVITY_MONTHS = 6;
/** Sparkline window, in local days including today. */
export const DAILY_DAYS = 30;

export interface SuperAgentKpis {
  activeAgents: number;
  newAgentsThisMonth: number;
  newAgentsLastMonth: number;
  employers: number;
  newEmployersThisMonth: number;
  newEmployersLastMonth: number;
  activeJobs: number;
  jobsPostedThisMonth: number;
  jobsPostedLastMonth: number;
  placementsThisMonth: number;
  placementsLastMonth: number;
  /** Placements in the last 30 local days, and the 30 days before those. */
  placementsLast30Days: number;
  placementsPrevious30Days: number;
}

/** One local day of additions, for the KPI sparklines. */
export interface DailyActivity {
  /** "YYYY-MM-DD" in the super-agent's time zone. */
  day: string;
  agents: number;
  employers: number;
  jobs: number;
  placements: number;
}

/** All-time volume per stage. Different record types — never a conversion rate. */
export interface SuperAgentFunnel {
  leads: number;
  employers: number;
  jobs: number;
  applications: number;
  placements: number;
}

export interface SuperAgentQueueCounts {
  pendingExhibitions: number;
  pendingCommissions: number;
  overdueFollowUps: number;
  inactiveAgents: number;
  idleAgents: number;
}

/** The roster as a partition: every agent is in exactly one bucket. */
export interface SuperAgentTeamSplit {
  total: number;
  /** Active account with at least one lead. */
  engaged: number;
  /** Active account, no lead yet. */
  idle: number;
  /** Deactivated account. */
  inactive: number;
}

export interface TopAgentRow {
  agentId: string;
  name: string;
  leads: number;
  jobs: number;
  applications: number;
  placements: number;
}

export interface ActivityMonth {
  /** "YYYY-MM" in the super-agent's time zone. */
  month: string;
  leads: number;
  jobs: number;
  applications: number;
}

export interface CommissionBucket {
  count: number;
  amount: number;
}

/** The SA's own commissions (Commission.superAgentId), in the busiest currency. */
export interface SuperAgentCommissions {
  currency: string;
  pending: CommissionBucket;
  approved: CommissionBucket;
  disputed: CommissionBucket;
  paidThisMonth: CommissionBucket;
  paidLastMonth: CommissionBucket;
  /** Per local day, last 30 days: pending amount created and amount paid. */
  daily: { day: string; pending: number; paid: number }[];
}

/** Exhibition requests from the team by where they sit in the workflow. */
export interface SuperAgentExhibitions {
  awaitingReview: number;
  revisionRequested: number;
  approved: number;
  active: number;
}

export interface SuperAgentTargets {
  year: number;
  /** Team agents with an active target profile for `year`. */
  agentsWithTarget: number;
  agentsTotal: number;
}

export interface SuperAgentDashboardData {
  timeZone: string;
  kpis: SuperAgentKpis;
  daily: DailyActivity[];
  funnel: SuperAgentFunnel;
  queue: SuperAgentQueueCounts;
  team: SuperAgentTeamSplit;
  topAgents: TopAgentRow[];
  activity: ActivityMonth[];
  commissions: SuperAgentCommissions;
  exhibitions: SuperAgentExhibitions;
  targets: SuperAgentTargets;
  /** The SA's own assigned ids, for naming the region. */
  region: RegionInfo | null;
}

/** Scope, filters and period boundaries every part shares. */
export interface SuperAgentDashboardContext {
  now: Date;
  timeZone: string;
  monthStart: Date;
  lastMonthStart: Date;
  saProfileId: Types.ObjectId | undefined;
  agentDocIds: Types.ObjectId[];
  agentDocs: { _id: unknown; userId: unknown }[];
  agentUserIds: Types.ObjectId[];
  employerFilter: Record<string, unknown>;
  jobFilter: Record<string, unknown>;
  leadFilter: Record<string, unknown>;
  placementFilter: Record<string, unknown>;
  region: RegionInfo | null;
}

type AggregateModel = { aggregate: (pipeline: unknown[]) => Promise<{ _id: string; count: number }[]> };

/** One `$group` by local month; `$match` does no casting, so ids must be ObjectIds. */
async function countByMonth(model: AggregateModel, match: Record<string, unknown>, since: Date, timeZone: string): Promise<Map<string, number>> {
  const rows = await model.aggregate([
    { $match: { ...match, createdAt: { $gte: since } } },
    { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt", timezone: timeZone } }, count: { $sum: 1 } } },
  ]);
  return new Map((rows ?? []).map((r) => [String(r._id), r.count]));
}

/** One `$group` by local day over `dateField`, summing `sum` (1 for a count, "$amount" for money). */
async function sumByDay(
  model: AggregateModel,
  match: Record<string, unknown>,
  dateField: string,
  since: Date,
  timeZone: string,
  sum: number | string = 1,
): Promise<Map<string, number>> {
  const rows = await model.aggregate([
    { $match: { ...match, [dateField]: { $gte: since } } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: `$${dateField}`, timezone: timeZone } }, count: { $sum: sum } } },
  ]);
  return new Map((rows ?? []).map((r) => [String(r._id), Number(r.count) || 0]));
}

const zero = (): CommissionBucket => ({ count: 0, amount: 0 });

/** Local calendar year of `now` in `timeZone`. */
function yearInZone(timeZone: string, now: Date): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric" }).format(now));
}

/* ── Context ─────────────────────────────────────────────────────────────── */

export async function loadSuperAgentContext(saUserId: string, now: Date = new Date()): Promise<SuperAgentDashboardContext> {
  const [scope, book, saProfile] = await Promise.all([
    getSuperAgentScope(saUserId),
    getSuperAgentBook(saUserId),
    SuperAgent.findOne({ userId: saUserId }).select("timezone").lean<{ timezone?: string } | null>(),
  ]);
  const timeZone = isValidTimeZone(saProfile?.timezone) ? (saProfile!.timezone as string) : FALLBACK_TIME_ZONE;

  const agentDocIds = scope?.effectiveAgentIds ?? [];
  const saProfileId = scope?.saProfileId;
  // `performance` is deliberately not selected — see getLiveAgentPerformance.
  const agentDocs = await Agent.find({ _id: { $in: agentDocIds } }).select("userId").lean();
  const agentUserIds = agentDocs.map((a) => a.userId as Types.ObjectId);

  // The employers list (/api/employers, super_agent branch) and the jobs list
  // (/api/super-agent/jobs, getSuperAgentBook) each have their own scope; the
  // cards reuse them rather than a third definition. ownershipMatch holds the
  // stored ObjectIds, which the aggregate `$match` below needs (no casting).
  const employerFilter: Record<string, unknown> = { agentId: { $in: agentDocIds }, roleArchivedAt: null };
  // deletedAt: null — the jobs list hides soft-deleted jobs, so the counts must too.
  const jobFilter: Record<string, unknown> = { deletedAt: null, ...(book?.ownershipMatch ?? { _id: { $in: [] } }) };
  // Same scope as /api/super-agent/leads: the team's leads plus the SA's own.
  const leadFilter: Record<string, unknown> = {
    $or: [{ agentId: { $in: agentDocIds } }, ...(saProfileId ? [{ superAgentId: saProfileId }] : [])],
  };
  // Lead.agentId / Placement.agentId hold the Agent doc _id; Placement.superAgentId the SuperAgent doc _id.
  const placementFilter: Record<string, unknown> = {
    $or: [{ agentId: { $in: agentDocIds } }, ...(saProfileId ? [{ superAgentId: saProfileId }] : [])],
  };

  return {
    now,
    timeZone,
    monthStart: monthStartInZone(timeZone, now, 0),
    lastMonthStart: monthStartInZone(timeZone, now, 1),
    saProfileId,
    agentDocIds,
    agentDocs: agentDocs as { _id: unknown; userId: unknown }[],
    agentUserIds,
    employerFilter,
    jobFilter,
    leadFilter,
    placementFilter,
    region: scope ? { assignedCityIds: scope.assignedCityIds, assignedStateIds: scope.assignedStateIds } : null,
  };
}

/* ── Part 1: headline numbers + 30-day sparklines ────────────────────────── */

export async function loadSuperAgentKpis(ctx: SuperAgentDashboardContext): Promise<{ kpis: SuperAgentKpis; daily: DailyActivity[] }> {
  const { now, timeZone, monthStart, lastMonthStart, agentDocIds, agentUserIds, employerFilter, jobFilter, placementFilter } = ctx;
  const inMonth = { $gte: monthStart };
  const inLastMonth = { $gte: lastMonthStart, $lt: monthStart };
  const dailySince = dayStartInZone(timeZone, now, DAILY_DAYS - 1);
  const previous30Since = dayStartInZone(timeZone, now, DAILY_DAYS * 2 - 1);
  const employerCount = (extra: Record<string, unknown> = {}) =>
    agentDocIds.length ? Employer.countDocuments({ ...employerFilter, ...extra }) : Promise.resolve(0);

  const [
    activeAgents, newAgentsThisMonth, newAgentsLastMonth,
    totalEmployers, newEmployersThisMonth, newEmployersLastMonth,
    activeJobs, jobsPostedThisMonth, jobsPostedLastMonth,
    placementsThisMonth, placementsLastMonth, placementsLast30Days, placementsPrevious30Days,
    agentsByDay, employersByDay, jobsByDay, placementsByDay,
  ] = await Promise.all([
    User.countDocuments({ _id: { $in: agentUserIds }, isActive: true }),
    Agent.countDocuments({ _id: { $in: agentDocIds }, createdAt: inMonth }),
    Agent.countDocuments({ _id: { $in: agentDocIds }, createdAt: inLastMonth }),
    employerCount(),
    employerCount({ createdAt: inMonth }),
    employerCount({ createdAt: inLastMonth }),
    Job.countDocuments({ ...jobFilter, status: "active" }),
    Job.countDocuments({ ...jobFilter, createdAt: inMonth }),
    Job.countDocuments({ ...jobFilter, createdAt: inLastMonth }),
    Placement.countDocuments({ ...placementFilter, placedAt: inMonth }),
    Placement.countDocuments({ ...placementFilter, placedAt: inLastMonth }),
    Placement.countDocuments({ ...placementFilter, placedAt: { $gte: dailySince } }),
    Placement.countDocuments({ ...placementFilter, placedAt: { $gte: previous30Since, $lt: dailySince } }),
    sumByDay(Agent as never, { _id: { $in: agentDocIds } }, "createdAt", dailySince, timeZone),
    agentDocIds.length ? sumByDay(Employer as never, employerFilter, "createdAt", dailySince, timeZone) : Promise.resolve(new Map<string, number>()),
    sumByDay(Job as never, jobFilter, "createdAt", dailySince, timeZone),
    sumByDay(Placement as never, placementFilter, "placedAt", dailySince, timeZone),
  ]);

  const daily: DailyActivity[] = recentDayKeys(timeZone, now, DAILY_DAYS).map((day) => ({
    day,
    agents: agentsByDay.get(day) ?? 0,
    employers: employersByDay.get(day) ?? 0,
    jobs: jobsByDay.get(day) ?? 0,
    placements: placementsByDay.get(day) ?? 0,
  }));

  return {
    kpis: {
      activeAgents,
      newAgentsThisMonth,
      newAgentsLastMonth,
      employers: totalEmployers,
      newEmployersThisMonth,
      newEmployersLastMonth,
      activeJobs,
      jobsPostedThisMonth,
      jobsPostedLastMonth,
      placementsThisMonth,
      placementsLastMonth,
      placementsLast30Days,
      placementsPrevious30Days,
    },
    daily,
  };
}

/* ── Part 2: what is waiting on the super-agent + roster split ───────────── */

export async function loadSuperAgentQueue(ctx: SuperAgentDashboardContext): Promise<{ queue: SuperAgentQueueCounts; team: SuperAgentTeamSplit }> {
  const { now, saProfileId, agentDocIds, agentDocs, agentUserIds, leadFilter } = ctx;
  // ExhibitionRequest.agentId stores the Agent's User._id; Commission
  // .superAgentId references the SuperAgent profile _id — the same two shapes
  // /api/exhibitions and /api/commissions use.
  const [pendingExhibitions, pendingCommissions, overdueFollowUps, agentsWithLeads, users] = await Promise.all([
    ExhibitionRequest.countDocuments({
      agentId: { $in: agentUserIds },
      status: { $in: ["submitted", "under_review"] },
      isDeleted: { $ne: true },
    }),
    saProfileId ? Commission.countDocuments({ superAgentId: saProfileId, status: "pending" }) : Promise.resolve(0),
    Lead.countDocuments({
      ...leadFilter,
      followUpAt: { $lt: now },
      status: { $nin: ["converted", "lost"] },
    }),
    Lead.distinct("agentId", { agentId: { $in: agentDocIds } }),
    User.find({ _id: { $in: agentUserIds } }).select("isActive").lean<{ _id: unknown; isActive?: boolean }[]>(),
  ]);

  const activeUserIds = new Set((users ?? []).filter((u) => u.isActive).map((u) => String(u._id)));
  const withLeads = new Set((agentsWithLeads ?? []).map((id) => String(id)));
  let engaged = 0;
  let idle = 0;
  for (const agent of agentDocs) {
    if (!activeUserIds.has(String(agent.userId))) continue;
    if (withLeads.has(String(agent._id))) engaged += 1;
    else idle += 1;
  }
  const total = agentDocIds.length;
  const inactive = Math.max(0, total - engaged - idle);

  return {
    queue: {
      pendingExhibitions,
      pendingCommissions,
      overdueFollowUps,
      inactiveAgents: inactive,
      // Idle = no lead at all; distinct() returns only the agents that have one.
      idleAgents: Math.max(0, total - withLeads.size),
    },
    team: { total, engaged, idle, inactive },
  };
}

/* ── Part 3: all-time funnel + six months of activity ────────────────────── */

export async function loadSuperAgentFunnel(ctx: SuperAgentDashboardContext): Promise<{ funnel: SuperAgentFunnel; activity: ActivityMonth[] }> {
  const { now, timeZone, agentDocIds, employerFilter, jobFilter, leadFilter, placementFilter } = ctx;
  const activitySince = monthStartInZone(timeZone, now, ACTIVITY_MONTHS - 1);

  const [totalEmployers, totalJobs, jobDocs, totalPlacements, totalLeads] = await Promise.all([
    agentDocIds.length ? Employer.countDocuments(employerFilter) : Promise.resolve(0),
    Job.countDocuments(jobFilter),
    Job.find(jobFilter).select("_id").lean(),
    Placement.countDocuments(placementFilter),
    Lead.countDocuments(leadFilter),
  ]);
  const jobIds = jobDocs.map((j) => j._id);
  const appFilter = { jobId: { $in: jobIds } };

  const [totalApplications, leadsByMonth, jobsByMonth, appsByMonth] = await Promise.all([
    jobIds.length ? Application.countDocuments(appFilter) : Promise.resolve(0),
    countByMonth(Lead as never, leadFilter, activitySince, timeZone),
    countByMonth(Job as never, jobFilter, activitySince, timeZone),
    jobIds.length ? countByMonth(Application as never, appFilter, activitySince, timeZone) : Promise.resolve(new Map<string, number>()),
  ]);

  const activity: ActivityMonth[] = recentMonthKeys(timeZone, now, ACTIVITY_MONTHS).map((month) => ({
    month,
    leads: leadsByMonth.get(month) ?? 0,
    jobs: jobsByMonth.get(month) ?? 0,
    applications: appsByMonth.get(month) ?? 0,
  }));

  return {
    funnel: {
      leads: totalLeads,
      employers: totalEmployers,
      jobs: totalJobs,
      applications: totalApplications,
      placements: totalPlacements,
    },
    activity,
  };
}

/* ── Part 4: the five most productive agents ─────────────────────────────── */

export async function loadSuperAgentTopAgents(ctx: SuperAgentDashboardContext): Promise<TopAgentRow[]> {
  const { agentDocIds, agentDocs, agentUserIds } = ctx;
  // Live figures, never Agent.performance (it drifted by 17 placements).
  const [agentUsers, livePerformance] = await Promise.all([
    User.find({ _id: { $in: agentUserIds } }).select("name email").lean(),
    getLiveAgentPerformance(agentDocIds),
  ]);
  const agentName = new Map(agentUsers.map((u) => [String(u._id), (u.name as string) || (u.email as string) || ""]));
  return agentDocs
    .map((a) => {
      const perf = livePerformance.get(String(a._id)) ?? EMPTY_AGENT_PERFORMANCE;
      return {
        agentId: String(a._id),
        name: agentName.get(String(a.userId)) ?? "",
        leads: perf.leadsGenerated,
        jobs: perf.vacanciesPosted,
        applications: perf.jobSeekersSubmitted,
        placements: perf.placementsCompleted,
      };
    })
    .sort((x, y) => y.placements - x.placements || y.applications - x.applications || y.leads - x.leads)
    .slice(0, 5);
}

/* ── Part 5: money, exhibitions and targets ──────────────────────────────── */

interface StatusAmountRow {
  _id: { status: string; currency?: string };
  count: number;
  amount: number;
}

export async function loadSuperAgentFinance(
  ctx: SuperAgentDashboardContext,
): Promise<{ commissions: SuperAgentCommissions; exhibitions: SuperAgentExhibitions; targets: SuperAgentTargets }> {
  const { now, timeZone, monthStart, lastMonthStart, saProfileId, agentUserIds } = ctx;
  const dailySince = dayStartInZone(timeZone, now, DAILY_DAYS - 1);
  const year = yearInZone(timeZone, now);
  const own = saProfileId ? { superAgentId: saProfileId } : null;
  const groupByStatus = (match: Record<string, unknown>) =>
    (Commission as unknown as { aggregate: (p: unknown[]) => Promise<StatusAmountRow[]> }).aggregate([
      { $match: match },
      { $group: { _id: { status: "$status", currency: "$currency" }, count: { $sum: 1 }, amount: { $sum: "$amount" } } },
    ]);

  const [openRows, paidThisMonthRows, paidLastMonthRows, pendingByDay, paidByDay, exhibitionRows, agentsWithTarget] = await Promise.all([
    own ? groupByStatus({ ...own, status: { $in: ["pending", "approved", "disputed"] } }) : Promise.resolve([] as StatusAmountRow[]),
    own ? groupByStatus({ ...own, status: "paid", paidAt: { $gte: monthStart } }) : Promise.resolve([] as StatusAmountRow[]),
    own ? groupByStatus({ ...own, status: "paid", paidAt: { $gte: lastMonthStart, $lt: monthStart } }) : Promise.resolve([] as StatusAmountRow[]),
    own ? sumByDay(Commission as never, { ...own, status: "pending" }, "createdAt", dailySince, timeZone, "$amount") : Promise.resolve(new Map<string, number>()),
    own ? sumByDay(Commission as never, { ...own, status: "paid" }, "paidAt", dailySince, timeZone, "$amount") : Promise.resolve(new Map<string, number>()),
    (ExhibitionRequest as unknown as AggregateModel).aggregate([
      { $match: { agentId: { $in: agentUserIds }, isDeleted: { $ne: true } } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    agentUserIds.length
      ? TargetProfile.countDocuments({ assigneeRole: "agent", assigneeId: { $in: agentUserIds }, year, status: "active" })
      : Promise.resolve(0),
  ]);

  // One currency on the card: the one most of the SA's commissions are in.
  const allRows = [...(openRows ?? []), ...(paidThisMonthRows ?? []), ...(paidLastMonthRows ?? [])];
  const byCurrency = new Map<string, number>();
  for (const r of allRows) {
    const c = r._id.currency || "AED";
    byCurrency.set(c, (byCurrency.get(c) ?? 0) + r.count);
  }
  const currency = [...byCurrency.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "AED";
  const bucket = (rows: StatusAmountRow[] | undefined, status?: string): CommissionBucket =>
    (rows ?? [])
      .filter((r) => (r._id.currency || "AED") === currency && (!status || r._id.status === status))
      .reduce((acc, r) => ({ count: acc.count + r.count, amount: acc.amount + (Number(r.amount) || 0) }), zero());

  const exhibitionCount = new Map((exhibitionRows ?? []).map((r) => [String(r._id), r.count]));
  const ex = (...statuses: string[]) => statuses.reduce((sum, s) => sum + (exhibitionCount.get(s) ?? 0), 0);

  return {
    commissions: {
      currency,
      pending: bucket(openRows, "pending"),
      approved: bucket(openRows, "approved"),
      disputed: bucket(openRows, "disputed"),
      paidThisMonth: bucket(paidThisMonthRows),
      paidLastMonth: bucket(paidLastMonthRows),
      daily: recentDayKeys(timeZone, now, DAILY_DAYS).map((day) => ({ day, pending: pendingByDay.get(day) ?? 0, paid: paidByDay.get(day) ?? 0 })),
    },
    exhibitions: {
      awaitingReview: ex("submitted", "under_review"),
      revisionRequested: ex("revision_requested"),
      approved: ex("approved", "budget_approved", "resources_assigned"),
      active: ex("active"),
    },
    targets: { year, agentsWithTarget, agentsTotal: agentUserIds.length },
  };
}

/* ── Everything at once ──────────────────────────────────────────────────── */

export async function loadSuperAgentDashboard(saUserId: string, now: Date = new Date()): Promise<SuperAgentDashboardData> {
  const ctx = await loadSuperAgentContext(saUserId, now);
  const [{ kpis, daily }, { queue, team }, { funnel, activity }, topAgents, finance] = await Promise.all([
    loadSuperAgentKpis(ctx),
    loadSuperAgentQueue(ctx),
    loadSuperAgentFunnel(ctx),
    loadSuperAgentTopAgents(ctx),
    loadSuperAgentFinance(ctx),
  ]);
  return {
    timeZone: ctx.timeZone,
    kpis,
    daily,
    funnel,
    queue,
    team,
    topAgents,
    activity,
    ...finance,
    region: ctx.region,
  };
}
