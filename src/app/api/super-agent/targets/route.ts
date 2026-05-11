import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Target from "@/models/Target";
import SuperAgent from "@/models/SuperAgent";
import Agent from "@/models/Agent";
import User from "@/models/User";
import { validateBody } from "@/lib/validators";
import { targetCreateSchema, agentDistributeSchema } from "@/lib/validators/targets";
import { enrichTargetWithAchievement } from "@/lib/targets/achievementCalculator";
import { logActivity, actorFromCtx } from "@/lib/audit/log";

interface AuthCtx { userId: string; role: string; locale: string; }

/* ------------------------------------------------------------------ */
/*  GET  /api/super-agent/targets — own targets + team agent targets  */
/* ------------------------------------------------------------------ */
async function handler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));
  const type = searchParams.get("type");
  const view = searchParams.get("view") ?? "own"; // "own" | "team"

  if (view === "team") {
    // Get agent targets created by this super_agent
    const sa = await SuperAgent.findOne({ userId: ctx.userId }).select("agentIds").lean();
    if (!sa) return NextResponse.json({ error: "SuperAgent profile not found" }, { status: 404 });

    const agentDocs = await Agent.find({ _id: { $in: sa.agentIds ?? [] } })
      .select("userId")
      .lean();
    const agentUserIds = agentDocs.map((a) => String(a.userId));

    const query: Record<string, unknown> = {
      assigneeId: { $in: agentUserIds },
      assigneeRole: "agent",
      year,
      status: { $ne: "cancelled" },
    };
    if (type && type !== "all") query.type = type;

    const targets = await Target.find(query).sort({ month: 1, type: 1 }).lean();

    // Resolve agent names
    const users = await User.find({ _id: { $in: agentUserIds } })
      .select("_id name email")
      .lean();
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    const enriched = await Promise.all(
      targets.map(async (t) => {
        const withAchievement = await enrichTargetWithAchievement(t);
        const assignee = userMap.get(String(t.assigneeId));
        return {
          ...withAchievement,
          assigneeName: assignee?.name ?? "Unknown",
        };
      })
    );

    return NextResponse.json({ targets: enriched });
  }

  // Own targets
  const query: Record<string, unknown> = {
    assigneeId: ctx.userId,
    assigneeRole: "super_agent",
    year,
    status: { $ne: "cancelled" },
  };
  if (type && type !== "all") query.type = type;

  const targets = await Target.find(query).sort({ month: 1, type: 1 }).lean();
  const enriched = await Promise.all(
    targets.map((t) => enrichTargetWithAchievement(t))
  );

  // Group by type for summary
  const summary = {
    employer: { yearly: null as unknown, monthly: [] as unknown[] },
    employee: { yearly: null as unknown, monthly: [] as unknown[] },
    finance: { yearly: null as unknown, monthly: [] as unknown[] },
  };

  for (const t of enriched) {
    const tType = t.type as keyof typeof summary;
    if (!t.month) {
      summary[tType].yearly = t;
    } else {
      summary[tType].monthly.push(t);
    }
  }

  return NextResponse.json({ targets: enriched, summary });
}

/* ------------------------------------------------------------------ */
/*  POST  /api/super-agent/targets — create target for an agent       */
/* ------------------------------------------------------------------ */
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();
  const body = await validateBody(req, targetCreateSchema);

  // Verify the super_agent supervises this agent
  const sa = await SuperAgent.findOne({ userId: ctx.userId }).select("agentIds").lean();
  if (!sa) return NextResponse.json({ error: "SuperAgent profile not found" }, { status: 404 });

  const agentDoc = await Agent.findOne({ userId: body.assigneeId }).select("_id").lean();
  if (!agentDoc || !sa.agentIds?.map(String).includes(String(agentDoc._id))) {
    return NextResponse.json(
      { error: "You can only set targets for agents in your team" },
      { status: 403 }
    );
  }

  // Ensure the assigned value doesn't exceed the super_agent's own target for this period
  const ownTarget = await Target.findOne({
    assigneeId: ctx.userId,
    type: body.type,
    year: body.year,
    month: body.month ?? { $exists: false },
    status: "active",
  }).lean();

  if (ownTarget) {
    // Sum existing agent allocations for this type/period
    const agentUserIds = await Agent.find({ _id: { $in: sa.agentIds ?? [] } })
      .select("userId")
      .lean()
      .then((docs) => docs.map((d) => String(d.userId)));

    const existingSum = await Target.aggregate([
      {
        $match: {
          assigneeId: { $in: agentUserIds },
          assigneeRole: "agent",
          type: body.type,
          year: body.year,
          ...(body.month ? { month: body.month } : { month: { $exists: false } }),
          status: "active",
        },
      },
      { $group: { _id: null, total: { $sum: "$targetValue" } } },
    ]);

    const currentSum = existingSum[0]?.total ?? 0;
    if (currentSum + body.targetValue > ownTarget.targetValue) {
      return NextResponse.json(
        {
          error: `Total agent allocations (${currentSum + body.targetValue}) would exceed your target (${ownTarget.targetValue})`,
          available: ownTarget.targetValue - currentSum,
        },
        { status: 400 }
      );
    }
  }

  // Check for existing target
  const existing = await Target.findOne({
    assigneeId: body.assigneeId,
    type: body.type,
    year: body.year,
    month: body.month ?? { $exists: false },
    status: "active",
  }).lean();

  if (existing) {
    return NextResponse.json(
      { error: "An active target of this type already exists for this agent in this period" },
      { status: 409 }
    );
  }

  const target = await Target.create({
    ...body,
    assigneeRole: "agent",
    assignedBy: ctx.userId,
    status: "active",
  });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "target.assign_agent",
    resource: "targets",
    resourceId: String(target._id),
    meta: { type: body.type, year: body.year, month: body.month, targetValue: body.targetValue, agentUserId: body.assigneeId },
    req,
  });

  return NextResponse.json({ target }, { status: 201 });
}

export const GET = withAuth(handler, { resource: "targets", action: "read" });
export const POST = withAuth(postHandler, { resource: "targets", action: "create" });
