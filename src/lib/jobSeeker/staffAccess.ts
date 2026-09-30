import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import { getSuperAgentScope, getSuperAgentTerritory, seekerInRegion } from "@/lib/auth/agentRestrictions";
import type mongoose from "mongoose";

/** The fields of a JobSeeker document that decide which staff member owns it. */
export interface SeekerOwnership {
  _id: unknown;
  agentId?: unknown;
  referral?: { agentId?: unknown; superAgentId?: unknown } | null;
  /** The seeker's area — lets the staff who cover it see (not manage) the profile. */
  regionCityId?: unknown;
  regionStateId?: unknown;
  profileVisibility?: string | null;
  /** Set when an admin converted the account to another role; the area never reaches it. */
  roleArchivedAt?: unknown;
}

/**
 * "view" opens the profile; "manage" edits or removes it. A seeker in the
 * staff member's area is theirs to view only — seeing is not owning, the same
 * rule employers in a region follow.
 */
export type SeekerAccess = "view" | "manage";

const same = (a: unknown, b: unknown): boolean => a != null && b != null && String(a) === String(b);
const within = (id: unknown, ids: unknown[]): boolean => ids.some((x) => same(x, id));

/**
 * Whether a staff member may open or manage this seeker through
 * /api/job-seekers/[id]. It mirrors what GET /api/job-seekers lists for them —
 * checking `agentId` alone 403'd every seeker who joined through a referral link
 * (a referral never writes agentId), though the list showed them.
 *  - admin: everyone
 *  - agent: assigned (agentId or assignedJobSeekerIds) or referred by them;
 *    to view, also anyone visible whose area is in the agent's region
 *  - super_agent: owned or referred by an agent in scope, or referred by them;
 *    to view, also anyone visible whose area is in their territory
 *  - anyone else: no one (self-service lives at /api/job-seeker/profile)
 */
export async function canStaffAccessSeeker(
  seeker: SeekerOwnership,
  ctx: { userId: string; role: string },
  access: SeekerAccess = "manage",
): Promise<boolean> {
  if (ctx.role === "admin") return true;

  if (ctx.role === "agent") {
    const agent = await Agent.findOne({ userId: ctx.userId })
      .select("_id assignedJobSeekerIds assignedCityIds assignedStateIds")
      .lean<{
        _id: unknown;
        assignedJobSeekerIds?: unknown[];
        assignedCityIds?: mongoose.Types.ObjectId[];
        assignedStateIds?: mongoose.Types.ObjectId[];
      } | null>();
    if (!agent) return false;
    const owns =
      same(seeker.agentId, agent._id) ||
      same(seeker.referral?.agentId, agent._id) ||
      within(seeker._id, agent.assignedJobSeekerIds ?? []);
    if (owns || access !== "view" || seeker.roleArchivedAt) return owns;
    return seekerInRegion(seeker, {
      assignedCityIds: agent.assignedCityIds ?? [],
      assignedStateIds: agent.assignedStateIds ?? [],
    });
  }

  if (ctx.role === "super_agent") {
    const [scope, sa] = await Promise.all([
      getSuperAgentScope(ctx.userId),
      SuperAgent.findOne({ userId: ctx.userId }).select("_id").lean<{ _id: unknown } | null>(),
    ]);
    const team = scope?.effectiveAgentIds ?? [];
    const owns =
      within(seeker.agentId, team) ||
      within(seeker.referral?.agentId, team) ||
      same(seeker.referral?.superAgentId, sa?._id);
    if (owns || access !== "view" || seeker.roleArchivedAt) return owns;
    return seekerInRegion(seeker, await getSuperAgentTerritory(ctx.userId, scope));
  }

  return false;
}
