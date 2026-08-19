import { NextRequest, NextResponse } from "next/server";
import { Error as MongooseError } from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import { Employer } from "@/models/Employer";
import Agent from "@/models/Agent";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { jobUpdateSchema } from "@/lib/validators/jobs";
import { isValidObjectId } from "@/lib/security/sanitize";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }
type Params = { id: string };

// GET /api/jobs/[id]
async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const job = await Job.findOne({ _id: params?.id, deletedAt: null })
    .populate("employerId", "companyName country industry verificationLevel logo")
    .lean();
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // Job seekers may only view active jobs; owners and privileged roles can view any status
  if (ctx.role === "job_seeker" && job.status !== "active") {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({ job });
}

// PATCH /api/jobs/[id]
async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const job = await Job.findById(params?.id);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const body = await validateBody(req, jobUpdateSchema);

  // Ownership check
  if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id verifiedAt isAgentVerified").lean();
    if (!emp || String(job.employerId) !== String(emp._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    // Domain gate: unverified employers cannot self-publish. Reroute a publish
    // attempt (status === "active") to the moderation queue ("pending_approval")
    // instead of hard-rejecting — this makes an explicit "Submit for Approval"
    // CTA succeed for unverified employers and matches the POST createHandler
    // behavior. Admins approve via /api/admin/jobs/[id]/approve.
    // Also check if job is agent-mediated (has agentId) — verified employers still need approval
    const bodyRecord2 = body as Record<string, unknown>;
    const employerVerified = Boolean(emp.verifiedAt) || Boolean(emp.isAgentVerified);
    if (bodyRecord2.status === "active" && (!employerVerified || job.agentId)) {
      bodyRecord2.status = "pending_approval";
    }
  } else if (ctx.role === "agent") {
    // Scope agent writes to jobs they own or jobs of their assigned employers.
    const agent = await Agent.findOne({ userId: ctx.userId }).select("_id assignedEmployerIds").lean();
    const ok = Boolean(
      agent && (
        String(job.agentId) === String(agent._id) ||
        ((agent.assignedEmployerIds as unknown[]) ?? []).some((e) => String(e) === String(job.employerId))
      )
    );
    if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    // Agents cannot directly publish jobs; reroute to moderation queue.
    const bodyRecord3 = body as Record<string, unknown>;
    if (bodyRecord3.status === "active") {
      bodyRecord3.status = "pending_approval";
    }
  } else if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Admin can approve, everyone can update their own
  const allowedFields = [
    "title", "description", "category", "location", "requirements",
    "salary", "status", "expiresAt", "applicationMode", "tags", "vacancies",
    "maxApplicants", "showSalary", "visibility", "screeningQuestions",
    "employmentType", "workMode", "duration", "responsibilities",
    "qualifications", "benefits", "learningOutcomes",
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
  try {
    // Drafts may be incomplete; full validation applies once leaving draft (matches POST handler)
    await job.save({ validateBeforeSave: job.status !== "draft" });
  } catch (err) {
    if (err instanceof MongooseError.ValidationError) {
      return NextResponse.json(
        { error: "VALIDATION_FAILED", fields: Object.keys(err.errors) },
        { status: 400 },
      );
    }
    throw err;
  }

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

// DELETE /api/jobs/[id] — soft delete
async function deleteHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
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

  // Soft delete: mark as deleted instead of removing from DB
  job.deletedAt = new Date();
  if (job.status === "active" || job.status === "paused") {
    job.preDeletionStatus = job.status;
    job.status = "closed";
  }
  await job.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "job.delete",
    resource: "jobs",
    resourceId: params?.id,
    meta: { title: job.title },
    req: _req,
  });

  return NextResponse.json({ message: "Job deleted successfully" });
}

export { getHandler, patchHandler, deleteHandler };
