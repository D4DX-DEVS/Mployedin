import Agent from "@/models/Agent";
import { getSuperAgentEmployerIds } from "@/lib/auth/agentRestrictions";

interface SourcingCtx {
  userId: string;
  role: string;
}

interface SourcingJob {
  employerId?: unknown;
  agentId?: unknown;
}

/**
 * May this staff member source candidates for this job — see the matching
 * list and invite people to apply on the employer's behalf?
 *
 * An agent: the job's employer is assigned to them, or they posted it. This is
 * the owner rule, not the wider "employers in my area" visibility, because an
 * invite speaks for the employer. A super-agent: the employer is in their
 * book. Admin: any job. Employers are checked by their own routes (own job).
 */
export async function canSourceForJob(ctx: SourcingCtx, job: SourcingJob): Promise<boolean> {
  if (ctx.role === "admin") return true;
  if (ctx.role === "agent") {
    const agent = await Agent.findOne({ userId: ctx.userId }).select("_id assignedEmployerIds").lean();
    if (!agent) return false;
    return (
      (job.agentId != null && String(job.agentId) === String(agent._id)) ||
      ((agent.assignedEmployerIds as unknown[] | undefined) ?? []).some((e) => String(e) === String(job.employerId))
    );
  }
  if (ctx.role === "super_agent") {
    const book = await getSuperAgentEmployerIds(ctx.userId);
    return book.some((e) => String(e) === String(job.employerId));
  }
  return false;
}
