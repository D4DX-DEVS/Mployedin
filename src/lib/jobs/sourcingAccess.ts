import Agent from "@/models/Agent";
import { Employer } from "@/models/Employer";
import { getSuperAgentBook } from "@/lib/auth/agentRestrictions";

interface SourcingCtx {
  userId: string;
  role: string;
}

interface SourcingJob {
  employerId?: unknown;
  agentId?: unknown;
}

const same = (a: unknown, b: unknown): boolean => a != null && b != null && String(a) === String(b);

/**
 * May this caller source candidates for this job — see the matching list and
 * invite people to apply on the employer's behalf?
 *
 * An employer: its own job. The owner, a team member and staff in tenant view
 * all arrive here as the employer's own user (withAuth swaps the user id), so
 * one check covers all three; what a team member may do is narrowed earlier by
 * their granted functions. An agent: the job's employer is assigned to them,
 * or they posted it — the owner rule, not the wider "employers in my area"
 * visibility, because an invite speaks for the employer. A super-agent: the
 * job is in their book, the same set their jobs list shows (a book employer's
 * job, or one posted by an agent in their scope). Admin: any job.
 */
export async function canSourceForJob(ctx: SourcingCtx, job: SourcingJob): Promise<boolean> {
  if (ctx.role === "admin") return true;
  if (ctx.role === "employer") {
    const employer = await Employer.findOne({ userId: ctx.userId }).select("_id").lean<{ _id: unknown } | null>();
    return Boolean(employer) && same(employer?._id, job.employerId);
  }
  if (ctx.role === "agent") {
    const agent = await Agent.findOne({ userId: ctx.userId }).select("_id assignedEmployerIds").lean();
    if (!agent) return false;
    return (
      same(job.agentId, agent._id) ||
      ((agent.assignedEmployerIds as unknown[] | undefined) ?? []).some((e) => same(e, job.employerId))
    );
  }
  if (ctx.role === "super_agent") {
    const book = await getSuperAgentBook(ctx.userId);
    if (!book) return false;
    return book.employerIds.some((e) => same(e, job.employerId)) || book.agentIds.some((a) => same(a, job.agentId));
  }
  return false;
}
