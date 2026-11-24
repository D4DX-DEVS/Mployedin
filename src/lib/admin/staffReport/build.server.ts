import "server-only";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { Agent } from "@/models/Agent";
import { SuperAgent } from "@/models/SuperAgent";
import { User } from "@/models/User";
import { Employer } from "@/models/Employer";
import { Job } from "@/models/Job";
import { Application } from "@/models/Application";
import { JobSeeker } from "@/models/JobSeeker";
import { Commission } from "@/models/Commission";
import AgentTask from "@/models/AgentTask";
import TargetProfile from "@/models/TargetProfile";
import "@/models/City";
import "@/models/State";
import { resolveAssignedRegions } from "@/lib/agents/assignedRegion";
import { enrichProfiles, expectedProgressPct, getRiskScore } from "@/lib/targets/profileAchievementCalculator";
import { calculateKpis, kpiOwnerKey } from "@/lib/targets/kpiCalculator";
import { fromStoredPeriods } from "@/lib/targets/schedule";
import { lastActivityByAgent, candidatesMovedBy } from "./activity.server";
import {
  commissionSection, employersSection, exhibitionsSection, invoicesSection, jobsSection, tasksSection, type Scope,
} from "./sections.server";
import { allGaps, foldMoney, owedOf, paidOf, workState } from "./rules";
import { dateIn, rangeBounds } from "./range";
import type {
  ReportRange, StaffIdentity, StaffKind, StaffReport, TargetMeasure, TargetSummary, TeamAgentRow,
} from "./types";

type Id = mongoose.Types.ObjectId;
const str = (v: unknown) => (v == null ? "" : String(v));
const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : undefined);

interface AgentDoc {
  _id: unknown;
  userId: unknown;
  assignedEmployerIds?: Id[];
  assignedCityIds?: Id[];
  assignedStateIds?: Id[];
}

async function regionNames(profile: { assignedCityIds?: Id[]; assignedStateIds?: Id[] }, locale: string): Promise<string[]> {
  const regions = await resolveAssignedRegions(profile, locale);
  return regions.map((r) => (r.parent ? `${r.name}, ${r.parent}` : r.name));
}

/** Employers held by these agents: assigned to them, or created by them (Employer.agentId). */
async function heldEmployers(agents: AgentDoc[]): Promise<{ ids: Id[]; holder: Map<string, string> }> {
  const holder = new Map<string, string>();
  for (const a of agents) for (const e of a.assignedEmployerIds ?? []) if (!holder.has(str(e))) holder.set(str(e), str(a._id));
  if (agents.length) {
    const owned = await Employer.find({ agentId: { $in: agents.map((a) => a._id) } }).select("_id agentId").lean();
    for (const e of owned) holder.set(str(e._id), str(e.agentId));
  }
  return { ids: [...holder.keys()].map((k) => new mongoose.Types.ObjectId(k)), holder };
}

function measure(target: number | undefined, actual: number): TargetMeasure {
  const t = target ?? 0;
  return { target: t, actual, progress: t > 0 ? Math.min(Math.round((actual / t) * 100), 999) : null };
}

export async function targetSummary(userId: string, role: StaffKind, now: Date = new Date()): Promise<TargetSummary | null> {
  const year = now.getFullYear();
  const profile = await TargetProfile.findOne({ assigneeId: userId, assigneeRole: role, year, status: "active" })
    .sort({ updatedAt: -1 }).lean<Record<string, unknown> | null>();
  if (!profile) return null;
  const expected = expectedProgressPct(year, now);
  const currency = String(profile.currency ?? "AED");
  if (profile.targetType === "kpi3") {
    const kpis = await calculateKpis(
      [{ userId, role, currency, periods: fromStoredPeriods(profile.periods as Parameters<typeof fromStoredPeriods>[0]) }],
      year,
    );
    const totals = kpis.get(kpiOwnerKey(role, userId))?.totals ?? { jobs: 0, onboarded: 0, revenue: 0 };
    const jobs = measure(profile.jobTarget as number | undefined, totals.jobs);
    const onboarded = measure(profile.conversionTarget as number | undefined, totals.onboarded);
    const revenue = measure(profile.revenueTarget as number | undefined, totals.revenue);
    // Each part capped at 100 so one over-achieved measure cannot hide a lagging one.
    const parts = [jobs, onboarded, revenue].filter((m) => m.progress != null).map((m) => Math.min(m.progress ?? 0, 100));
    const overall = parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : 0;
    return {
      profileId: str(profile._id), year, currency, expectedProgress: expected, overallProgress: overall,
      risk: getRiskScore(overall, year, now), kind: "kpi3", jobs, onboarded, revenue,
    };
  }
  const [e] = await enrichProfiles([profile]);
  const progress = e?.profitProgress ?? 0;
  return {
    profileId: str(profile._id), year, currency, kind: "profit",
    expectedProgress: e?.expectedProgress ?? expected, overallProgress: Math.min(progress, 100), risk: e?.riskScore ?? "low",
    profit: { target: e?.profitTarget ?? 0, actual: e?.profitAchieved ?? 0, progress },
  };
}

async function teamRows(team: AgentDoc[], s: Scope, locale: string, activity: Map<string, Date | null>): Promise<TeamAgentRow[]> {
  if (team.length === 0) return [];
  const ids = team.map((a) => a._id as Id);
  const userIds = team.map((a) => a.userId as Id);
  const group = (field: string) => ({ $group: { _id: `$${field}`, n: { $sum: 1 } } });
  const [users, jobs, moved, hiresByAgent, owed, openTasks, overdue] = await Promise.all([
    User.find({ _id: { $in: userIds } }).select("name email isActive").lean(),
    Job.aggregate<{ _id: Id; n: number }>([{ $match: { agentId: { $in: ids }, deletedAt: null, createdAt: s.inRange } }, group("agentId")]),
    candidatesMovedBy(userIds, s.inRange),
    hiresPerAgent(s),
    Commission.aggregate<{ _id: { a: Id; c: string; s: string }; amount: number }>([
      { $match: { agentId: { $in: ids }, type: { $in: ["placement", "bonus"] }, status: { $in: ["pending", "approved"] }, createdAt: s.inRange } },
      { $group: { _id: { a: "$agentId", c: { $ifNull: ["$currency", "AED"] }, s: "$status" }, amount: { $sum: "$amount" } } },
    ]),
    AgentTask.aggregate<{ _id: Id; n: number }>([{ $match: { userId: { $in: userIds }, status: { $in: ["pending", "in_progress"] } } }, group("userId")]),
    AgentTask.aggregate<{ _id: Id; n: number }>([{ $match: { userId: { $in: userIds }, status: { $in: ["pending", "in_progress"] }, dueDate: { $lt: s.now } } }, group("userId")]),
  ]);
  const m = (rows: Array<{ _id: Id; n: number }>) => new Map(rows.map((r) => [str(r._id), r.n]));
  const [jobsM, openM, overM] = [m(jobs), m(openTasks), m(overdue)];
  const userMap = new Map(users.map((u) => [str(u._id), u]));
  const employersPer = new Map<string, number>();
  for (const agentId of s.employerAgent.values()) employersPer.set(agentId, (employersPer.get(agentId) ?? 0) + 1);

  const rows = await Promise.all(team.map(async (a) => {
    const u = userMap.get(str(a.userId));
    const regions = await regionNames(a, locale);
    return {
      userId: str(a.userId),
      name: u?.name ?? "—",
      email: u?.email ?? "",
      state: workState(u?.isActive !== false, activity.get(str(a.userId)), s.now),
      lastActivity: iso(activity.get(str(a.userId))) ?? null,
      regions: regions.join("; "),
      employers: employersPer.get(str(a._id)) ?? 0,
      jobsPosted: jobsM.get(str(a._id)) ?? 0,
      candidatesMoved: moved.get(str(a.userId)) ?? 0,
      hires: hiresByAgent.get(str(a._id)) ?? 0,
      commissionOwed: owedOf(foldMoney(owed.filter((r) => str(r._id.a) === str(a._id)).map((r) => ({ currency: r._id.c, status: r._id.s, amount: r.amount })))),
      openTasks: openM.get(str(a.userId)) ?? 0,
      overdueTasks: overM.get(str(a.userId)) ?? 0,
    } satisfies TeamAgentRow;
  }));
  const rank = { working: 0, idle: 1, inactive: 2 } as const;
  return rows.sort((x, y) => rank[x.state] - rank[y.state] || y.jobsPosted - x.jobsPosted);
}

/**
 * Build the admin report for one super agent or agent. Returns null when the
 * user id is not that role (or has no profile).
 */
export async function buildStaffReport(kind: StaffKind, userId: string, range: ReportRange, locale: string): Promise<StaffReport | null> {
  await connectDB();
  const now = new Date();
  const user = await User.findOne({ _id: userId, role: kind }).select("name email phone avatar isActive createdAt lastLogin").lean();
  if (!user) return null;

  let profile: Record<string, unknown> & { _id: unknown };
  let team: AgentDoc[];
  let saId: Id | undefined;
  let superAgent: StaffReport["superAgent"];
  if (kind === "super_agent") {
    const sa = await SuperAgent.findOne({ userId }).lean();
    if (!sa) return null;
    profile = sa as unknown as typeof profile;
    saId = sa._id as Id;
    team = await Agent.find({ superAgentId: saId }).select("_id userId assignedEmployerIds assignedCityIds assignedStateIds").lean<AgentDoc[]>();
  } else {
    const agent = await Agent.findOne({ userId }).lean();
    if (!agent) return null;
    profile = agent as unknown as typeof profile;
    team = [agent as unknown as AgentDoc];
    const sa = agent.superAgentId
      ? await SuperAgent.findById(agent.superAgentId).select("userId").populate("userId", "name").lean()
      : null;
    const saUser = (sa as { userId?: { _id?: unknown; name?: string } } | null)?.userId;
    superAgent = saUser ? { userId: str(saUser._id), name: saUser.name ?? "" } : null;
  }

  const agentIds = team.map((a) => a._id as Id);
  const agentUserIds = team.map((a) => a.userId as Id);
  const [held, agentUsers, activity] = await Promise.all([
    heldEmployers(team),
    User.find({ _id: { $in: agentUserIds } }).select("name").lean(),
    lastActivityByAgent(team, now),
  ]);
  const nameByUser = new Map(agentUsers.map((u) => [str(u._id), u.name ?? ""]));
  const agentNames = new Map(team.map((a) => [str(a._id), nameByUser.get(str(a.userId)) ?? "—"]));

  const s: Scope = {
    kind, saId, agentIds, agentUserIds, employerIds: held.ids, agentNames, employerAgent: held.holder,
    inRange: dateIn(rangeBounds(range)), now,
  };

  const [jobs, invoices, exhibitions, commission, tasks, target, regions, teamRowsResult, moved, seekerData] = await Promise.all([
    jobsSection(s),
    invoicesSection(s),
    exhibitionsSection(s),
    commissionSection(s, user.name ?? ""),
    tasksSection(user._id as Id, now),
    targetSummary(userId, kind, now),
    regionNames(profile as { assignedCityIds?: Id[]; assignedStateIds?: Id[] }, locale),
    kind === "super_agent" ? teamRows(team, s, locale, activity) : Promise.resolve(undefined),
    kind === "agent" ? candidatesMovedBy(agentUserIds, s.inRange) : Promise.resolve(new Map<string, number>()),
    kind === "agent" ? agentSeekers(agentIds[0]) : Promise.resolve(undefined),
  ]);
  const employers = await employersSection(s, jobs.perEmployer);

  const identity: StaffIdentity = {
    userId: str(user._id), name: user.name ?? "", email: user.email ?? "", phone: user.phone, avatar: user.avatar,
    isActive: user.isActive !== false, archived: Boolean(profile.roleArchivedAt),
    createdAt: iso(user.createdAt), lastLogin: iso(user.lastLogin) ?? null, regions,
    country: profile.country as string | undefined, currencyCode: profile.currencyCode as string | undefined,
    referralCode: profile.referralCode as string | undefined,
  };

  const ownLast = kind === "agent" ? activity.get(userId) ?? null : null;
  const working = teamRowsResult ? { working: teamRowsResult.filter((r) => r.state === "working").length, total: teamRowsResult.length } : undefined;
  const rate = Number(kind === "super_agent" ? profile.overrideRate ?? 0 : profile.commissionRate ?? 0);

  const gaps = allGaps({
    kind, isActive: identity.isActive, archived: identity.archived, hasRegion: regions.length > 0,
    lastLogin: identity.lastLogin, overdueTasks: tasks.overdue, disputedCommission: commission.disputed,
    teamSize: kind === "super_agent" ? team.length : undefined,
    overdueReceivables: invoices.receivables.overdueCount, target, workingAgents: working,
    employers: employers.total, jobsPostedInRange: jobs.tiles.jobs.posted, activeJobs: jobs.activeJobs,
    applicationsLast30: jobs.appsLast30, approvedUnpaid: commission.approvedUnpaid,
    stalePendingCommission: commission.stalePending,
    hasSuperAgent: kind === "agent" ? Boolean(superAgent) : undefined, rate,
    agentsWithoutRegion: teamRowsResult?.filter((r) => !r.regions).length,
    subscriptionsEndingSoon: employers.endingSoon, employersWithoutSubscription: employers.withoutSubscription,
    employersWithoutActiveJob: employers.withoutActiveJob,
    applicationsTotal: jobs.applicationsTotal, hiresTotal: jobs.tiles.hires.hired + jobs.tiles.hires.placements,
  }, now);

  const commissionAll = kind === "super_agent" ? commission.combined : commission.own;
  return {
    kind, range, generatedAt: now.toISOString(), identity,
    state: kind === "agent" ? workState(identity.isActive, ownLast, now) : (identity.isActive ? "working" : "inactive"),
    lastActivity: iso(ownLast) ?? null,
    rate,
    defaultAgentRate: kind === "super_agent" ? Number(profile.defaultAgentCommissionRate ?? 0) : undefined,
    superAgent,
    tiles: {
      ...jobs.tiles,
      candidatesMoved: kind === "agent" ? moved.get(userId) ?? 0 : undefined,
      invoices: invoices.tile,
      receivables: invoices.receivables,
      subscriptions: { active: employers.activeSubscriptions, employers: employers.total },
      exhibitions: exhibitions.tile,
      workingAgents: working,
      commission: { owed: owedOf(commissionAll), paid: paidOf(commissionAll) },
    },
    funnel: jobs.funnel,
    target,
    gaps,
    team: teamRowsResult,
    employers: employers.rows,
    jobs: jobs.jobRows,
    invoices: invoices.rows,
    exhibitions: exhibitions.rows,
    commission: { lines: commission.lines, own: commission.own, team: commission.team, combined: commission.combined },
    tasks,
    seekers: seekerData,
    activity: kind === "agent"
      ? ((profile.activityLog ?? []) as Array<{ action: string; targetType?: string; timestamp: Date }>)
        .slice(-20).reverse().map((a) => ({ action: a.action, targetType: a.targetType, at: iso(a.timestamp) ?? "" }))
      : undefined,
  };
}

/**
 * Hires in the range per team agent, by the same rule as the Hires tile:
 * applications moved to Hired on jobs the agent posted, or on jobs of an
 * employer that agent holds.
 */
async function hiresPerAgent(s: Scope): Promise<Map<string, number>> {
  const jobs = await Job.find({ deletedAt: null, $or: [{ agentId: { $in: s.agentIds } }, { employerId: { $in: s.employerIds } }] })
    .select("_id agentId employerId").lean();
  const ownerOf = new Map<string, string>();
  for (const j of jobs) {
    const owner = j.agentId && s.agentNames.has(str(j.agentId)) ? str(j.agentId) : s.employerAgent.get(str(j.employerId));
    if (owner) ownerOf.set(str(j._id), owner);
  }
  if (ownerOf.size === 0) return new Map();
  const rows = await Application.aggregate<{ _id: Id; n: number }>([
    {
      $match: {
        jobId: { $in: [...ownerOf.keys()].map((k) => new mongoose.Types.ObjectId(k)) },
        status: "hired",
        statusHistory: { $elemMatch: { status: "hired", changedAt: s.inRange } },
      },
    },
    { $group: { _id: "$jobId", n: { $sum: 1 } } },
  ]);
  const out = new Map<string, number>();
  for (const r of rows) {
    const agent = ownerOf.get(str(r._id));
    if (agent) out.set(agent, (out.get(agent) ?? 0) + r.n);
  }
  return out;
}

async function agentSeekers(agentId: Id) {
  const match = { $or: [{ "referral.agentId": agentId }, { agentId }] };
  const [total, docs] = await Promise.all([
    JobSeeker.countDocuments(match),
    JobSeeker.find(match).sort({ createdAt: -1 }).limit(50).select("fullName referral createdAt userId").populate("userId", "name").lean(),
  ]);
  type Doc = { _id: unknown; fullName?: string; referral?: unknown; createdAt?: Date; userId?: { name?: string } | null };
  return {
    total,
    rows: (docs as unknown as Doc[]).map((d) => ({
      id: str(d._id), name: d.fullName || d.userId?.name || "—",
      how: (d.referral ? "referred" : "assigned") as "referred" | "assigned", createdAt: iso(d.createdAt),
    })),
  };
}
