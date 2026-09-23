import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import { getSuperAgentScope } from "@/lib/auth/agentRestrictions";

/** The fields of a JobSeeker document that decide which staff member owns it. */
export interface SeekerOwnership {
  _id: unknown;
  agentId?: unknown;
  referral?: { agentId?: unknown; superAgentId?: unknown } | null;
}

const same = (a: unknown, b: unknown): boolean => a != null && b != null && String(a) === String(b);
const within = (id: unknown, ids: unknown[]): boolean => ids.some((x) => same(x, id));

/**
 * Whether a staff member may open or manage this seeker through
 * /api/job-seekers/[id]. It mirrors what GET /api/job-seekers lists for them —
 * checking `agentId` alone 403'd every seeker who joined through a referral link
 * (a referral never writes agentId), though the list showed them.
 *  - admin: everyone
 *  - agent: assigned (agentId or assignedJobSeekerIds) or referred by them
 *  - super_agent: owned or referred by an agent in scope, or referred by them
 *  - anyone else: no one (self-service lives at /api/job-seeker/profile)
 */
export async function canStaffAccessSeeker(
  seeker: SeekerOwnership,
  ctx: { userId: string; role: string },
): Promise<boolean> {
  if (ctx.role === "admin") return true;

  if (ctx.role === "agent") {
    const agent = await Agent.findOne({ userId: ctx.userId }).select("_id assignedJobSeekerIds").lean<{
      _id: unknown;
      assignedJobSeekerIds?: unknown[];
    } | null>();
    if (!agent) return false;
    return (
      same(seeker.agentId, agent._id) ||
      same(seeker.referral?.agentId, agent._id) ||
      within(seeker._id, agent.assignedJobSeekerIds ?? [])
    );
  }

  if (ctx.role === "super_agent") {
    const [scope, sa] = await Promise.all([
      getSuperAgentScope(ctx.userId),
      SuperAgent.findOne({ userId: ctx.userId }).select("_id").lean<{ _id: unknown } | null>(),
    ]);
    const team = scope?.effectiveAgentIds ?? [];
    return (
      within(seeker.agentId, team) ||
      within(seeker.referral?.agentId, team) ||
      same(seeker.referral?.superAgentId, sa?._id)
    );
  }

  return false;
}
