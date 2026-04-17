import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import SuperAgent from "@/models/SuperAgent";
import Agent from "@/models/Agent";
import Lead from "@/models/Lead";
import AuditLog from "@/models/AuditLog";

/**
 * POST /api/super-agent/actions/assign-leads
 *
 * Reassign unworked leads from one agent to another.
 * Both agents must belong to the requesting super-agent's roster.
 *
 * Body: { fromAgentUserId: string, toAgentUserId: string, maxLeads?: number }
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const body = await req.json();
  const { fromAgentUserId, toAgentUserId, maxLeads = 5 } = body;

  if (!fromAgentUserId || !toAgentUserId) {
    return NextResponse.json({ error: "fromAgentUserId and toAgentUserId required" }, { status: 400 });
  }

  if (fromAgentUserId === toAgentUserId) {
    return NextResponse.json({ error: "Cannot reassign to the same agent" }, { status: 400 });
  }

  const limit = Math.min(Math.max(1, Number(maxLeads) || 5), 20); // 1-20

  await connectDB();

  // Verify both agents belong to this super-agent
  const saProfile = await SuperAgent.findOne({ userId: ctx.userId }).select("agentIds").lean();
  const assignedAgentDocIds = (saProfile?.agentIds ?? []).map((id: unknown) => String(id));

  const agentDocs = await Agent.find({ _id: { $in: assignedAgentDocIds } }).select("userId").lean();
  const rosterUserIds = new Set(agentDocs.map((a) => a.userId.toString()));

  if (!rosterUserIds.has(fromAgentUserId) || !rosterUserIds.has(toAgentUserId)) {
    return NextResponse.json({ error: "Both agents must be in your roster" }, { status: 403 });
  }

  // Find unworked leads (status = new) from the source agent, limited
  const leadsToMove = await Lead.find({
    agentId: fromAgentUserId,
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
      $set: { agentId: toAgentUserId },
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
  await AuditLog.create({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "super_agent.assign_leads",
    resource: "lead",
    meta: {
      fromAgentUserId,
      toAgentUserId,
      leadIds: leadIds.map(String),
      count: leadsToMove.length,
    },
  });

  return NextResponse.json({
    reassigned: leadsToMove.length,
    message: `${leadsToMove.length} lead${leadsToMove.length > 1 ? "s" : ""} reassigned successfully.`,
  });
}, { resource: "users", action: "update" });
