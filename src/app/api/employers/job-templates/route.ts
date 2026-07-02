import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { Employer } from "@/models/Employer";
import { JobTemplate } from "@/models/JobTemplate";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { jobTemplateCreateSchema } from "@/lib/validators/job-templates";
import { escapeRegex } from "@/lib/security/sanitize";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

// GET /api/employers/job-templates — list all templates for the authenticated employer
async function getHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!employer) {
    return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
  }

  const params = new URL(req.url).searchParams;
  const search = params.get("search") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.get("limit")) || 10));

  const filter: Record<string, unknown> = { employerId: employer._id };
  if (search) filter.name = { $regex: escapeRegex(search), $options: "i" };

  const [templates, total] = await Promise.all([
    JobTemplate.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    JobTemplate.countDocuments(filter),
  ]);

  return NextResponse.json({
    templates,
    pagination: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
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
