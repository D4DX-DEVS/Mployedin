import Agent from "@/models/Agent";
import { getSuperAgentScope } from "@/lib/auth/agentRestrictions";

export interface LeadAccessCtx { userId: string; role: string }
export interface LeadAccessTarget { agentId?: unknown; superAgentId?: unknown }

/**
 * May this caller read or change the lead? Admin always; an agent only their
 * own lead; a super-agent only a lead of their team (their own profile or one
 * of their effective agents). Every other role is denied.
 *
 * The one definition for /api/leads/[id] and its sub-routes — the activities
 * route used to check agents only and let any super-agent through.
 */
export async function canAccessLead(ctx: LeadAccessCtx, lead: LeadAccessTarget): Promise<boolean> {
  if (ctx.role === "admin") return true;
  if (ctx.role === "agent") {
    const agentDoc = await Agent.findOne({ userId: ctx.userId }).select("_id").lean();
    return Boolean(agentDoc && String(lead.agentId) === String(agentDoc._id));
  }
  if (ctx.role === "super_agent") {
    // Scoped to their own team/region: without it a super-agent could read or
    // change leads of another team's agents (cross-team data + commission fraud).
    const scope = await getSuperAgentScope(ctx.userId);
    return Boolean(
      scope &&
        (String(lead.superAgentId ?? "") === String(scope.saProfileId) ||
          scope.effectiveAgentIds.map(String).includes(String(lead.agentId ?? "")))
    );
  }
  return false;
}
