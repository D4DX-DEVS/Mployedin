import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Target from "@/models/Target";
import { validateBody } from "@/lib/validators";
import { targetDistributeSchema } from "@/lib/validators/targets";
import { logActivity, actorFromCtx } from "@/lib/audit/log";

interface AuthCtx { userId: string; role: string; locale: string; }

/* ------------------------------------------------------------------ */
/*  POST  /api/admin/targets/distribute                               */
/*  Split a yearly target into 12 monthly targets (equal or custom).  */
/* ------------------------------------------------------------------ */
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();
  const body = await validateBody(req, targetDistributeSchema);

  const yearlyTarget = await Target.findById(body.targetId).lean();
  if (!yearlyTarget) {
    return NextResponse.json({ error: "Target not found" }, { status: 404 });
  }
  if (yearlyTarget.month) {
    return NextResponse.json({ error: "Can only distribute yearly targets" }, { status: 400 });
  }
  if (yearlyTarget.status === "cancelled") {
    return NextResponse.json({ error: "Cannot distribute a cancelled target" }, { status: 400 });
  }

  // Delete existing monthly children for this yearly target
  await Target.deleteMany({ parentTargetId: yearlyTarget._id });

  let monthlyValues: { month: number; value: number }[];

  if (body.monthlyValues && body.monthlyValues.length > 0) {
    // Custom distribution — validate sum
    const sum = body.monthlyValues.reduce((acc, mv) => acc + mv.value, 0);
    if (sum !== yearlyTarget.targetValue) {
      return NextResponse.json(
        { error: `Monthly values sum (${sum}) must equal yearly target (${yearlyTarget.targetValue})` },
        { status: 400 }
      );
    }
    monthlyValues = body.monthlyValues;
  } else {
    // Equal distribution
    const perMonth = Math.floor(yearlyTarget.targetValue / 12);
    const remainder = yearlyTarget.targetValue - perMonth * 12;
    monthlyValues = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      value: perMonth + (i < remainder ? 1 : 0),
    }));
  }

  const monthlyDocs = monthlyValues.map((mv) => ({
    assigneeId: yearlyTarget.assigneeId,
    assigneeRole: yearlyTarget.assigneeRole,
    assignedBy: ctx.userId,
    type: yearlyTarget.type,
    year: yearlyTarget.year,
    month: mv.month,
    targetValue: mv.value,
    currency: yearlyTarget.currency,
    parentTargetId: yearlyTarget._id,
    status: "active",
  }));

  const created = await Target.insertMany(monthlyDocs);

  await logActivity({
    ...actorFromCtx(ctx),
    action: "target.distribute",
    resource: "targets",
    resourceId: String(yearlyTarget._id),
    meta: { monthCount: created.length, type: yearlyTarget.type },
    req,
  });

  return NextResponse.json({
    success: true,
    monthlyTargets: created,
  });
}

export const POST = withAuth(postHandler, { resource: "targets", action: "update" });
