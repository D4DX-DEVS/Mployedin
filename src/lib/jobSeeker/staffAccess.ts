import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import { getAgentSeekerArea, getSuperAgentScope, getSuperAgentTerritory, seekerInRegion } from "@/lib/auth/agentRestrictions";
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
 *    to view, also anyone visible whose area is in the agent's region or their
 *    super agent's (getAgentSeekerArea)
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
      .select("_id assignedJobSeekerIds assignedCityIds assignedStateIds superAgentId")
      .lean<{
        _id: unknown;
        assignedJobSeekerIds?: unknown[];
        assignedCityIds?: mongoose.Types.ObjectId[];
        assignedStateIds?: mongoose.Types.ObjectId[];
        superAgentId?: unknown;
      } | null>();
    if (!agent) return false;
    const owns =
      same(seeker.agentId, agent._id) ||
      same(seeker.referral?.agentId, agent._id) ||
      within(seeker._id, agent.assignedJobSeekerIds ?? []);
    if (owns || access !== "view" || seeker.roleArchivedAt) return owns;
    return seekerInRegion(seeker, await getAgentSeekerArea(agent));
  }

  if (ctx.role === "super_agent") {
    const rule = await superAgentSeekerRule(ctx.userId);
    const owns = rule.owns(seeker);
    if (owns || access !== "view" || seeker.roleArchivedAt) return owns;
    return seekerInRegion(seeker, await rule.territory());
  }

  return false;
}

/**
 * The super-agent half of canStaffAccessSeeker, resolved once so a list can
 * test many seekers without re-reading the scope for each. The territory is
 * read only when a seeker is not already owned.
 */
async function superAgentSeekerRule(userId: string) {
  const [scope, sa] = await Promise.all([
    getSuperAgentScope(userId),
    SuperAgent.findOne({ userId }).select("_id").lean<{ _id: unknown } | null>(),
  ]);
  const team = scope?.effectiveAgentIds ?? [];
  let territory: ReturnType<typeof getSuperAgentTerritory> | undefined;
  return {
    owns: (seeker: SeekerOwnership): boolean =>
      within(seeker.agentId, team) ||
      within(seeker.referral?.agentId, team) ||
      same(seeker.referral?.superAgentId, sa?._id),
    territory: () => (territory ??= getSuperAgentTerritory(userId, scope)),
  };
}

/**
 * Which of these seekers a super agent may open with "view" — the same answer
 * canStaffAccessSeeker gives one at a time, for a whole page of a list.
 */
export async function seekersSuperAgentCanView(userId: string, seekers: readonly SeekerOwnership[]): Promise<Set<string>> {
  const rule = await superAgentSeekerRule(userId);
  const viewable = new Set<string>();
  for (const seeker of seekers) {
    if (rule.owns(seeker) || (!seeker.roleArchivedAt && seekerInRegion(seeker, await rule.territory()))) {
      viewable.add(String(seeker._id));
    }
  }
  return viewable;
}
