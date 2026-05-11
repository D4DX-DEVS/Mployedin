import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Target from "@/models/Target";
import SuperAgent from "@/models/SuperAgent";
import Agent from "@/models/Agent";
import { validateBody } from "@/lib/validators";
import { agentDistributeSchema } from "@/lib/validators/targets";
import { logActivity, actorFromCtx } from "@/lib/audit/log";

interface AuthCtx { userId: string; role: string; locale: string; }

/* ------------------------------------------------------------------ */
/*  POST  /api/super-agent/targets/distribute                         */
/*  Distribute own monthly target among team agents                   */
/* ------------------------------------------------------------------ */
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();
  const body = await validateBody(req, agentDistributeSchema);

  const sa = await SuperAgent.findOne({ userId: ctx.userId }).select("agentIds").lean();
  if (!sa) return NextResponse.json({ error: "SuperAgent profile not found" }, { status: 404 });

  // Verify own monthly target exists
  const ownTarget = await Target.findOne({
    assigneeId: ctx.userId,
    assigneeRole: "super_agent",
    type: body.type,
    year: body.year,
    month: body.month,
    status: "active",
  }).lean();

  if (!ownTarget) {
    return NextResponse.json(
      { error: "No active target found for this type/period" },
      { status: 404 }
    );
  }

  // Validate allocation sum
  const totalAllocation = body.allocations.reduce((sum, a) => sum + a.value, 0);
  if (totalAllocation > ownTarget.targetValue) {
    return NextResponse.json(
      {
        error: `Total allocation (${totalAllocation}) exceeds your monthly target (${ownTarget.targetValue})`,
      },
      { status: 400 }
    );
  }

  // Validate all agents belong to this super_agent
  const teamAgentDocs = await Agent.find({ _id: { $in: sa.agentIds ?? [] } })
    .select("userId")
    .lean();
  const teamUserIds = new Set(teamAgentDocs.map((a) => String(a.userId)));

  for (const alloc of body.allocations) {
    if (!teamUserIds.has(alloc.agentUserId)) {
      return NextResponse.json(
        { error: `Agent ${alloc.agentUserId} is not in your team` },
        { status: 403 }
      );
    }
  }

  // Upsert agent targets
  const results = [];
  for (const alloc of body.allocations) {
    const filter = {
      assigneeId: alloc.agentUserId,
      assigneeRole: "agent",
      type: body.type,
      year: body.year,
      month: body.month,
    };
    const existing = await Target.findOne({ ...filter, status: "active" }).lean();
    let result;
    if (existing) {
      result = await Target.findByIdAndUpdate(
        existing._id,
        { $set: { targetValue: alloc.value } },
        { new: true }
      ).lean();
    } else {
      result = await Target.create({
        ...filter,
        targetValue: alloc.value,
        assignedBy: ctx.userId,
        currency: ownTarget.currency,
        status: "active",
      });
    }
    results.push(result);
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "target.distribute_to_agents",
    resource: "targets",
    resourceId: String(ownTarget._id),
    meta: {
      type: body.type,
      year: body.year,
      month: body.month,
      agentCount: body.allocations.length,
      totalAllocation,
    },
    req,
  });

  return NextResponse.json({ success: true, agentTargets: results });
}

export const POST = withAuth(postHandler, { resource: "targets", action: "create" });
