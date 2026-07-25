import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import WorkflowTemplate from "@/models/WorkflowTemplate";
import { validateBody } from "@/lib/validators";
import { workflowTemplateSchema } from "@/lib/validators/misc";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import mongoose from "mongoose";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

/** GET — single template */
async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = params?.id;
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  await connectDB();
  const template = await WorkflowTemplate.findOne({ _id: id, scope: "system" }).lean();
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ template });
}

/** PATCH — update a system workflow template */
async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = params?.id;
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  await connectDB();
  const body = await validateBody(req, workflowTemplateSchema);

  const template = await WorkflowTemplate.findOneAndUpdate(
    { _id: id, scope: "system" },
    { $set: { ...body, settings: { aiAutoScreen: body.settings?.aiAutoScreen ?? true, notifyOnStageChange: body.settings?.notifyOnStageChange ?? true, autoRejectBelow: body.settings?.autoRejectBelow ?? 40 } } },
    { returnDocument: "after" },
  );

  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "workflow_template.update",
    resource: "workflow_templates",
    resourceId: id,
    meta: { name: body.name },
    req,
  });

  return NextResponse.json({ template });
}

/** DELETE — remove a system workflow template */
async function deleteHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = params?.id;
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  await connectDB();
  const deleted = await WorkflowTemplate.findOneAndDelete({ _id: id, scope: "system" });
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "workflow_template.delete",
    resource: "workflow_templates",
    resourceId: id,
    req: _req,
  });

  return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler, { resource: "users", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "users", action: "update" });
export const DELETE = withAuth(deleteHandler, { resource: "users", action: "delete" });
