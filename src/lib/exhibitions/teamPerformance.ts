import ExhibitionRequest from "@/models/ExhibitionRequest";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import User from "@/models/User";

/**
 * Exhibition performance by hierarchy, for the admin analytics page: each
 * super agent with their team's totals, and every agent under them (client
 * feedback 2026-10-15: "each their super agent and his under agents
 * performance"). Money stays per currency: requests are raised in INR, AED,
 * SAR… and one summed figure in one symbol would be wrong.
 */

/** Statuses that have cleared approval (completed passed approval first). */
export const APPROVED_STATUSES = ["approved", "budget_approved", "resources_assigned", "active", "completed"];
/** Waiting on a reviewer or on the agent's revision. */
export const IN_REVIEW_STATUSES = ["submitted", "under_review", "revision_requested"];

/**
 * Reads a settled event (archived after completion) as completed, so settling
 * the balance does not drop the event from the counts. Archive also closes a
 * rejection; that one has no completed entry and stays archived. Goes right
 * after the $match of any aggregate that groups by status.
 */
export const SETTLED_AS_COMPLETED = {
  $addFields: {
    status: {
      $cond: [
        { $and: [{ $eq: ["$status", "archived"] }, { $in: ["completed", { $ifNull: ["$statusHistory.status", []] }] }] },
        "completed",
        "$status",
      ],
    },
  },
};

export type MoneyByCurrency = Record<string, number>;

export interface ExhibitionStats {
  requests: number;
  inReview: number;
  approved: number;
  rejected: number;
  completed: number;
  /** approved ÷ (approved + rejected), the analytics page's headline formula. */
  approvalRate: number;
  /** Expected leads on completed events, beside the leads they collected. */
  expectedLeads: number;
  leadsCollected: number;
  /** Completed events that carry an outcome report. */
  eventsReported: number;
  approvedBudget: MoneyByCurrency;
  actualSpend: MoneyByCurrency;
}

export interface AgentPerformance extends ExhibitionStats {
  agentId: string;
  name: string;
  email?: string;
}

export interface TeamPerformance extends ExhibitionStats {
  /** The super agent's user id; null for agents without one. */
  superAgentId: string | null;
  name: string | null;
  email?: string;
  agentCount: number;
  /** Agents with at least one request this year. */
  activeAgents: number;
  agents: AgentPerformance[];
}

/** One aggregate row: an agent's requests in one currency. */
export interface StatsRow {
  agentId: string;
  currency?: string | null;
  requests: number;
  inReview: number;
  approved: number;
  rejected: number;
  completed: number;
  expectedLeads: number;
  leadsCollected: number;
  eventsReported: number;
  approvedBudget: number;
  actualSpend: number;
}

export function emptyStats(): ExhibitionStats {
  return {
    requests: 0, inReview: 0, approved: 0, rejected: 0, completed: 0, approvalRate: 0,
    expectedLeads: 0, leadsCollected: 0, eventsReported: 0, approvedBudget: {}, actualSpend: {},
  };
}

function addMoney(into: MoneyByCurrency, currency: string, amount: number) {
  if (!amount) return;
  into[currency] = (into[currency] ?? 0) + amount;
}

function addStats(into: ExhibitionStats, from: ExhibitionStats | StatsRow, currency?: string) {
  into.requests += from.requests;
  into.inReview += from.inReview;
  into.approved += from.approved;
  into.rejected += from.rejected;
  into.completed += from.completed;
  into.expectedLeads += from.expectedLeads;
  into.leadsCollected += from.leadsCollected;
  into.eventsReported += from.eventsReported;
  if (typeof from.approvedBudget === "number") {
    addMoney(into.approvedBudget, currency || "AED", from.approvedBudget);
    addMoney(into.actualSpend, currency || "AED", from.actualSpend as number);
  } else {
    for (const [code, amount] of Object.entries(from.approvedBudget)) addMoney(into.approvedBudget, code, amount);
    for (const [code, amount] of Object.entries(from.actualSpend as MoneyByCurrency)) addMoney(into.actualSpend, code, amount);
  }
}

function withRate<T extends ExhibitionStats>(stats: T): T {
  const decided = stats.approved + stats.rejected;
  return { ...stats, approvalRate: decided > 0 ? Math.round((stats.approved / decided) * 100) : 0 };
}

interface PersonRef { name?: string; email?: string }

/**
 * Pure: group the per-agent rows under each agent's super agent. Every
 * current agent appears, with zeros when they raised nothing, so an idle
 * agent is visible rather than missing. Agents without a super agent are
 * the last group.
 */
export function foldTeamPerformance(
  rows: StatsRow[],
  agents: { userId: string; superAgentProfileId: string | null }[],
  superAgents: { profileId: string; userId: string; agentProfileUserIds: string[] }[],
  people: Map<string, PersonRef>,
): TeamPerformance[] {
  const byAgent = new Map<string, ExhibitionStats>();
  for (const row of rows) {
    const stats = byAgent.get(row.agentId) ?? emptyStats();
    addStats(stats, row, row.currency ?? undefined);
    byAgent.set(row.agentId, stats);
  }

  const saByProfile = new Map(superAgents.map((sa) => [sa.profileId, sa]));
  // SuperAgent.agentIds is the fallback when an agent's own link is missing.
  const saByMember = new Map<string, string>();
  for (const sa of superAgents) for (const userId of sa.agentProfileUserIds) saByMember.set(userId, sa.userId);

  const teamOf = (agentUserId: string, profileId: string | null): string | null => {
    const linked = profileId ? saByProfile.get(profileId)?.userId : undefined;
    return linked ?? saByMember.get(agentUserId) ?? null;
  };

  const teams = new Map<string | null, TeamPerformance>();
  const ensureTeam = (saUserId: string | null) => {
    let team = teams.get(saUserId);
    if (!team) {
      const person = saUserId ? people.get(saUserId) : undefined;
      team = { ...emptyStats(), superAgentId: saUserId, name: person?.name ?? null, email: person?.email, agentCount: 0, activeAgents: 0, agents: [] };
      teams.set(saUserId, team);
    }
    return team;
  };
  for (const sa of superAgents) ensureTeam(sa.userId);

  const seen = new Set<string>();
  const place = (agentUserId: string, profileId: string | null) => {
    if (seen.has(agentUserId)) return;
    seen.add(agentUserId);
    const team = ensureTeam(teamOf(agentUserId, profileId));
    const stats = byAgent.get(agentUserId) ?? emptyStats();
    const person = people.get(agentUserId);
    team.agents.push(withRate({ ...stats, agentId: agentUserId, name: person?.name ?? "", email: person?.email }));
    addStats(team, stats);
    team.agentCount += 1;
    if (stats.requests > 0) team.activeAgents += 1;
  };
  for (const agent of agents) place(agent.userId, agent.superAgentProfileId);
  // Requests from someone no longer listed as an agent still count somewhere.
  for (const agentUserId of byAgent.keys()) place(agentUserId, null);

  const result = [...teams.values()].map((team) => {
    team.agents.sort((a, b) => b.requests - a.requests || a.name.localeCompare(b.name));
    return withRate(team);
  });
  return result
    .filter((team) => team.superAgentId !== null || team.agentCount > 0)
    .sort((a, b) => {
      if ((a.superAgentId === null) !== (b.superAgentId === null)) return a.superAgentId === null ? 1 : -1;
      return b.requests - a.requests || (a.name ?? "").localeCompare(b.name ?? "");
    });
}

/** Load and fold for the requests matching `baseFilter` (year + not deleted). */
export async function loadTeamPerformance(baseFilter: Record<string, unknown>): Promise<TeamPerformance[]> {
  const [rows, agents, superAgents] = await Promise.all([
    ExhibitionRequest.aggregate([
      { $match: baseFilter },
      SETTLED_AS_COMPLETED,
      {
        $group: {
          _id: { agent: "$agentId", currency: "$budgetCurrency" },
          requests: { $sum: 1 },
          inReview: { $sum: { $cond: [{ $in: ["$status", IN_REVIEW_STATUSES] }, 1, 0] } },
          approved: { $sum: { $cond: [{ $in: ["$status", APPROVED_STATUSES] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
          expectedLeads: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, { $ifNull: ["$expectedLeads", 0] }, 0] } },
          leadsCollected: { $sum: { $ifNull: ["$completionReport.actualLeads", 0] } },
          eventsReported: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "completed"] }, { $gt: ["$completionReport", null] }] }, 1, 0] } },
          approvedBudget: { $sum: { $cond: [{ $in: ["$status", APPROVED_STATUSES] }, { $ifNull: ["$approvedBudget", 0] }, 0] } },
          actualSpend: { $sum: { $ifNull: ["$actualSpend", 0] } },
        },
      },
    ]),
    Agent.find({ roleArchivedAt: null }).select("userId superAgentId").lean(),
    SuperAgent.find({ roleArchivedAt: null }).select("_id userId agentIds").lean(),
  ]);

  const memberProfileIds = superAgents.flatMap((sa) => ((sa.agentIds ?? []) as unknown[]).map(String));
  const memberProfiles = memberProfileIds.length
    ? await Agent.find({ _id: { $in: memberProfileIds } }).select("_id userId").lean()
    : [];
  const userIdByProfile = new Map(memberProfiles.map((a) => [String(a._id), String(a.userId)]));

  const personIds = new Set<string>([
    ...rows.map((r: { _id: { agent: unknown } }) => String(r._id.agent)),
    ...agents.map((a) => String(a.userId)),
    ...superAgents.map((sa) => String(sa.userId)),
  ]);
  const users = await User.find({ _id: { $in: [...personIds] } }).select("_id name email").lean();
  const people = new Map(users.map((u) => [String(u._id), { name: u.name as string | undefined, email: u.email as string | undefined }]));

  return foldTeamPerformance(
    rows.map((r: { _id: { agent: unknown; currency?: string | null } } & Omit<StatsRow, "agentId" | "currency">) => ({
      ...r,
      agentId: String(r._id.agent),
      currency: r._id.currency,
    })),
    agents.map((a) => ({ userId: String(a.userId), superAgentProfileId: a.superAgentId ? String(a.superAgentId) : null })),
    superAgents.map((sa) => ({
      profileId: String(sa._id),
      userId: String(sa.userId),
      agentProfileUserIds: ((sa.agentIds ?? []) as unknown[]).map((id) => userIdByProfile.get(String(id))).filter((id): id is string => Boolean(id)),
    })),
    people,
  );
}

/**
 * The year's event outcomes from the completion reports, which is where
 * leads collected and actual spend are recorded. The analytics page read
 * them from ExhibitionPerformance, which no screen writes, so they were 0.
 */
export async function loadOutcomes(baseFilter: Record<string, unknown>): Promise<Omit<ExhibitionStats, "inReview" | "approvalRate"> & { completedWithoutReport: number }> {
  const rows = await ExhibitionRequest.aggregate([
    { $match: baseFilter },
    SETTLED_AS_COMPLETED,
    {
      $group: {
        _id: "$budgetCurrency",
        requests: { $sum: 1 },
        approved: { $sum: { $cond: [{ $in: ["$status", APPROVED_STATUSES] }, 1, 0] } },
        rejected: { $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] } },
        completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
        expectedLeads: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, { $ifNull: ["$expectedLeads", 0] }, 0] } },
        leadsCollected: { $sum: { $ifNull: ["$completionReport.actualLeads", 0] } },
        eventsReported: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "completed"] }, { $gt: ["$completionReport", null] }] }, 1, 0] } },
        approvedBudget: { $sum: { $cond: [{ $in: ["$status", APPROVED_STATUSES] }, { $ifNull: ["$approvedBudget", 0] }, 0] } },
        actualSpend: { $sum: { $ifNull: ["$actualSpend", 0] } },
      },
    },
  ]);
  const total = emptyStats();
  for (const row of rows) addStats(total, { ...row, agentId: "", inReview: 0 }, row._id ?? undefined);
  const { inReview: _inReview, approvalRate: _rate, ...rest } = total;
  return { ...rest, completedWithoutReport: Math.max(0, total.completed - total.eventsReported) };
}
