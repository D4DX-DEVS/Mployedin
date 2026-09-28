import Agent from "@/models/Agent";

export type RecruitmentJobAccessError = "agent_not_assigned" | "outside_team";

/**
 * Who may invoice a job — or preview its commission rates. Admins: any job. An
 * agent: only jobs assigned to them. A super-agent: only jobs handled by an
 * agent in their scope (team + region). Returns null when allowed.
 */
export async function recruitmentJobAccessError(
  ctx: { userId: string; role: string },
  jobAgentId: unknown,
): Promise<RecruitmentJobAccessError | null> {
  if (ctx.role === "agent") {
    const myAgent = await Agent.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!myAgent || !jobAgentId || String(jobAgentId) !== String(myAgent._id)) return "agent_not_assigned";
  }

  if (ctx.role === "super_agent") {
    const { getSuperAgentScope } = await import("@/lib/auth/agentRestrictions");
    const scope = await getSuperAgentScope(ctx.userId);
    const scopedAgentIds = (scope?.effectiveAgentIds ?? []).map(String);
    if (!jobAgentId || !scopedAgentIds.includes(String(jobAgentId))) return "outside_team";
  }

  return null;
}
