import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import WorkflowTemplate from "@/models/WorkflowTemplate";
import Employer from "@/models/Employer";
import { validateBody } from "@/lib/validators";
import { workflowTemplateSchema } from "@/lib/validators/misc";
import { logActivity } from "@/lib/audit/log";
import mongoose from "mongoose";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

/** GET — single template (must be system or belong to employer) */
async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (ctx.role !== "employer" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = params?.id;
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  await connectDB();
  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const template = await WorkflowTemplate.findOne({
    _id: id,
    $or: [{ scope: "system" }, { scope: "employer", employerId: employer._id }],
  }).lean();

  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ template });
}

/** PATCH — only employer-owned templates can be edited */
async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (ctx.role !== "employer" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = params?.id;
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  await connectDB();
  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const body = await validateBody(req, workflowTemplateSchema);

  const template = await WorkflowTemplate.findOneAndUpdate(
    { _id: id, scope: "employer", employerId: employer._id },
    {
      $set: {
        ...body,
        settings: {
          aiAutoScreen: body.settings?.aiAutoScreen ?? true,
          notifyOnStageChange: body.settings?.notifyOnStageChange ?? true,
          autoRejectBelow: body.settings?.autoRejectBelow ?? 40,
        },
      },
    },
    { returnDocument: "after" },
  );

  if (!template) {
    return NextResponse.json(
      { error: "Not found or cannot edit system templates" },
      { status: 404 },
    );
  }

  await logActivity({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "workflow_template.update",
    resource: "workflow_templates",
    resourceId: id,
    meta: { name: body.name },
    req,
  });

  return NextResponse.json({ template });
}

/** DELETE — only employer-owned templates */
async function deleteHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (ctx.role !== "employer" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = params?.id;
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  await connectDB();
  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const deleted = await WorkflowTemplate.findOneAndDelete({
    _id: id,
    scope: "employer",
    employerId: employer._id,
  });

  if (!deleted) {
    return NextResponse.json(
      { error: "Not found or cannot delete system templates" },
      { status: 404 },
    );
  }

  await logActivity({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "workflow_template.delete",
    resource: "workflow_templates",
    resourceId: id,
    req: _req,
  });

  return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler, { resource: "employers", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "employers", action: "update" });
export const DELETE = withAuth(deleteHandler, { resource: "employers", action: "delete" });
