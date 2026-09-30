import { agentCanSeeEmployer, getSuperAgentEmployerIds } from "@/lib/auth/agentRestrictions";

/**
 * Returns true if the offer's employer is one the agent sees — assigned to
 * them, or registered in their region (`getAgentEmployerIds`). Used to scope
 * agent access so they can only read/act on offers within that portfolio.
 *
 * Super-agents have no Agent document, so this always denies them — callers
 * that should allow a super-agent must additionally check
 * `superAgentOwnsOffer`.
 */
export async function agentOwnsOffer(userId: string, employerId: unknown): Promise<boolean> {
  return agentCanSeeEmployer(userId, employerId);
}

/**
 * Returns true if the offer's employer is in the super-agent's book — under
 * one of their agents or registered in their territory. Super-agents have no
 * Agent document, so agentOwnsOffer always denied them; this restores
 * legitimate portfolio access while still scoping by region.
 */
export async function superAgentOwnsOffer(userId: string, employerId: unknown): Promise<boolean> {
  if (!employerId) return false;
  const employerIds = await getSuperAgentEmployerIds(userId);
  return employerIds.some((id) => String(id) === String(employerId));
}
