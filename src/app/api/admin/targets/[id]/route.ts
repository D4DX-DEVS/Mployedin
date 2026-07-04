import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Target from "@/models/Target";
import { validateBody } from "@/lib/validators";
import { targetUpdateSchema } from "@/lib/validators/targets";
import { enrichTargetWithAchievement } from "@/lib/targets/achievementCalculator";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import User from "@/models/User";

interface AuthCtx { userId: string; role: string; locale: string; }

/* ------------------------------------------------------------------ */
/*  GET  /api/admin/targets/[id] — single target with detail          */
/* ------------------------------------------------------------------ */
async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();
  const id = params?.id;
  if (!id) return NextResponse.json({ error: "Missing ID" }, { status: 400 });

  const target = await Target.findById(id).lean();
  if (!target) return NextResponse.json({ error: "Target not found" }, { status: 404 });

  const enriched = await enrichTargetWithAchievement(target);

  // Resolve assignee name
  const assignee = await User.findById(target.assigneeId).select("name email").lean();

  // If yearly target, fetch monthly breakdown
  let monthlyBreakdown: unknown[] = [];
  if (!target.month) {
    const monthlyTargets = await Target.find({
      parentTargetId: target._id,
      status: { $ne: "cancelled" },
    }).sort({ month: 1 }).lean();

    monthlyBreakdown = await Promise.all(
      monthlyTargets.map((mt) => enrichTargetWithAchievement(mt))
    );
  }

  return NextResponse.json({
    target: {
      ...enriched,
      assigneeName: assignee?.name ?? "Unknown",
      assigneeEmail: assignee?.email ?? "",
    },
    monthlyBreakdown,
  });
}

/* ------------------------------------------------------------------ */
/*  PATCH  /api/admin/targets/[id] — update target                    */
/* ------------------------------------------------------------------ */
async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();
  const id = params?.id;
  if (!id) return NextResponse.json({ error: "Missing ID" }, { status: 400 });

  const body = await validateBody(req, targetUpdateSchema);
  const target = await Target.findByIdAndUpdate(id, { $set: body }, { new: true }).lean();
  if (!target) return NextResponse.json({ error: "Target not found" }, { status: 404 });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "target.update",
    resource: "targets",
    resourceId: id,
    meta: body,
    req,
  });

  return NextResponse.json({ target });
}

/* ------------------------------------------------------------------ */
/*  DELETE  /api/admin/targets/[id] — cancel target                   */
/* ------------------------------------------------------------------ */
async function deleteHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();
  const id = params?.id;
  if (!id) return NextResponse.json({ error: "Missing ID" }, { status: 400 });

  // Cancel the target + any monthly children
  const target = await Target.findByIdAndUpdate(id, { $set: { status: "cancelled" } }, { new: true }).lean();
  if (!target) return NextResponse.json({ error: "Target not found" }, { status: 404 });

  await Target.updateMany({ parentTargetId: id }, { $set: { status: "cancelled" } });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "target.cancel",
    resource: "targets",
    resourceId: id,
    req,
  });

  return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler, { resource: "targets", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "targets", action: "update" });
export const DELETE = withAuth(deleteHandler, { resource: "targets", action: "delete" });
