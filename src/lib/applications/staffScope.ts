import { NextResponse } from "next/server";
import Agent from "@/models/Agent";
import { agentCanSeeEmployer, getSuperAgentBook } from "@/lib/auth/agentRestrictions";
import { memberMayAccessJob } from "@/lib/permissions/team";
import type { UserRole } from "@/models/User";

interface ScopeCtx {
  userId: string;
  role: UserRole;
  member?: { actorId: string };
}

/**
 * Scope guard for agent / super_agent access to a single application, mirroring
 * the applications LIST routes. Agents are limited to applications for jobs they
 * own or whose employer they see (assigned, or registered in their region);
 * super_agents to their book — a job one of their agents posted, or one at an
 * employer in it. Returns 403 when out of scope, else null.
 * Admin / employer / job_seeker are authorized by their own branches.
 */
export async function verifyAgentScopeForApplication(
  jobEmployerId: unknown,
  jobAgentId: unknown,
  ctx: ScopeCtx
): Promise<NextResponse | null> {
  if (ctx.role === "agent") {
    const agent = await Agent.findOne({ userId: ctx.userId }).select("_id").lean();
    const ok = Boolean(
      agent && (
        String(jobAgentId) === String(agent._id) ||
        (await agentCanSeeEmployer(ctx.userId, jobEmployerId))
      )
    );
    return ok ? null : NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (ctx.role === "super_agent") {
    const book = await getSuperAgentBook(ctx.userId);
    const ok = Boolean(
      book && (
        (jobAgentId && book.agentIds.some((id) => String(id) === String(jobAgentId))) ||
        book.employerIds.some((id) => String(id) === String(jobEmployerId))
      )
    );
    return ok ? null : NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

/**
 * Read access to something hanging off one application (its documents, its
 * timeline): the same people who may open the application itself — the seeker
 * who applied, the employer that owns the job (within a colleague's job
 * restriction), staff in scope, and admin. Returns 403 when refused, else null.
 */
export async function verifyApplicationReadAccess(
  application: { jobId?: unknown; jobSeekerId?: unknown },
  ctx: ScopeCtx
): Promise<NextResponse | null> {
  const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (ctx.role === "admin") return null;

  if (ctx.role === "job_seeker") {
    const JobSeeker = (await import("@/models/JobSeeker")).default;
    const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("_id").lean();
    return seeker && String(application.jobSeekerId) === String(seeker._id) ? null : forbidden();
  }

  if (!["employer", "agent", "super_agent"].includes(ctx.role) || !application.jobId) return forbidden();
  const Job = (await import("@/models/Job")).default;
  const job = await Job.findById(application.jobId).select("_id employerId agentId").lean();
  if (!job) return forbidden();

  if (ctx.role === "employer") {
    const { Employer } = await import("@/models/Employer");
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!emp || String(job.employerId) !== String(emp._id)) return forbidden();
    return (await memberMayAccessJob(ctx, emp._id, job._id)) ? null : forbidden();
  }
  return verifyAgentScopeForApplication(job.employerId, job.agentId, ctx);
}
