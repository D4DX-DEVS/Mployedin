import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Job from "@/models/Job";
import { Employer } from "@/models/Employer";
import Agent from "@/models/Agent";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { isValidObjectId } from "@/lib/security/sanitize";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

// POST /api/jobs/[id]/clone — duplicate a job as a new draft
async function cloneHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  const allowed: UserRole[] = ["employer", "agent", "admin"];
  if (!allowed.includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const source = await Job.findById(params?.id).lean();
  if (!source) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Resolve effective agent and approval status (mirrors POST /api/jobs logic)
  let effectiveAgentId = source.agentId ?? null;
  let approvalStatus: "pending" | "approved";

  if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id agentId").lean();
    if (!emp || String(source.employerId) !== String(emp._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    // Use current employer agent if source had none
    effectiveAgentId = source.agentId ?? emp.agentId ?? null;
    approvalStatus = effectiveAgentId ? "pending" : "approved";
  } else if (ctx.role === "agent") {
    const agent = await Agent.findOne({ userId: ctx.userId }).select("_id").lean();
    if (agent) effectiveAgentId = agent._id;
    approvalStatus = "pending";
  } else {
    // admin — always approved
    approvalStatus = "approved";
  }

  const clone = await Job.create({
    employerId: source.employerId,
    agentId: effectiveAgentId,
    title: source.title,
    clonedFrom: source._id,
    description: source.description,
    requirements: source.requirements,
    salary: source.salary,
    location: source.location,
    tags: source.tags,
    vacancies: source.vacancies,
    workflowMode: source.workflowMode,
    status: "draft",
    poster: { approvalStatus },
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
