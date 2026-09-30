import { Employer } from "@/models/Employer";
import Agent from "@/models/Agent";
import { agentCanSeeEmployer, getSuperAgentBook } from "@/lib/auth/agentRestrictions";
import type { UserRole } from "@/models/User";

export interface JobAccessCtx { userId: string; role: UserRole }
export interface JobAccessTarget { employerId: unknown; agentId?: unknown }

/**
 * May this caller read a job's private data (workflow, hiring counts)?
 * Mirrors the ownership branches in api/jobs/[id]/workflow/route.ts:
 * admin always; employer when they own the job; agent when they own the job
 * or see its employer (assigned, or registered in their region); super-agent
 * when the job is in their book (posted by one of their agents, or for an
 * employer in it). Everything else — including an empty scope — is denied.
 */
export async function canAccessJob(ctx: JobAccessCtx, job: JobAccessTarget): Promise<boolean> {
  if (ctx.role === "admin") return true;
  if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    return Boolean(emp && String(job.employerId) === String(emp._id));
  }
  if (ctx.role === "agent") {
    const agent = await Agent.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!agent) return false;
    if (String(job.agentId) === String(agent._id)) return true;
    return agentCanSeeEmployer(ctx.userId, job.employerId);
  }
  if (ctx.role === "super_agent") {
    const book = await getSuperAgentBook(ctx.userId);
    return Boolean(
      book && (
        (job.agentId && book.agentIds.some((id) => String(id) === String(job.agentId))) ||
        book.employerIds.some((id) => String(id) === String(job.employerId))
      )
    );
  }
  return false;
}
