import { getSuperAgentBook, getSuperAgentScope, type RegionInfo } from "@/lib/auth/agentRestrictions";
import { EMPTY_AGENT_PERFORMANCE, getLiveAgentPerformance } from "@/lib/agentPerformance";
import { isValidTimeZone } from "@/lib/datetime/zone";
import { monthStartInZone, recentMonthKeys } from "@/lib/datetime/zonedMonth";
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

/**
 * Everything the super-agent home shows, counted live from the collections.
 *
 * Scope is the canonical one — getSuperAgentScope(), team ∪ region — and each
 * figure is counted with the same filter as the list page it opens, so the
 * number on the card is the number of rows the SA lands on. "This month" is
 * the calendar month in the super-agent's own time zone.
 */

const FALLBACK_TIME_ZONE = "Asia/Dubai";
export const ACTIVITY_MONTHS = 6;

export interface SuperAgentKpis {
  activeAgents: number;
  newAgentsThisMonth: number;
  employers: number;
  newEmployersThisMonth: number;
  activeJobs: number;
  jobsPostedThisMonth: number;
  placementsThisMonth: number;
  placementsLastMonth: number;
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

export interface SuperAgentDashboardData {
  timeZone: string;
  kpis: SuperAgentKpis;
  funnel: SuperAgentFunnel;
  queue: SuperAgentQueueCounts;
  topAgents: TopAgentRow[];
  activity: ActivityMonth[];
  /** The SA's own assigned ids, for naming the region. */
  region: RegionInfo | null;
}

/** One `$group` by local month; `$match` does no casting, so ids must be ObjectIds. */
async function countByMonth(
  model: { aggregate: (pipeline: unknown[]) => Promise<{ _id: string; count: number }[]> },
  match: Record<string, unknown>,
  since: Date,
  timeZone: string,
): Promise<Map<string, number>> {
  const rows = await model.aggregate([
    { $match: { ...match, createdAt: { $gte: since } } },
    { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt", timezone: timeZone } }, count: { $sum: 1 } } },
  ]);
  return new Map((rows ?? []).map((r) => [String(r._id), r.count]));
}

export async function loadSuperAgentDashboard(saUserId: string, now: Date = new Date()): Promise<SuperAgentDashboardData> {
  const [scope, book, saProfile] = await Promise.all([
    getSuperAgentScope(saUserId),
    getSuperAgentBook(saUserId),
    SuperAgent.findOne({ userId: saUserId }).select("timezone").lean<{ timezone?: string } | null>(),
  ]);
  const timeZone = isValidTimeZone(saProfile?.timezone) ? (saProfile!.timezone as string) : FALLBACK_TIME_ZONE;
  const monthStart = monthStartInZone(timeZone, now, 0);
  const lastMonthStart = monthStartInZone(timeZone, now, 1);
  const activitySince = monthStartInZone(timeZone, now, ACTIVITY_MONTHS - 1);

  const agentDocIds = scope?.effectiveAgentIds ?? [];
  const saProfileId = scope?.saProfileId;
  // `performance` is deliberately not selected — see getLiveAgentPerformance.
  const agentDocs = await Agent.find({ _id: { $in: agentDocIds } }).select("userId").lean();
  const agentUserIds = agentDocs.map((a) => a.userId);

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

  const [
    activeAgents, newAgentsThisMonth, totalEmployers, newEmployersThisMonth,
    totalJobs, activeJobs, jobsPostedThisMonth, jobDocs,
    totalPlacements, placementsThisMonth, placementsLastMonth,
    totalLeads,
  ] = await Promise.all([
    User.countDocuments({ _id: { $in: agentUserIds }, isActive: true }),
    Agent.countDocuments({ _id: { $in: agentDocIds }, createdAt: { $gte: monthStart } }),
    agentDocIds.length ? Employer.countDocuments(employerFilter) : Promise.resolve(0),
    agentDocIds.length
      ? Employer.countDocuments({ ...employerFilter, createdAt: { $gte: monthStart } })
      : Promise.resolve(0),
    Job.countDocuments(jobFilter),
    Job.countDocuments({ ...jobFilter, status: "active" }),
    Job.countDocuments({ ...jobFilter, createdAt: { $gte: monthStart } }),
    Job.find(jobFilter).select("_id").lean(),
    Placement.countDocuments(placementFilter),
    Placement.countDocuments({ ...placementFilter, placedAt: { $gte: monthStart } }),
    Placement.countDocuments({ ...placementFilter, placedAt: { $gte: lastMonthStart, $lt: monthStart } }),
    Lead.countDocuments(leadFilter),
  ]);

  const jobIds = jobDocs.map((j) => j._id);
  const totalApplications = jobIds.length ? await Application.countDocuments({ jobId: { $in: jobIds } }) : 0;

  // ── Work actually waiting on this super-agent ──────────────────────────
  // ExhibitionRequest.agentId stores the Agent's User._id; Commission
  // .superAgentId references the SuperAgent profile _id — the same two shapes
  // /api/exhibitions and /api/commissions use.
  const [pendingExhibitions, pendingCommissions, overdueFollowUps, agentsWithLeads] = await Promise.all([
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
  ]);

  // ── Team: live figures, never Agent.performance (it drifted by 17 placements) ──
  const [agentUsers, livePerformance] = await Promise.all([
    User.find({ _id: { $in: agentUserIds } }).select("name email").lean(),
    getLiveAgentPerformance(agentDocIds),
  ]);
  const agentName = new Map(agentUsers.map((u) => [String(u._id), (u.name as string) || (u.email as string) || ""]));
  const topAgents: TopAgentRow[] = agentDocs
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

  // ── Six months of team activity, by local month ─────────────────────────
  const [leadsByMonth, jobsByMonth, appsByMonth] = await Promise.all([
    countByMonth(Lead as never, leadFilter, activitySince, timeZone),
    countByMonth(Job as never, jobFilter, activitySince, timeZone),
    jobIds.length
      ? countByMonth(Application as never, { jobId: { $in: jobIds } }, activitySince, timeZone)
      : Promise.resolve(new Map<string, number>()),
  ]);
  const activity: ActivityMonth[] = recentMonthKeys(timeZone, now, ACTIVITY_MONTHS).map((month) => ({
    month,
    leads: leadsByMonth.get(month) ?? 0,
    jobs: jobsByMonth.get(month) ?? 0,
    applications: appsByMonth.get(month) ?? 0,
  }));

  return {
    timeZone,
    kpis: {
      activeAgents,
      newAgentsThisMonth,
      employers: totalEmployers,
      newEmployersThisMonth,
      activeJobs,
      jobsPostedThisMonth,
      placementsThisMonth,
      placementsLastMonth,
    },
    funnel: {
      leads: totalLeads,
      employers: totalEmployers,
      jobs: totalJobs,
      applications: totalApplications,
      placements: totalPlacements,
    },
    queue: {
      pendingExhibitions,
      pendingCommissions,
      overdueFollowUps,
      inactiveAgents: Math.max(0, agentUserIds.length - activeAgents),
      // Idle = no lead at all; distinct() returns only the agents that have one.
      idleAgents: Math.max(0, agentDocIds.length - agentsWithLeads.length),
    },
    topAgents,
    activity,
    region: scope ? { assignedCityIds: scope.assignedCityIds, assignedStateIds: scope.assignedStateIds } : null,
  };
}
