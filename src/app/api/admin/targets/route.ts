import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Target from "@/models/Target";
import { validateBody } from "@/lib/validators";
import { targetCreateSchema } from "@/lib/validators/targets";
import { enrichTargetWithAchievement } from "@/lib/targets/achievementCalculator";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import User from "@/models/User";

interface AuthCtx { userId: string; role: string; locale: string; }

/* ------------------------------------------------------------------ */
/*  GET  /api/admin/targets — list all targets                        */
/* ------------------------------------------------------------------ */
async function handler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();

  const { searchParams } = new URL(req.url);
  const year = searchParams.get("year");
  const month = searchParams.get("month");
  const type = searchParams.get("type");
  const assigneeId = searchParams.get("assigneeId");
  const assigneeRole = searchParams.get("assigneeRole");
  const status = searchParams.get("status");
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "20");
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = {};
  if (year) query.year = parseInt(year);
  if (month && month !== "all") query.month = parseInt(month);
  if (type && type !== "all") query.type = type;
  if (assigneeId) query.assigneeId = assigneeId;
  if (assigneeRole && assigneeRole !== "all") query.assigneeRole = assigneeRole;
  if (status && status !== "all") query.status = status;
  // By default only show yearly targets (no month) unless month filter is explicitly set
  if (!searchParams.has("month")) query.month = { $exists: false };

  const [targets, total] = await Promise.all([
    Target.find(query).sort({ year: -1, month: 1, type: 1 }).skip(skip).limit(limit).lean(),
    Target.countDocuments(query),
  ]);

  // Resolve assignee names
  const assigneeIds = [...new Set(targets.map((t) => String(t.assigneeId)))];
  const users = await User.find({ _id: { $in: assigneeIds } })
    .select("_id name email")
    .lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  // Enrich with achievement data
  const enriched = await Promise.all(
    targets.map(async (t) => {
      const withAchievement = await enrichTargetWithAchievement(t);
      const assignee = userMap.get(String(t.assigneeId));
      return {
        ...withAchievement,
        assigneeName: assignee?.name ?? "Unknown",
        assigneeEmail: assignee?.email ?? "",
      };
    })
  );

  return NextResponse.json({
    targets: enriched,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

/* ------------------------------------------------------------------ */
/*  POST  /api/admin/targets — create target for a super_agent        */
/* ------------------------------------------------------------------ */
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();
  const body = await validateBody(req, targetCreateSchema);

  // Check for existing target (avoid duplicates)
  const existing = await Target.findOne({
    assigneeId: body.assigneeId,
    type: body.type,
    year: body.year,
    month: body.month ?? { $exists: false },
    status: "active",
  }).lean();

  if (existing) {
    return NextResponse.json(
      { error: "An active target of this type already exists for this period" },
      { status: 409 }
    );
  }

  const target = await Target.create({
    ...body,
    assignedBy: ctx.userId,
    status: "active",
  });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "target.create",
    resource: "targets",
    resourceId: String(target._id),
    meta: { type: body.type, year: body.year, month: body.month, targetValue: body.targetValue, assigneeId: body.assigneeId },
    req,
  });

  return NextResponse.json({ target }, { status: 201 });
}

export const GET = withAuth(handler, { resource: "targets", action: "read" });
export const POST = withAuth(postHandler, { resource: "targets", action: "create" });
