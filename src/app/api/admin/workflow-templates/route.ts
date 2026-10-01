import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import WorkflowTemplate from "@/models/WorkflowTemplate";
import Job from "@/models/Job";
import { listActiveJobCategories } from "@/lib/jobs/jobCategoryStore";
import { validateBody } from "@/lib/validators";
import { workflowTemplateSchema } from "@/lib/validators/misc";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import {
  clearOtherDefaults,
  serializeWorkflowTemplate,
  templateWriteFields,
  workflowTemplateUsage,
} from "@/lib/hiring/workflowTemplateStore";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

/**
 * GET — every platform template (archived included) with how many jobs run on
 * it, plus the job categories in use so the match editor can offer them.
 */
async function getHandler(_req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();
  // Categories a rule can name: the admin-managed list plus any older value
  // still on a job, so a category added today is pickable before a job uses it.
  const [templates, categories, managed] = await Promise.all([
    WorkflowTemplate.find({ scope: "system" }).sort({ isDefault: -1, isActive: -1, name: 1 }).lean(),
    Job.distinct("category", { deletedAt: null }),
    listActiveJobCategories(),
  ]);
  const usage = await workflowTemplateUsage(templates.map((t) => t._id));
  return NextResponse.json({
    templates: templates.map((t) => serializeWorkflowTemplate(t, usage.get(String(t._id)) ?? 0)),
    categoryOptions: [...new Set([...managed.map((c) => c.name), ...(categories as unknown[])
      .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
      .map((c) => c.trim())])]
      .sort((a, b) => a.localeCompare(b)),
  });
}

/** POST — create a platform template */
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();
  const body = await validateBody(req, workflowTemplateSchema);

  const template = await WorkflowTemplate.create({
    ...templateWriteFields(body),
    version: 1,
    scope: "system",
    createdBy: ctx.userId,
  });
  if (template.isDefault) await clearOtherDefaults(template);

  await logActivity({
    ...actorFromCtx(ctx),
    action: "workflow_template.create",
    resource: "workflow_templates",
    resourceId: template._id.toString(),
    meta: { name: body.name },
    req,
  });

  return NextResponse.json({ template: serializeWorkflowTemplate(template.toObject(), 0) }, { status: 201 });
}

export const GET = withAuth(getHandler, { resource: "users", action: "read" });
export const POST = withAuth(postHandler, { resource: "users", action: "create" });
