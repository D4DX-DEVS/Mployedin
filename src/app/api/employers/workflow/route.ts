import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import Employer from "@/models/Employer";
import { validateBody } from "@/lib/validators";
import { workflowUpdateSchema } from "@/lib/validators/misc";
import { logActivity } from "@/lib/audit/log";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; }

async function getHandler(_req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "employer" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();
  const employer = await Employer.findOne({ userId: ctx.userId }).select("workflow").lean();
  const stages = employer?.workflow?.stages;

  return NextResponse.json({
    stages: Array.isArray(stages) && stages.length > 0 ? stages : null,
    settings: employer?.workflow?.settings ?? { aiAutoScreen: true, notifyOnStageChange: true, autoRejectBelow: 40 },
  });
}

async function patchHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "employer" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();
  const { stages, settings } = await validateBody(req, workflowUpdateSchema);

  await Employer.findOneAndUpdate(
    { userId: ctx.userId },
    { $set: { workflow: { stages, settings } } },
    { upsert: true }
  );

  await logActivity({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "employer.update_workflow",
    resource: "employers",
    resourceId: ctx.userId,
    req,
  });

  return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);
