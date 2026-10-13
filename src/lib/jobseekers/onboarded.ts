import mongoose from "mongoose";

/**
 * Build the "brought in" filter for onboarded job seekers.
 * A seeker is onboarded by an agent if:
 * - agentId = agent's id (they created the seeker), OR
 * - referral.agentId = agent's id (seeker joined via their link), OR
 * - _id in assignedJobSeekerIds (admin assigned them)
 * AND roleArchivedAt is null (not converted to another role)
 *
 * This is the same definition used on the agent dashboard ("Onboarded job seekers")
 * and in the /api/job-seekers?onboarded=1 filter.
 */
export function buildBroughtInFilter(agentId: mongoose.Types.ObjectId, assignedSeekerIds: mongoose.Types.ObjectId[] = []): Record<string, unknown> {
  const broughtInOr: Record<string, unknown>[] = [{ agentId }, { "referral.agentId": agentId }];
  if (assignedSeekerIds.length > 0) {
    broughtInOr.push({ _id: { $in: assignedSeekerIds } });
  }
  return { roleArchivedAt: null, $or: broughtInOr };
}
