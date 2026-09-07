import { Employer } from "@/models/Employer";
import Agent from "@/models/Agent";
import { getSuperAgentScope } from "@/lib/auth/agentRestrictions";
import type { UserRole } from "@/models/User";

export interface JobAccessCtx { userId: string; role: UserRole }
export interface JobAccessTarget { employerId: unknown; agentId?: unknown }

/**
 * May this caller read a job's private data (workflow, hiring counts)?
 * Mirrors the ownership branches in api/jobs/[id]/workflow/route.ts:
 * admin always; employer when they own the job; agent when they own the job
 * or are assigned to its employer; super-agent when the job's agent is in
 * their scope. Everything else — including an empty scope — is denied.
 */
export async function canAccessJob(ctx: JobAccessCtx, job: JobAccessTarget): Promise<boolean> {
  if (ctx.role === "admin") return true;
  if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    return Boolean(emp && String(job.employerId) === String(emp._id));
  }
  if (ctx.role === "agent") {
    const agent = await Agent.findOne({ userId: ctx.userId }).select("_id assignedEmployerIds").lean();
    if (!agent) return false;
    if (String(job.agentId) === String(agent._id)) return true;
    return ((agent.assignedEmployerIds as unknown[]) ?? []).some((e) => String(e) === String(job.employerId));
  }
  if (ctx.role === "super_agent") {
    const scope = await getSuperAgentScope(ctx.userId);
    return Boolean(job.agentId && scope?.effectiveAgentIds.some((id) => String(id) === String(job.agentId)));
  }
  return false;
}
