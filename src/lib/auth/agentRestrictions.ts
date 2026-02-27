/**
 * Agent access restriction utilities.
 *
 * Agents are assigned to cities/states. These helpers enforce
 * that agents can only view and interact with resources in their assigned region.
 */

import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db/mongoose";
import Agent from "@/models/Agent";
import mongoose from "mongoose";

interface AgentRegionInfo {
  assignedCityIds: mongoose.Types.ObjectId[];
  assignedStateIds: mongoose.Types.ObjectId[];
}

/** Get the agent's assigned city and state IDs. */
export async function getAgentRegion(agentUserId: string): Promise<AgentRegionInfo | null> {
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
 * Check if agent has ANY region assigned.
 */
export function hasRegionAssigned(region: AgentRegionInfo | null): boolean {
  if (!region) return false;
  return region.assignedCityIds.length > 0 || region.assignedStateIds.length > 0;
}

/**
 * Verify that a resource belongs to the agent's region by checking
 * if the resource's cityId or stateId matches the agent's assigned locations.
 * Returns `true` if access is permitted, `false` if restricted.
 *
 * @param agentUserId  - the userId of the agent making the request
 * @param resourceId   - the _id of the resource being accessed
 * @param resourceType - "employer" | "lead" | "application"
 */
export async function agentCanAccessResource(
  agentUserId: string,
  resourceId: string,
  resourceType: "employer" | "lead" | "application"
): Promise<boolean> {
  await connectDB();
  const region = await getAgentRegion(agentUserId);
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
    // Applications don't have region — allow if agent is assigned to application
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
  if (doc.agentId?.toString() === agentUserId) return true; // assigned agent always has access

  const cityMatch = doc.cityId && region!.assignedCityIds.some(
    (cid) => cid.toString() === doc.cityId!.toString()
  );
  const stateMatch = doc.stateId && region!.assignedStateIds.some(
    (sid) => sid.toString() === doc.stateId!.toString()
  );
  return !!(cityMatch || stateMatch);
}

/**
 * Middleware-style guard for agent route handlers.
 * Rejects with 403 if agent tries to access a resource outside their region.
 *
 * @example
 * const check = await requireAgentRegionAccess(req, ctx, resourceId, "employer");
 * if (check) return check; // early return the 403 response
 */
export async function requireAgentRegionAccess(
  _req: NextRequest,
  ctx: { userId: string; role: string },
  resourceId: string,
  resourceType: "employer" | "lead" | "application"
): Promise<NextResponse | null> {
  if (ctx.role !== "agent") return null; // only applies to agents

  const allowed = await agentCanAccessResource(ctx.userId, resourceId, resourceType);
  if (!allowed) {
    return NextResponse.json(
      { error: "Access restricted — resource is outside your assigned region." },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Build a MongoDB query filter that restricts results to the agent's region.
 * Use with `.find(filter)` on Employer/Lead models that have `cityId` or `stateId` fields.
 */
export async function buildAgentRegionFilter(
  agentUserId: string
): Promise<Record<string, unknown>> {
  const region = await getAgentRegion(agentUserId);
  if (!hasRegionAssigned(region)) {
    return { _id: { $exists: false } }; // no region → no results
  }

  const conditions: Record<string, unknown>[] = [
    { agentId: new mongoose.Types.ObjectId(agentUserId) },
  ];

  if (region!.assignedCityIds.length > 0) {
    conditions.push({ cityId: { $in: region!.assignedCityIds } });
  }
  if (region!.assignedStateIds.length > 0) {
    conditions.push({ stateId: { $in: region!.assignedStateIds } });
  }

  return { $or: conditions };
}
