import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Job from "@/models/Job";
import { Employer } from "@/models/Employer";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { jobUpdateSchema } from "@/lib/validators/jobs";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }
type Params = { id: string };

// GET /api/jobs/[id]
async function getHandler(_req: NextRequest, _ctx: AuthCtx, params?: Record<string, string>) {
  await connectDB();
  const job = await Job.findById(params?.id)
    .populate("employerId", "companyName country industry verificationLevel")
    .lean();
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  return NextResponse.json({ job });
}

// PATCH /api/jobs/[id]
async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  await connectDB();
  const job = await Job.findById(params?.id);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const body = await validateBody(req, jobUpdateSchema);

  // Ownership check
  if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id domainVerified").lean();
    if (!emp || String(job.employerId) !== String(emp._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    // Domain gate: only verified employers can publish (set status to 'active')
    const bodyRecord2 = body as Record<string, unknown>;
    if (bodyRecord2.status === "active" && !emp.domainVerified) {
      return NextResponse.json(
        { error: "Domain not verified. Please verify your company domain before publishing jobs." },
        { status: 403 }
      );
    }
  } else if (!["agent", "super_agent", "admin"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Admin can approve, everyone can update their own
  const allowedFields = [
    "title", "description", "category", "location", "requirements",
    "salary", "status", "expiresAt", "applicationMode", "tags", "vacancies",
    "maxApplicants", "showSalary", "visibility",
  ];
  const adminFields = ["poster.approvalStatus", "featuredUntil"];

  const bodyRecord = body as Record<string, unknown>;
  const updateData: Record<string, unknown> = {};
  for (const f of allowedFields) {
    if (f in bodyRecord) updateData[f] = bodyRecord[f];
  }
  if (ctx.role === "admin") {
    for (const f of adminFields) {
      if (f in bodyRecord) updateData[f] = bodyRecord[f];
    }
  }

  Object.assign(job, updateData);
  await job.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "job.update",
    resource: "jobs",
    resourceId: params?.id,
    changes: { after: updateData },
    req,
  });

  return NextResponse.json({ job });
}

// DELETE /api/jobs/[id]
async function deleteHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  await connectDB();
  const job = await Job.findById(params?.id);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!emp || String(job.employerId) !== String(emp._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const hardDeleted = ["draft", "closed", "expired"].includes(job.status);

  if (hardDeleted) {
    await job.deleteOne();
  } else {
    job.status = "closed";
    await job.save();
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "job.delete",
    resource: "jobs",
    resourceId: params?.id,
    meta: { title: job.title },
    req: _req,
  });

  return NextResponse.json({
    message: hardDeleted ? "Job deleted successfully" : "Job archived successfully",
  });
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);
export const DELETE = withAuth(deleteHandler);
