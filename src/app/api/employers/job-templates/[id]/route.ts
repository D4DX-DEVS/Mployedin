import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { Employer } from "@/models/Employer";
import { JobTemplate } from "@/models/JobTemplate";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { jobTemplateUpdateSchema } from "@/lib/validators/job-templates";
import type { UserRole } from "@/models/User";
import { isValidObjectId } from "@/lib/security/sanitize";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

// GET /api/employers/job-templates/[id] — get single template by id
async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!employer) {
    return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
  }

  const template = await JobTemplate.findById(params?.id).lean();
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  // Ownership check
  if (String(template.employerId) !== String(employer._id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ template });
}

// DELETE /api/employers/job-templates/[id] — delete template by id
async function deleteHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!employer) {
    return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
  }

  const template = await JobTemplate.findById(params?.id);
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  // Ownership check
  if (String(template.employerId) !== String(employer._id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const templateName = template.name;
  await JobTemplate.deleteOne({ _id: template._id });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "job_template.delete",
    resource: "job_templates",
    resourceId: String(template._id),
    changes: { before: { name: templateName } },
    req: _req,
  });

  return NextResponse.json({ message: "Template deleted" });
}

// PATCH /api/employers/job-templates/[id] — update template fields
async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await validateBody(req, jobTemplateUpdateSchema);

  await connectDB();

  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!employer) {
    return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
  }

  const template = await JobTemplate.findById(params?.id);
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  // Ownership check
  if (String(template.employerId) !== String(employer._id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  Object.assign(template, body);
  await template.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "job_template.update",
    resource: "job_templates",
    resourceId: String(template._id),
    changes: { after: { name: body.name } },
    req,
  });

  return NextResponse.json({ template });
}

export const GET = withAuth(getHandler, { resource: "employers", action: "read" });
export const DELETE = withAuth(deleteHandler, { resource: "employers", action: "update" });
export const PATCH = withAuth(patchHandler, { resource: "employers", action: "update" });
