import { NextResponse } from "next/server";
import JobSeeker from "@/models/JobSeeker";
import Job from "@/models/Job";
import { Employer } from "@/models/Employer";
import Agent from "@/models/Agent";
import { getSuperAgentBook } from "@/lib/auth/agentRestrictions";
import { memberMayAccessJob } from "@/lib/permissions/team";
import type { UserRole } from "@/models/User";

export interface InterviewAccessCtx {
  userId: string;
  role: UserRole;
  member?: { actorId: string };
}

/**
 * Object-ownership guard for /api/interviews/[id] and its sub-routes. Resolves the interview to its
 * owning job/employer and verifies the caller is one of: the candidate, the
 * owning employer, the assigned agent, a scoped super_agent, or an admin.
 * Mirrors offers/[id] + applications list scoping. Returns 403 when not allowed.
 */
export async function verifyInterviewAccess(
  interview: { jobId?: unknown; jobSeekerId?: unknown },
  ctx: InterviewAccessCtx
): Promise<NextResponse | null> {
  if (ctx.role === "admin") return null;

  if (ctx.role === "job_seeker") {
    const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!seeker || String(interview.jobSeekerId) !== String(seeker._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return null;
  }

  // Remaining roles are scoped through the interview's owning job/employer.
  const job = await Job.findById(interview.jobId).select("employerId agentId").lean();
  if (!job) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (
      !emp ||
      String(job.employerId) !== String(emp._id) ||
      !(await memberMayAccessJob(ctx, emp._id, job._id))
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return null;
  }

  if (ctx.role === "agent") {
    const agent = await Agent.findOne({ userId: ctx.userId }).select("_id assignedEmployerIds").lean();
    const ok = Boolean(
      agent && (
        String(job.agentId) === String(agent._id) ||
        ((agent.assignedEmployerIds as unknown[]) ?? []).some((e) => String(e) === String(job.employerId))
      )
    );
    if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return null;
  }

  if (ctx.role === "super_agent") {
    // The same territory the jobs pages use: posted by one of their agents, or
    // for an employer in their book (the agent link is written from both ends).
    const book = await getSuperAgentBook(ctx.userId);
    const ok = Boolean(
      book && (
        (job.agentId && book.agentIds.some((id) => String(id) === String(job.agentId))) ||
        book.employerIds.some((id) => String(id) === String(job.employerId))
      )
    );
    if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return null;
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
