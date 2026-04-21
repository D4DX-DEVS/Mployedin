import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import WorkflowTemplate from "@/models/WorkflowTemplate";
import Employer from "@/models/Employer";
import { validateBody } from "@/lib/validators";
import { workflowTemplateSchema } from "@/lib/validators/misc";
import { logActivity } from "@/lib/audit/log";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

/**
 * GET — list all workflow templates available to this employer:
 *   1. All system templates (scope: "system")
 *   2. Employer's own custom templates (scope: "employer", employerId matches)
 */
async function getHandler(_req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "employer" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();
  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const templates = await WorkflowTemplate.find({
    $or: [
      { scope: "system" },
      { scope: "employer", employerId: employer._id },
    ],
  })
    .sort({ scope: 1, isDefault: -1, createdAt: -1 })
    .lean();

  return NextResponse.json({ templates });
}

/** POST — employer creates a custom workflow template */
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "employer" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();
  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const body = await validateBody(req, workflowTemplateSchema);

  const template = await WorkflowTemplate.create({
    ...body,
    settings: {
      aiAutoScreen: body.settings?.aiAutoScreen ?? true,
      notifyOnStageChange: body.settings?.notifyOnStageChange ?? true,
      autoRejectBelow: body.settings?.autoRejectBelow ?? 40,
    },
    scope: "employer",
    employerId: employer._id,
    createdBy: ctx.userId,
  });

  await logActivity({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "workflow_template.create",
    resource: "workflow_templates",
    resourceId: template._id.toString(),
    meta: { name: body.name },
    req,
  });

  return NextResponse.json({ template }, { status: 201 });
}

export const GET = withAuth(getHandler, { resource: "employers", action: "read" });
export const POST = withAuth(postHandler, { resource: "employers", action: "update" });
