import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import WorkflowTemplate from "@/models/WorkflowTemplate";
import { validateBody } from "@/lib/validators";
import { workflowTemplateActionSchema, workflowTemplateSchema } from "@/lib/validators/misc";
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

function guard(ctx: AuthCtx, params?: Record<string, string>): NextResponse | string {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = params?.id;
  if (!id || !mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  return id;
}

async function withUsage(template: Parameters<typeof serializeWorkflowTemplate>[0]) {
  const usage = await workflowTemplateUsage([template._id]);
  return serializeWorkflowTemplate(template, usage.get(String(template._id)) ?? 0);
}

/** GET — single template */
async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  const id = guard(ctx, params);
  if (typeof id !== "string") return id;
  await connectDB();
  const template = await WorkflowTemplate.findOne({ _id: id, scope: "system" }).lean();
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ template: await withUsage(template) });
}

/**
 * PATCH — edit a platform template. The version goes up; jobs already on the
 * template keep the snapshot they were given (lib/hiring/jobWorkflow.ts).
 */
async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  const id = guard(ctx, params);
  if (typeof id !== "string") return id;
  await connectDB();
  const body = await validateBody(req, workflowTemplateSchema);

  const template = await WorkflowTemplate.findOneAndUpdate(
    { _id: id, scope: "system" },
    { $set: templateWriteFields(body), $inc: { version: 1 } },
    { returnDocument: "after" },
  ).lean();
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Legacy rows had no version: the first edit makes them version 2 of an implicit 1.
  if (template.version === 1) {
    await WorkflowTemplate.updateOne({ _id: id }, { $set: { version: 2 } });
    template.version = 2;
  }
  if (template.isDefault) await clearOtherDefaults(template);

  await logActivity({
    ...actorFromCtx(ctx),
    action: "workflow_template.update",
    resource: "workflow_templates",
    resourceId: id,
    meta: { name: body.name, version: template.version },
    req,
  });

  return NextResponse.json({ template: await withUsage(template) });
}

/** POST — set/unset default, archive/restore, duplicate. */
async function postHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  const id = guard(ctx, params);
  if (typeof id !== "string") return id;
  await connectDB();
  const { action } = await validateBody(req, workflowTemplateActionSchema);

  const existing = await WorkflowTemplate.findOne({ _id: id, scope: "system" }).lean();
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (action === "duplicate") {
    const copy = await WorkflowTemplate.create({
      name: `${existing.name} (copy)`.slice(0, 100),
      description: existing.description ?? "",
      stages: serializeWorkflowTemplate(existing).stages.map((s) => ({ ...s, enabled: true, autoProgress: false })),
      tags: existing.tags ?? [],
      priority: existing.priority ?? 0,
      match: serializeWorkflowTemplate(existing).match,
      isActive: true,
      isDefault: false,
      version: 1,
      scope: "system",
      createdBy: ctx.userId,
    });
    await logActivity({
      ...actorFromCtx(ctx),
      action: "workflow_template.duplicate",
      resource: "workflow_templates",
      resourceId: copy._id.toString(),
      meta: { from: id, name: copy.name },
      req,
    });
    return NextResponse.json({ template: serializeWorkflowTemplate(copy.toObject(), 0) }, { status: 201 });
  }

  if (action === "set_default" && existing.isActive === false) {
    return NextResponse.json({ error: "Restore the template before making it the default." }, { status: 409 });
  }

  const $set: Record<string, unknown> =
    action === "set_default" ? { isDefault: true }
    : action === "unset_default" ? { isDefault: false }
    : action === "archive" ? { isActive: false, isDefault: false }
    : { isActive: true };
  const template = await WorkflowTemplate.findOneAndUpdate({ _id: id, scope: "system" }, { $set }, { returnDocument: "after" }).lean();
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (action === "set_default") await clearOtherDefaults(template);

  await logActivity({
    ...actorFromCtx(ctx),
    action: `workflow_template.${action}`,
    resource: "workflow_templates",
    resourceId: id,
    meta: { name: template.name },
    req,
  });
  return NextResponse.json({ template: await withUsage(template) });
}

/** DELETE — only a template no job runs on; a used one is archived instead. */
async function deleteHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  const id = guard(ctx, params);
  if (typeof id !== "string") return id;
  await connectDB();
  const usage = await workflowTemplateUsage([id]);
  const count = usage.get(id) ?? 0;
  if (count > 0) {
    return NextResponse.json({ error: "TEMPLATE_IN_USE", count }, { status: 409 });
  }
  const deleted = await WorkflowTemplate.findOneAndDelete({ _id: id, scope: "system" });
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "workflow_template.delete",
    resource: "workflow_templates",
    resourceId: id,
    meta: { name: deleted.name },
    req,
  });

  return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler, { resource: "users", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "users", action: "update" });
export const POST = withAuth(postHandler, { resource: "users", action: "update" });
export const DELETE = withAuth(deleteHandler, { resource: "users", action: "delete" });
