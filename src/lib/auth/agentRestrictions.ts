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
