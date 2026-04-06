import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Job from "@/models/Job";
import { Employer } from "@/models/Employer";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

// POST /api/jobs/[id]/clone — duplicate a job as a new draft
async function cloneHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  const allowed: UserRole[] = ["employer", "agent", "admin"];
  if (!allowed.includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const source = await Job.findById(params?.id).lean();
  if (!source) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Ownership check
  if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!emp || String(source.employerId) !== String(emp._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const clone = await Job.create({
    employerId: source.employerId,
    agentId: source.agentId,
    title: `${source.title} (Copy)`,
    description: source.description,
    requirements: source.requirements,
    salary: source.salary,
    location: source.location,
    tags: source.tags,
    vacancies: source.vacancies,
    workflowMode: source.workflowMode,
    status: "draft",
    poster: { approvalStatus: "pending" },
  });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "job.clone",
    resource: "jobs",
    resourceId: String(clone._id),
    meta: { clonedFrom: params?.id },
    req,
  });

  return NextResponse.json({ job: clone }, { status: 201 });
}

export const POST = withAuth(cloneHandler);
