import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { getSuperAgentScope } from "@/lib/auth/agentRestrictions";
import Agent from "@/models/Agent";
import Lead from "@/models/Lead";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { assignLeadsSchema } from "@/lib/validators/super-agent";

/**
 * POST /api/super-agent/actions/assign-leads
 *
 * Reassign unworked leads from one agent to another.
 * Both agents must belong to the requesting super-agent's roster.
 *
 * Body: { fromAgentUserId: string, toAgentUserId: string, maxLeads?: number }
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const body = await validateBody(req, assignLeadsSchema);
  const { fromAgentUserId, toAgentUserId, maxLeads } = body;

  if (fromAgentUserId === toAgentUserId) {
    return NextResponse.json({ error: "Cannot reassign to the same agent" }, { status: 400 });
  }

  const limit = maxLeads;

  await connectDB();

  // Verify both agents belong to this super-agent's scope (team + regions)
  const scope = await getSuperAgentScope(ctx.userId);
  const assignedAgentDocIds = (scope?.effectiveAgentIds ?? []).map((id: unknown) => String(id));

  const agentDocs = await Agent.find({ _id: { $in: assignedAgentDocIds } }).select("userId").lean();
  const rosterUserIds = new Set(agentDocs.map((a) => a.userId.toString()));

  if (!rosterUserIds.has(fromAgentUserId) || !rosterUserIds.has(toAgentUserId)) {
    return NextResponse.json({ error: "Both agents must be in your roster" }, { status: 403 });
  }

  // Map userId → Agent doc _id (Lead.agentId references Agent._id, not User._id)
  const userIdToAgentDocId = new Map(agentDocs.map((a) => [a.userId.toString(), a._id.toString()]));
  const fromAgentDocId = userIdToAgentDocId.get(fromAgentUserId);
  const toAgentDocId = userIdToAgentDocId.get(toAgentUserId);

  if (!fromAgentDocId || !toAgentDocId) {
    return NextResponse.json({ error: "Agent profile not found" }, { status: 404 });
  }

  // Find unworked leads (status = new/contacted) from the source agent, limited
  const leadsToMove = await Lead.find({
    agentId: fromAgentDocId,
    status: { $in: ["new", "contacted"] },
  })
    .select("_id")
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  if (leadsToMove.length === 0) {
    return NextResponse.json({ reassigned: 0, message: "No eligible leads to reassign" });
  }

  const leadIds = leadsToMove.map((l) => l._id);

  await Lead.updateMany(
    { _id: { $in: leadIds } },
    {
      $set: { agentId: toAgentDocId },
      $push: {
        activityLog: {
          action: "reassigned",
          note: `Reassigned from agent by super-agent`,
          by: ctx.userId,
          timestamp: new Date(),
        },
      },
    }
  );

  // Audit trail
  await logActivity({
    ...actorFromCtx(ctx),
    action: "super_agent.assign_leads",
    resource: "leads",
    meta: {
      fromAgentUserId,
      toAgentUserId,
      leadIds: leadIds.map(String),
      count: leadsToMove.length,
    },
    req,
  });

  return NextResponse.json({
    reassigned: leadsToMove.length,
    message: `${leadsToMove.length} lead${leadsToMove.length > 1 ? "s" : ""} reassigned successfully.`,
  });
}, { resource: "users", action: "update" });
