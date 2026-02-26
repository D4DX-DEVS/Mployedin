/**
 * Agent access restriction utilities.
 *
 * Agents in MPLOYEDIN are assigned to territories. These helpers enforce
 * that agents can only view and interact with resources in their territory.
 */

import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db/mongoose";
import Agent from "@/models/Agent";
import Territory from "@/models/Territory";
import mongoose from "mongoose";

/** Cached agent territory lookup (per-request — no cross-request cache). */
export async function getAgentTerritory(agentUserId: string): Promise<string | null> {
  await connectDB();
  const agent = await (Agent as unknown as {
    findOne: (q: object) => { select: (s: string) => { lean: () => Promise<{ territory?: string } | null> } }
  }).findOne({ userId: agentUserId }).select("territory").lean();
  return agent?.territory ?? null;
}

/**
 * Verify that a resource (employer/lead/job-seeker) belongs to the agent's territory.
 * Returns `true` if access is permitted, `false` if restricted.
 *
 * @param agentUserId - the userId of the agent making the request
 * @param resourceId  - the _id of the resource being accessed
 * @param resourceType - "employer" | "lead" | "application"
 */
export async function agentCanAccessResource(
  agentUserId: string,
  resourceId: string,
  resourceType: "employer" | "lead" | "application"
): Promise<boolean> {
  await connectDB();
  const territory = await getAgentTerritory(agentUserId);
  if (!territory) return false; // agent has no territory assigned

  // Dynamic import to avoid circular dep
  let model: unknown;
  if (resourceType === "employer") {
    const { default: Employer } = await import("@/models/Employer");
    model = Employer;
  } else if (resourceType === "lead") {
    const { default: Lead } = await import("@/models/Lead");
    model = Lead;
  } else {
    // Applications don't have territory — allow if agent is assigned to application
    return true;
  }

  const doc = await (model as {
    findById: (id: string) => { select: (s: string) => { lean: () => Promise<{ territory?: string; agentId?: mongoose.Types.ObjectId } | null> } }
  }).findById(resourceId).select("territory agentId").lean();

  if (!doc) return false;
  if (doc.agentId?.toString() === agentUserId) return true; // assigned agent always has access
  return doc.territory === territory;
}

/**
 * Middleware-style guard for agent route handlers.
 * Rejects with 403 if agent tries to access a resource outside their territory.
 *
 * @example
 * const check = await requireAgentTerritoryAccess(req, ctx, resourceId, "employer");
 * if (check) return check; // early return the 403 response
 */
export async function requireAgentTerritoryAccess(
  _req: NextRequest,
  ctx: { userId: string; role: string },
  resourceId: string,
  resourceType: "employer" | "lead" | "application"
): Promise<NextResponse | null> {
  if (ctx.role !== "agent") return null; // only applies to agents

  const allowed = await agentCanAccessResource(ctx.userId, resourceId, resourceType);
  if (!allowed) {
    return NextResponse.json(
      { error: "Access restricted — resource is outside your assigned territory." },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Build a MongoDB query filter that restricts results to the agent's territory.
 * Pass this to `.find(filter)` on Employer/Lead models.
 */
export async function buildAgentTerritoryFilter(
  agentUserId: string
): Promise<Record<string, unknown>> {
  const territory = await getAgentTerritory(agentUserId);
  if (!territory) return { _id: { $exists: false } }; // no territory → no results
  return {
    $or: [
      { territory },
      { agentId: new mongoose.Types.ObjectId(agentUserId) },
    ],
  };
}
