/**
 * Agent & Super-Agent access restriction utilities.
 *
 * Agents are assigned to cities/states. These helpers enforce
 * that agents can only view and interact with resources in their assigned region.
 *
 * Super-Agents have their own regions (assignedCityIds/assignedStateIds) which
 * represent their territory. Their effective region is the union of:
 *   1. Their own assignedCityIds/assignedStateIds (explicit territory)
 *   2. All regions of their managed agents (inherited via agentIds[])
 */

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import { isValidObjectId } from "@/lib/security/sanitize";
import mongoose from "mongoose";

export interface RegionInfo {
  assignedCityIds: mongoose.Types.ObjectId[];
  assignedStateIds: mongoose.Types.ObjectId[];
}

/**
 * Combined scope for super-agent data access.
 * Includes both team-based (agentIds) and region-based scoping.
 */
export interface SuperAgentScope {
  /** The SuperAgent document _id */
  saProfileId: mongoose.Types.ObjectId;
  /** Agents explicitly assigned to this SA via agentIds[] */
  teamAgentIds: mongoose.Types.ObjectId[];
  /** Agents found via region overlap (not necessarily in agentIds) */
  regionAgentIds: mongoose.Types.ObjectId[];
  /** Union of teamAgentIds + regionAgentIds — use this for queries */
  effectiveAgentIds: mongoose.Types.ObjectId[];
  /** SA's own assigned city IDs */
  assignedCityIds: mongoose.Types.ObjectId[];
  /** SA's own assigned state IDs */
  assignedStateIds: mongoose.Types.ObjectId[];
}

/** @deprecated Use RegionInfo instead */
type AgentRegionInfo = RegionInfo;

/** Get the agent's assigned city and state IDs. */
export async function getAgentRegion(agentUserId: string): Promise<RegionInfo | null> {
  await connectDB();
  const agent = await Agent.findOne({ userId: agentUserId })
    .select("assignedCityIds assignedStateIds")
    .lean();
  if (!agent) return null;
  return {
    assignedCityIds: (agent.assignedCityIds as mongoose.Types.ObjectId[]) ?? [],
    assignedStateIds: (agent.assignedStateIds as mongoose.Types.ObjectId[]) ?? [],
  };
}

/**
 * Get the super-agent's OWN region (not including agents' regions).
 * Used for validating agent region subset checks.
 */
export async function getSuperAgentOwnRegion(saUserId: string): Promise<RegionInfo | null> {
  await connectDB();
  const sa = await SuperAgent.findOne({ userId: saUserId })
    .select("assignedCityIds assignedStateIds")
    .lean();
  if (!sa) return null;
  return {
    assignedCityIds: (sa.assignedCityIds as mongoose.Types.ObjectId[]) ?? [],
    assignedStateIds: (sa.assignedStateIds as mongoose.Types.ObjectId[]) ?? [],
  };
}

/**
 * Get the super-agent's full data scope: team agents + region-overlapping agents.
 *
 * This implements dual-scoping:
 *  1. Team-based: agents explicitly in the SA's agentIds[]
 *  2. Region-based: any agents whose assignedCityIds/assignedStateIds overlap
 *     with the SA's own regions (even if not in agentIds)
 *
 * Returns effectiveAgentIds (union of both) for use in resource queries.
 */
export async function getSuperAgentScope(saUserId: string): Promise<SuperAgentScope | null> {
  await connectDB();

  const sa = await SuperAgent.findOne({ userId: saUserId })
    .select("_id agentIds assignedCityIds assignedStateIds")
    .lean();
  if (!sa) return null;

  const teamAgentIds = (sa.agentIds as mongoose.Types.ObjectId[]) ?? [];
  const assignedCityIds = (sa.assignedCityIds as mongoose.Types.ObjectId[]) ?? [];
  const assignedStateIds = (sa.assignedStateIds as mongoose.Types.ObjectId[]) ?? [];

  // Find agents whose regions overlap with SA's assigned regions.
  // Exclude agents that belong to a DIFFERENT super-agent to prevent scope leakage.
  const regionConditions: Record<string, unknown>[] = [];
  if (assignedCityIds.length > 0) {
    regionConditions.push({ assignedCityIds: { $in: assignedCityIds } });
  }
  if (assignedStateIds.length > 0) {
    regionConditions.push({ assignedStateIds: { $in: assignedStateIds } });
  }

  let regionAgentIds: mongoose.Types.ObjectId[] = [];
  if (regionConditions.length > 0) {
    const regionAgents = await Agent.find({
      $and: [
        { $or: regionConditions },
        // Only include agents with no SA or assigned to THIS SA
        { $or: [
          { superAgentId: { $exists: false } },
          { superAgentId: null },
          { superAgentId: sa._id },
        ]},
      ],
    })
      .select("_id")
      .lean();
    regionAgentIds = regionAgents.map((a) => a._id as mongoose.Types.ObjectId);
  }

  const effectiveAgentIds = deduplicateIds([...teamAgentIds, ...regionAgentIds]);

  return {
    saProfileId: sa._id as mongoose.Types.ObjectId,
    teamAgentIds,
    regionAgentIds,
    effectiveAgentIds,
    assignedCityIds,
    assignedStateIds,
  };
}

/**
 * Query fragment matching employers registered inside a territory. An
 * employer's region is the catalogue city picked at signup (`regionCityId`,
 * with its `regionStateId`), so a territory covers it by holding that city or
 * the whole state. Territories may overlap: every super-agent and agent whose
 * territory covers the region sees the employer. `null` for an empty territory.
 */
export function employerRegionMatch(region: RegionInfo): Record<string, unknown> | null {
  const or: Record<string, unknown>[] = [];
  if (region.assignedCityIds.length > 0) or.push({ regionCityId: { $in: region.assignedCityIds } });
  if (region.assignedStateIds.length > 0) or.push({ regionStateId: { $in: region.assignedStateIds } });
  return or.length > 0 ? { $or: or } : null;
}

/**
 * Query fragment matching job seekers whose area (the catalogue city they
 * picked, `regionCityId`/`regionStateId` like an employer's) lies inside a
 * territory. A seeker who hid their profile is never matched: the area makes
 * someone visible to the staff who cover it, it never overrides "hidden".
 * `null` for an empty territory.
 */
export function seekerRegionMatch(region: RegionInfo): Record<string, unknown> | null {
  const match = employerRegionMatch(region);
  return match ? { ...match, profileVisibility: { $ne: "hidden" } } : null;
}

/** The per-record form of `seekerRegionMatch`. */
export function seekerInRegion(
  seeker: { regionCityId?: unknown; regionStateId?: unknown; profileVisibility?: string | null },
  region: RegionInfo | null,
): boolean {
  if (!region || seeker.profileVisibility === "hidden") return false;
  const has = (ids: mongoose.Types.ObjectId[], id: unknown) => id != null && ids.some((x) => String(x) === String(id));
  return has(region.assignedCityIds, seeker.regionCityId) || has(region.assignedStateIds, seeker.regionStateId);
}

/** Live (not role-archived) employers registered inside `region`. */
async function findRegionEmployerIds(region: RegionInfo): Promise<mongoose.Types.ObjectId[]> {
  const match = employerRegionMatch(region);
  if (!match) return [];
  const { Employer } = await import("@/models/Employer");
  const rows = await Employer.find({ ...match, roleArchivedAt: null }).select("_id").lean();
  return rows.map((e) => e._id as mongoose.Types.ObjectId);
}

/**
 * Resolve the employer _ids a super-agent may see — `getSuperAgentBook`'s
 * employer set (agent links from both ends, plus every employer registered in
 * the territory). Returns [] when the SA has no scope — callers MUST treat []
 * as "see nothing" (default-deny), never as "no filter". This is the single
 * source of truth for scoping super_agent reads on generic resource routes.
 */
export async function getSuperAgentEmployerIds(
  saUserId: string
): Promise<mongoose.Types.ObjectId[]> {
  const book = await getSuperAgentBook(saUserId);
  return book?.employerIds ?? [];
}

/**
 * Everything a super-agent's territory contains, resolved once.
 *
 * The link between an agent and an employer is written from both ends —
 * `Agent.assignedEmployerIds` and `Employer.agentId` — and routes picked one or
 * the other, so the same super-agent's dashboard said 24 employers while the
 * territory page said 23 and the AI report said something else again. This is
 * the union, which is the set the dashboard has always shown; nothing here is
 * visible to a super-agent who could not already see it.
 *
 * `ownershipMatch` is the matching query fragment for the three collections
 * that carry both an `employerId` and an `agentId` (Job, Application,
 * Placement): a job the agent posted belongs to the territory even when the
 * employer's own pointer has drifted.
 *
 * Employers registered in the territory (`employerRegionMatch`) are in the
 * book too, with or without an agent. The territory is the SA's own region plus
 * every in-scope agent's, so an SA always sees what their agents see.
 */
export interface SuperAgentBook {
  agentIds: mongoose.Types.ObjectId[];
  /** The SA's own team (`SuperAgent.agentIds`) — the agents whose regions extend the territory. */
  teamAgentIds: mongoose.Types.ObjectId[];
  employerIds: mongoose.Types.ObjectId[];
  saProfileId: mongoose.Types.ObjectId;
  /** `{ $or: [...] }`, or a match-nothing filter when the territory is empty. */
  ownershipMatch: Record<string, unknown>;
  /** The SA's own cities/states plus their live team agents' — see `territoryFrom`. */
  territory: RegionInfo;
}

interface TerritoryAgentDoc {
  _id: mongoose.Types.ObjectId;
  assignedCityIds?: mongoose.Types.ObjectId[];
  assignedStateIds?: mongoose.Types.ObjectId[];
  roleArchivedAt?: Date | null;
}

/**
 * Only the SA's own team (live agents in `agentIds`) extends the territory.
 * A region-overlap agent from outside the team brings its assigned employers,
 * not its whole region. territoryCoverage reads the territory the same way, so
 * the admin's "who covers this employer" matches the book.
 */
function territoryFrom(scope: SuperAgentScope, agentDocs: TerritoryAgentDoc[]): RegionInfo {
  const team = new Set(scope.teamAgentIds.map(String));
  const territoryAgents = agentDocs.filter((a) => team.has(String(a._id)) && !a.roleArchivedAt);
  return {
    assignedCityIds: deduplicateIds([
      ...scope.assignedCityIds,
      ...territoryAgents.flatMap((a) => a.assignedCityIds ?? []),
    ]),
    assignedStateIds: deduplicateIds([
      ...scope.assignedStateIds,
      ...territoryAgents.flatMap((a) => a.assignedStateIds ?? []),
    ]),
  };
}

/**
 * A super-agent's territory alone, without resolving the whole book. Pass the
 * scope when the caller already holds it, to skip resolving it twice.
 */
export async function getSuperAgentTerritory(
  saUserId: string,
  knownScope?: SuperAgentScope | null,
): Promise<RegionInfo | null> {
  const scope = knownScope === undefined ? await getSuperAgentScope(saUserId) : knownScope;
  if (!scope) return null;
  const teamDocs = scope.teamAgentIds.length > 0
    ? await Agent.find({ _id: { $in: scope.teamAgentIds } })
        .select("_id assignedCityIds assignedStateIds roleArchivedAt")
        .lean<TerritoryAgentDoc[]>()
    : [];
  return territoryFrom(scope, teamDocs);
}

export async function getSuperAgentBook(saUserId: string): Promise<SuperAgentBook | null> {
  const scope = await getSuperAgentScope(saUserId);
  if (!scope) return null;

  const agentIds = scope.effectiveAgentIds;
  const { Employer } = await import("@/models/Employer");
  let agentDocs: Array<{
    _id: mongoose.Types.ObjectId;
    assignedEmployerIds?: mongoose.Types.ObjectId[];
    assignedCityIds?: mongoose.Types.ObjectId[];
    assignedStateIds?: mongoose.Types.ObjectId[];
    roleArchivedAt?: Date | null;
  }> = [];
  let ownedEmployers: Array<{ _id: unknown }> = [];
  if (agentIds.length > 0) {
    [agentDocs, ownedEmployers] = await Promise.all([
      Agent.find({ _id: { $in: agentIds } })
        .select("_id assignedEmployerIds assignedCityIds assignedStateIds roleArchivedAt")
        .lean(),
      Employer.find({ agentId: { $in: agentIds } }).select("_id").lean(),
    ]);
  }

  const territory = territoryFrom(scope, agentDocs);
  const regionEmployerIds = await findRegionEmployerIds(territory);

  const employerIds = deduplicateIds([
    ...agentDocs.flatMap((a) => a.assignedEmployerIds ?? []),
    ...ownedEmployers.map((e) => e._id as mongoose.Types.ObjectId),
    ...regionEmployerIds,
  ]);

  const ownershipOr: Record<string, unknown>[] = [
    ...(agentIds.length > 0 ? [{ agentId: { $in: agentIds } }] : []),
    ...(employerIds.length > 0 ? [{ employerId: { $in: employerIds } }] : []),
  ];

  return {
    agentIds,
    teamAgentIds: scope.teamAgentIds,
    employerIds,
    saProfileId: scope.saProfileId,
    ownershipMatch: ownershipOr.length > 0 ? { $or: ownershipOr } : { employerId: { $in: [] } },
    territory,
  };
}

/**
 * Employer _ids an agent may see: employers assigned to them (from either end
 * of the link — `Agent.assignedEmployerIds` or `Employer.agentId`) plus every
 * employer registered inside the agent's own region. Returns [] when there are
 * none — callers MUST treat [] as "see nothing" (default-deny).
 *
 * Seeing is not owning: posting jobs on the employer's behalf, entering its
 * account (tenant view) and commission credit still need the explicit
 * assignment, which only an admin sets.
 */
export async function getAgentEmployerIds(
  agentUserId: string
): Promise<mongoose.Types.ObjectId[]> {
  await connectDB();
  const agent = await Agent.findOne({ userId: agentUserId })
    .select("_id assignedEmployerIds assignedCityIds assignedStateIds")
    .lean();
  if (!agent) return [];
  const { Employer } = await import("@/models/Employer");
  const [ownedEmployers, regionEmployerIds] = await Promise.all([
    Employer.find({ agentId: agent._id }).select("_id").lean(),
    findRegionEmployerIds({
      assignedCityIds: (agent.assignedCityIds as mongoose.Types.ObjectId[]) ?? [],
      assignedStateIds: (agent.assignedStateIds as mongoose.Types.ObjectId[]) ?? [],
    }),
  ]);
  return deduplicateIds([
    ...((agent.assignedEmployerIds as mongoose.Types.ObjectId[]) ?? []),
    ...ownedEmployers.map((e) => e._id as mongoose.Types.ObjectId),
    ...regionEmployerIds,
  ]);
}

/**
 * Per-record check: is `employerId` among `getAgentEmployerIds(agentUserId)`?
 * Answered with one `exists` on that employer instead of loading the whole
 * set, which for a state-wide region can be every employer in the state.
 */
export async function agentCanSeeEmployer(
  agentUserId: string,
  employerId: unknown
): Promise<boolean> {
  if (!employerId || !isValidObjectId(String(employerId))) return false;
  await connectDB();
  const agent = await Agent.findOne({ userId: agentUserId })
    .select("_id assignedEmployerIds assignedCityIds assignedStateIds")
    .lean();
  if (!agent) return false;
  const assigned = (agent.assignedEmployerIds as mongoose.Types.ObjectId[]) ?? [];
  if (assigned.some((id) => String(id) === String(employerId))) return true;

  const region = employerRegionMatch({
    assignedCityIds: (agent.assignedCityIds as mongoose.Types.ObjectId[]) ?? [],
    assignedStateIds: (agent.assignedStateIds as mongoose.Types.ObjectId[]) ?? [],
  });
  const reach: Record<string, unknown>[] = [{ agentId: agent._id }];
  if (region) reach.push({ ...region, roleArchivedAt: null });
  const { Employer } = await import("@/models/Employer");
  return Boolean(await Employer.exists({ _id: String(employerId), $or: reach }));
}

/**
 * Employer _ids an actor may read on employer-scoped resources.
 *
 * Returns `null` for admin only — meaning "no employer filter". Every other
 * role gets an explicit id list, and an empty list means "see nothing", so a
 * caller that forgets to scope cannot silently fall through to a
 * platform-wide read.
 */
export async function getScopedEmployerIds(ctx: {
  userId: string;
  role: string;
}): Promise<mongoose.Types.ObjectId[] | null> {
  if (ctx.role === "admin") return null;
  if (ctx.role === "agent") return getAgentEmployerIds(ctx.userId);
  if (ctx.role === "super_agent") return getSuperAgentEmployerIds(ctx.userId);
  if (ctx.role === "employer") {
    await connectDB();
    const { Employer } = await import("@/models/Employer");
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    return emp ? [emp._id as mongoose.Types.ObjectId] : [];
  }
  return [];
}

/** Deduplicate an array of ObjectIds. */
function deduplicateIds(ids: mongoose.Types.ObjectId[]): mongoose.Types.ObjectId[] {
  const seen = new Set<string>();
  return ids.filter((id) => {
    const s = id.toString();
    if (seen.has(s)) return false;
    seen.add(s);
    return true;
  });
}

/**
 * Check if a region has ANY assignments.
 */
export function hasRegionAssigned(region: RegionInfo | null): boolean {
  if (!region) return false;
  return region.assignedCityIds.length > 0 || region.assignedStateIds.length > 0;
}

/**
 * Expand assignedStateIds to include all cities belonging to those states.
 * This ensures that assigning a state automatically covers all its cities.
 */
export async function expandStatesToCities(
  region: RegionInfo
): Promise<Set<string>> {
  const citySet = new Set(region.assignedCityIds.map((id) => id.toString()));

  if (region.assignedStateIds.length > 0) {
    const { default: City } = await import("@/models/City");
    const citiesInStates = await City.find({
      stateId: { $in: region.assignedStateIds },
    })
      .select("_id")
      .lean();
    for (const c of citiesInStates) {
      citySet.add(c._id.toString());
    }
  }

  return citySet;
}

/**
 * Check if a set of cityIds/stateIds is a subset of another region.
 * Used to validate agent regions are within their super-agent's territory.
 * Cities belonging to an assigned parent state are considered valid.
 */
export async function isRegionSubset(
  child: { cityIds: string[]; stateIds: string[] },
  parent: RegionInfo
): Promise<{ valid: boolean; invalidCityIds: string[]; invalidStateIds: string[] }> {
  const parentStateSet = new Set(parent.assignedStateIds.map((id) => id.toString()));

  // Expand parent's states to include all their cities
  const parentCitySet = await expandStatesToCities(parent);

  const invalidCityIds = child.cityIds.filter((id) => !parentCitySet.has(id));
  const invalidStateIds = child.stateIds.filter((id) => !parentStateSet.has(id));

  return {
    valid: invalidCityIds.length === 0 && invalidStateIds.length === 0,
    invalidCityIds,
    invalidStateIds,
  };
}

/**
 * Can this actor manage (assign/change/renew) a subscription for the target
 * user? Admin: always. Agent: only employers assigned to them (via
 * Employer.agentId or Agent.assignedEmployerIds). Super-agent: only employers
 * in their book (`getSuperAgentEmployerIds`, which includes the territory).
 * ponytail: job_seeker targets are admin-only — no region model for seekers yet.
 */
export async function canManageSubscriptionTarget(
  ctx: { userId: string; role: string },
  targetUserId: string
): Promise<boolean> {
  if (ctx.role === "admin") return true;
  if (ctx.role !== "agent" && ctx.role !== "super_agent") return false;
  await connectDB();

  const { Employer } = await import("@/models/Employer");
  const employer = await Employer.findOne({ userId: targetUserId })
    .select("_id agentId")
    .lean();
  if (!employer) return false; // non-employer targets are admin-only

  if (ctx.role === "agent") {
    const agentDoc = await Agent.findOne({ userId: ctx.userId })
      .select("_id assignedEmployerIds")
      .lean();
    if (!agentDoc) return false;
    const assigned = ((agentDoc.assignedEmployerIds as mongoose.Types.ObjectId[]) ?? [])
      .map(String)
      .includes(String(employer._id));
    const isEmployersAgent =
      !!employer.agentId && String(employer.agentId) === String(agentDoc._id);
    return assigned || isEmployersAgent;
  }

  // Same set as the bulk-assign route and every other SA employer read.
  const employerIds = await getSuperAgentEmployerIds(ctx.userId);
  return employerIds.some((id) => String(id) === String(employer._id));
}

/**
 * User _ids (self + effective-scope agents) whose actions a super-agent may
 * see on team-scoped views (e.g. audit logs). Returns [] when the SA has no
 * team — callers MUST treat [] as "see nothing" (default-deny).
 */
export async function getSuperAgentTeamUserIds(
  saUserId: string
): Promise<mongoose.Types.ObjectId[]> {
  const scope = await getSuperAgentScope(saUserId);
  const teamUserIds: mongoose.Types.ObjectId[] = [new mongoose.Types.ObjectId(saUserId)];
  if (scope && scope.effectiveAgentIds.length > 0) {
    const agents = await Agent.find({ _id: { $in: scope.effectiveAgentIds } })
      .select("userId")
      .lean();
    teamUserIds.push(...agents.map((a) => a.userId as mongoose.Types.ObjectId));
  }
  return deduplicateIds(teamUserIds);
}

/**
 * Guard wrapper around canManageSubscriptionTarget — returns a 403 response
 * to early-return from route handlers, or null when access is permitted.
 */
export async function requireSubscriptionTargetAccess(
  ctx: { userId: string; role: string },
  targetUserId: string
): Promise<NextResponse | null> {
  const allowed = await canManageSubscriptionTarget(ctx, targetUserId);
  if (allowed) return null;
  return NextResponse.json(
    { error: "Access restricted — you can only manage subscriptions for employers assigned to you." },
    { status: 403 }
  );
}
