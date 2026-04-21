import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import WorkflowTemplate from "@/models/WorkflowTemplate";
import { validateBody } from "@/lib/validators";
import { workflowTemplateSchema } from "@/lib/validators/misc";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

/** GET — list all system workflow templates */
async function getHandler(_req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();
  const templates = await WorkflowTemplate.find({ scope: "system" })
    .sort({ isDefault: -1, createdAt: -1 })
    .lean();
  return NextResponse.json({ templates });
}

/** POST — create a new system workflow template */
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();
  const body = await validateBody(req, workflowTemplateSchema);

  const template = await WorkflowTemplate.create({
    ...body,
    settings: {
      aiAutoScreen: body.settings?.aiAutoScreen ?? true,
      notifyOnStageChange: body.settings?.notifyOnStageChange ?? true,
      autoRejectBelow: body.settings?.autoRejectBelow ?? 40,
    },
    scope: "system",
    createdBy: ctx.userId,
  });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "workflow_template.create",
    resource: "workflow_templates",
    resourceId: template._id.toString(),
    meta: { name: body.name },
    req,
  });

  return NextResponse.json({ template }, { status: 201 });
}

export const GET = withAuth(getHandler, { resource: "users", action: "read" });
export const POST = withAuth(postHandler, { resource: "users", action: "create" });
