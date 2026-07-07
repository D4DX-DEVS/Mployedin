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

import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db/mongoose";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
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
 * Get the super-agent's effective region: union of own regions + all managed agent regions.
 */
export async function getSuperAgentRegion(saUserId: string): Promise<RegionInfo | null> {
  await connectDB();
  const sa = await SuperAgent.findOne({ userId: saUserId })
    .select("assignedCityIds assignedStateIds agentIds")
    .lean();
  if (!sa) return null;

  const ownCities = (sa.assignedCityIds as mongoose.Types.ObjectId[]) ?? [];
  const ownStates = (sa.assignedStateIds as mongoose.Types.ObjectId[]) ?? [];

  // Collect agent regions to merge
  const agentIds = (sa.agentIds as mongoose.Types.ObjectId[]) ?? [];
  let agentCities: mongoose.Types.ObjectId[] = [];
  let agentStates: mongoose.Types.ObjectId[] = [];

  if (agentIds.length > 0) {
    const agents = await Agent.find({ _id: { $in: agentIds } })
      .select("assignedCityIds assignedStateIds")
      .lean();
    agentCities = agents.flatMap((a) => (a.assignedCityIds as mongoose.Types.ObjectId[]) ?? []);
    agentStates = agents.flatMap((a) => (a.assignedStateIds as mongoose.Types.ObjectId[]) ?? []);
  }

  // Deduplicate using Set of string IDs
  const allCities = deduplicateIds([...ownCities, ...agentCities]);
  const allStates = deduplicateIds([...ownStates, ...agentStates]);

  return { assignedCityIds: allCities, assignedStateIds: allStates };
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
 * Resolve the employer _ids a super-agent may see: employers whose assigned
 * agent is within the SA's effective scope (team + region). Returns [] when the
 * SA has no scope — callers MUST treat [] as "see nothing" (default-deny), never
 * as "no filter". This is the single source of truth for scoping super_agent
 * reads on generic resource routes (applications, etc.).
 */
export async function getSuperAgentEmployerIds(
  saUserId: string
): Promise<mongoose.Types.ObjectId[]> {
  const scope = await getSuperAgentScope(saUserId);
  if (!scope || scope.effectiveAgentIds.length === 0) return [];
  const { Employer } = await import("@/models/Employer");
  const employers = await Employer.find({ agentId: { $in: scope.effectiveAgentIds } })
    .select("_id")
    .lean();
  return employers.map((e) => e._id as mongoose.Types.ObjectId);
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
 * Verify that a resource belongs to the user's region by checking
 * if the resource's cityId or stateId matches the assigned locations.
 * Works for both agents and super-agents.
 * Returns `true` if access is permitted, `false` if restricted.
 *
 * @param userId       - the userId of the agent/super-agent making the request
 * @param role         - "agent" | "super_agent"
 * @param resourceId   - the _id of the resource being accessed
 * @param resourceType - "employer" | "lead" | "application"
 */
export async function canAccessResource(
  userId: string,
  role: "agent" | "super_agent",
  resourceId: string,
  resourceType: "employer" | "lead" | "application"
): Promise<boolean> {
  await connectDB();
  const region = role === "super_agent"
    ? await getSuperAgentRegion(userId)
    : await getAgentRegion(userId);
  if (!hasRegionAssigned(region)) return false;

  // Dynamic import to avoid circular dep
  let model: unknown;
  if (resourceType === "employer") {
    const { default: Employer } = await import("@/models/Employer");
    model = Employer;
  } else if (resourceType === "lead") {
    const { default: Lead } = await import("@/models/Lead");
    model = Lead;
  } else {
    // Applications don't have region — allow if user is assigned
    return true;
  }

  const doc = await (model as {
    findById: (id: string) => { select: (s: string) => { lean: () => Promise<{
      cityId?: mongoose.Types.ObjectId;
      stateId?: mongoose.Types.ObjectId;
      agentId?: mongoose.Types.ObjectId;
    } | null> } }
  }).findById(resourceId).select("cityId stateId agentId").lean();

  if (!doc) return false;
  if (doc.agentId?.toString() === userId) return true; // assigned agent always has access

  const cityMatch = doc.cityId && region!.assignedCityIds.some(
    (cid) => cid.toString() === doc.cityId!.toString()
  );
  const stateMatch = doc.stateId && region!.assignedStateIds.some(
    (sid) => sid.toString() === doc.stateId!.toString()
  );

  // State→city hierarchy: if user has a state assigned and the resource's city belongs to that state
  let stateCityMatch = false;
  if (!cityMatch && doc.cityId && region!.assignedStateIds.length > 0) {
    const expandedCities = await expandStatesToCities(region!);
    stateCityMatch = expandedCities.has(doc.cityId.toString());
  }

  return !!(cityMatch || stateMatch || stateCityMatch);
}

/**
 * @deprecated Use canAccessResource instead
 */
export async function agentCanAccessResource(
  agentUserId: string,
  resourceId: string,
  resourceType: "employer" | "lead" | "application"
): Promise<boolean> {
  return canAccessResource(agentUserId, "agent", resourceId, resourceType);
}

/**
 * Middleware-style guard for agent AND super-agent route handlers.
 * Rejects with 403 if user tries to access a resource outside their region.
 *
 * @example
 * const check = await requireRegionAccess(req, ctx, resourceId, "employer");
 * if (check) return check; // early return the 403 response
 */
export async function requireRegionAccess(
  _req: NextRequest,
  ctx: { userId: string; role: string },
  resourceId: string,
  resourceType: "employer" | "lead" | "application"
): Promise<NextResponse | null> {
  if (ctx.role !== "agent" && ctx.role !== "super_agent") return null; // admins pass through

  const allowed = await canAccessResource(
    ctx.userId,
    ctx.role as "agent" | "super_agent",
    resourceId,
    resourceType
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Access restricted — resource is outside your assigned region." },
      { status: 403 }
    );
  }
  return null;
}

/**
 * @deprecated Use requireRegionAccess instead
 */
export async function requireAgentRegionAccess(
  _req: NextRequest,
  ctx: { userId: string; role: string },
  resourceId: string,
  resourceType: "employer" | "lead" | "application"
): Promise<NextResponse | null> {
  return requireRegionAccess(_req, ctx, resourceId, resourceType);
}

/**
 * Build a MongoDB query filter that restricts results to the user's region.
 * Works for both agents and super-agents.
 * Use with `.find(filter)` on Employer/Lead models that have `cityId` or `stateId` fields.
 */
export async function buildRegionFilter(
  userId: string,
  role: "agent" | "super_agent"
): Promise<Record<string, unknown>> {
  const region = role === "super_agent"
    ? await getSuperAgentRegion(userId)
    : await getAgentRegion(userId);
  if (!hasRegionAssigned(region)) {
    return { _id: { $exists: false } }; // no region → no results
  }

  const conditions: Record<string, unknown>[] = [
    { agentId: new mongoose.Types.ObjectId(userId) },
  ];

  // Expand states to include all their cities for proper hierarchy coverage
  const expandedCityIds = await expandStatesToCities(region!);
  const allCityObjectIds = Array.from(expandedCityIds).map(
    (id) => new mongoose.Types.ObjectId(id)
  );

  if (allCityObjectIds.length > 0) {
    conditions.push({ cityId: { $in: allCityObjectIds } });
  }
  if (region!.assignedStateIds.length > 0) {
    conditions.push({ stateId: { $in: region!.assignedStateIds } });
  }

  return { $or: conditions };
}

/**
 * @deprecated Use buildRegionFilter instead
 */
export async function buildAgentRegionFilter(
  agentUserId: string
): Promise<Record<string, unknown>> {
  return buildRegionFilter(agentUserId, "agent");
}

/**
 * Can this actor manage (assign/change/renew) a subscription for the target
 * user? Admin: always. Agent: only employers assigned to them (via
 * Employer.agentId or Agent.assignedEmployerIds). Super-agent: only employers
 * whose agent is within their effective scope (team + region).
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

  const scope = await getSuperAgentScope(ctx.userId);
  if (!scope || scope.effectiveAgentIds.length === 0) return false;
  return (
    !!employer.agentId &&
    scope.effectiveAgentIds.map(String).includes(String(employer.agentId))
  );
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
