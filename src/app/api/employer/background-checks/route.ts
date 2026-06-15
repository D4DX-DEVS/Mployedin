import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { Employer } from "@/models/Employer";
import Application from "@/models/Application";
import BackgroundCheck from "@/models/BackgroundCheck";
import { validateBody } from "@/lib/validators";
import { backgroundCheckCreateSchema } from "@/lib/validators/backgroundChecks";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

/**
 * GET /api/employer/background-checks (FG-7)
 * Lists the employer's background/reference checks, newest first.
 */
async function listHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();
  const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!emp) return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));
  const status = url.searchParams.get("status");

  const filter: Record<string, unknown> = { employerId: (emp as { _id: unknown })._id };
  if (status) filter.status = status;

  const [items, total] = await Promise.all([
    BackgroundCheck.find(filter)
      .populate({ path: "jobSeekerId", select: "fullName userId", populate: { path: "userId", select: "name" } })
      .populate({ path: "jobId", select: "title" })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    BackgroundCheck.countDocuments(filter),
  ]);

  return NextResponse.json({ items, total, page, limit });
}

/**
 * POST /api/employer/background-checks (FG-7)
 * Initiates a background and/or reference check for one of the employer's
 * applications. The application must belong to the caller's employer.
 */
async function createHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();
  const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!emp) return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });

  const body = await validateBody(req, backgroundCheckCreateSchema);

  const application = await Application.findById(body.applicationId)
    .select("employerId jobId jobSeekerId")
    .lean();
  if (!application) return NextResponse.json({ error: "Application not found" }, { status: 404 });
  if (String((application as { employerId: unknown }).employerId) !== String((emp as { _id: unknown })._id)) {
    return NextResponse.json({ error: "Forbidden: application not owned by employer" }, { status: 403 });
  }

  const references = (body.references ?? []).map((r) => ({
    name: r.name,
    relationship: r.relationship,
    company: r.company,
    email: r.email || undefined,
    phone: r.phone,
    status: "pending" as const,
  }));

  const check = await BackgroundCheck.create({
    applicationId: body.applicationId,
    jobId: (application as { jobId: unknown }).jobId,
    jobSeekerId: (application as { jobSeekerId: unknown }).jobSeekerId,
    employerId: (emp as { _id: unknown })._id,
    checkType: body.checkType,
    references,
    backgroundNotes: body.backgroundNotes,
    status: references.length > 0 ? "in_progress" : "pending",
    createdBy: ctx.userId,
  });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "background_check.create",
    resource: "applications",
    resourceId: String(check._id),
    req,
  }).catch(() => { /* non-blocking */ });

  return NextResponse.json({ check }, { status: 201 });
}

export const GET = withAuth(listHandler, { resource: "applications", action: "read" });
export const POST = withAuth(createHandler, { resource: "applications", action: "update" });
