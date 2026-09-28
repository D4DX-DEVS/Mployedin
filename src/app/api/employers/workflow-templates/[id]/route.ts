import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { withSubscription } from "@/lib/subscription/withSubscription";
import connectDB from "@/lib/db/mongoose";
import WorkflowTemplate from "@/models/WorkflowTemplate";
import Employer from "@/models/Employer";
import { validateBody } from "@/lib/validators";
import { workflowTemplateSchema } from "@/lib/validators/misc";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import {
  clearOtherDefaults,
  serializeWorkflowTemplate,
  templateWriteFields,
  workflowTemplateUsage,
} from "@/lib/hiring/workflowTemplateStore";
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
  return NextResponse.json({ template: serializeWorkflowTemplate(template) });
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
    // Jobs already on this template keep the snapshot they were given.
    { $set: templateWriteFields(body), $inc: { version: 1 } },
    { returnDocument: "after" },
  ).lean();

  if (!template) {
    return NextResponse.json(
      { error: "Not found or cannot edit system templates" },
      { status: 404 },
    );
  }

  if (template.isDefault) await clearOtherDefaults(template);

  await logActivity({
    ...actorFromCtx(ctx),
    action: "workflow_template.update",
    resource: "workflow_templates",
    resourceId: id,
    meta: { name: body.name },
    req,
  });

  return NextResponse.json({ template: serializeWorkflowTemplate(template) });
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

  // A template jobs run on is archived, never deleted: their snapshots name it.
  const inUse = (await workflowTemplateUsage([id])).get(id) ?? 0;
  if (inUse > 0) {
    return NextResponse.json({ error: "TEMPLATE_IN_USE", count: inUse }, { status: 409 });
  }

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
    ...actorFromCtx(ctx),
    action: "workflow_template.delete",
    resource: "workflow_templates",
    resourceId: id,
    req: _req,
  });

  return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler, { resource: "employers", action: "read" });
const WORKFLOW_GATE = { type: "toggle", feature: "workflowCustomization" } as const;
export const PATCH = withAuth(withSubscription(patchHandler, WORKFLOW_GATE), { resource: "employers", action: "update" });
export const DELETE = withAuth(withSubscription(deleteHandler, WORKFLOW_GATE), { resource: "employers", action: "delete" });
