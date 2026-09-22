import Agent from "@/models/Agent";
import { Employer } from "@/models/Employer";
import { getSuperAgentScope } from "@/lib/auth/agentRestrictions";

/**
 * Returns true if the agent is assigned to the offer's employer.
 * Used to scope agent access so they can only read/act on offers within their
 * assigned employer portfolio.
 *
 * Super-agents have no Agent document, so this always denies them — callers
 * that should allow a super-agent must additionally check
 * `superAgentOwnsOffer`.
 */
export async function agentOwnsOffer(userId: string, employerId: unknown): Promise<boolean> {
  const agentDoc = await Agent.findOne({ userId }).select("assignedEmployerIds").lean();
  const assigned = (agentDoc?.assignedEmployerIds ?? []).map((id: unknown) => String(id));
  return assigned.includes(String(employerId));
}

/**
 * Returns true if the super-agent oversees the offer's employer — i.e. the
 * employer's assigned agent is within the super-agent's effective scope (team +
 * region). Super-agents have no Agent document, so agentOwnsOffer always denied
 * them; this restores legitimate portfolio access while still scoping by region.
 */
export async function superAgentOwnsOffer(userId: string, employerId: unknown): Promise<boolean> {
  const scope = await getSuperAgentScope(userId);
  if (!scope || scope.effectiveAgentIds.length === 0) return false;
  const emp = await Employer.findById(employerId).select("agentId").lean();
  if (!emp?.agentId) return false;
  return scope.effectiveAgentIds.map(String).includes(String(emp.agentId));
}
