import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { Employer } from "@/models/Employer";
import { JobTemplate } from "@/models/JobTemplate";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { jobTemplateCreateSchema } from "@/lib/validators/job-templates";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

// GET /api/employers/job-templates — list all templates for the authenticated employer
async function getHandler(_req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!employer) {
    return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
  }

  const templates = await JobTemplate.find({ employerId: employer._id })
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({ templates });
}

// POST /api/employers/job-templates — create a new template
async function createHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await validateBody(req, jobTemplateCreateSchema);

  await connectDB();

  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!employer) {
    return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
  }

  const template = await JobTemplate.create({
    employerId: employer._id,
    ...body,
  });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "job_template.create",
    resource: "job_templates",
    resourceId: String(template._id),
    changes: { after: { name: body.name } },
    req,
  });

  return NextResponse.json({ template }, { status: 201 });
}

export const GET = withAuth(getHandler, { resource: "employers", action: "read" });
export const POST = withAuth(createHandler, { resource: "employers", action: "update" });
