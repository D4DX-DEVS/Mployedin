import Agent from "@/models/Agent";
import { findRegionCoverage } from "@/lib/agents/territoryCoverage";
import {
  notifyAdminsEmployerOutsideTerritory,
  notifyAgentEmployerAssigned,
  notifyAgentEmployerUnassigned,
  notifyRegionEmployerRegistered,
} from "@/lib/notifications/trigger";

/**
 * Who hears about an employer arriving in a region, or changing agent. One
 * place for the rules so self-sign-up, staff-created employers, admin region
 * moves and agent assignment all say the same thing to the same people.
 */

export interface EmployerRegion {
  cityId: unknown;
  stateId: unknown;
  cityName: string;
  countryCode: string;
}

/**
 * Tell every super-agent and agent whose territory covers `region` that the
 * company is now in it. When no super-agent covers it, admins are told
 * instead (only for sign-ups and staff-created employers — an admin moving it
 * there already knows).
 */
export async function notifyEmployerRegion(input: {
  employerId: string;
  companyName: string;
  region: EmployerRegion | null;
  event: "registered" | "added" | "moved";
  /** Users already told by another message (the referral super-agent, the creator). */
  skipUserIds?: readonly string[];
}): Promise<void> {
  const { employerId, companyName, region, event } = input;
  const skip = new Set((input.skipUserIds ?? []).map(String));
  const tellAdmins = event !== "moved";
  if (!region) {
    if (tellAdmins) await notifyAdminsEmployerOutsideTerritory(companyName, employerId, null);
    return;
  }
  const coverage = await findRegionCoverage({ cityId: String(region.cityId), stateId: String(region.stateId) });
  await Promise.all([
    ...coverage.superAgents
      .filter((m) => !skip.has(m.userId))
      .map((m) => notifyRegionEmployerRegistered(m.userId, "super_agent", companyName, region.cityName, employerId, event)),
    ...coverage.agents
      .filter((m) => !skip.has(m.userId))
      .map((m) => notifyRegionEmployerRegistered(m.userId, "agent", companyName, region.cityName, employerId, event)),
  ]);
  if (tellAdmins && coverage.superAgents.length === 0) {
    await notifyAdminsEmployerOutsideTerritory(companyName, employerId, `${region.cityName}, ${region.countryCode}`);
  }
}

/**
 * After an employer changes agent: the new agent is told it is theirs, and
 * every agent it was taken from is told it has gone.
 */
export async function notifyEmployerAgentChange(input: {
  employerId: string;
  companyName: string;
  newAgentId: string | null;
  previousAgentIds: readonly string[];
  assignedBy: "admin" | "super_agent";
}): Promise<void> {
  const { employerId, companyName, newAgentId, assignedBy } = input;
  const previous = [...new Set(input.previousAgentIds.map(String))].filter((id) => id !== String(newAgentId ?? ""));
  const ids = [...previous, ...(newAgentId ? [String(newAgentId)] : [])];
  if (ids.length === 0) return;
  const agents = await Agent.find({ _id: { $in: ids } }).select("_id userId").lean<Array<{ _id: unknown; userId?: unknown }>>();
  const userOf = new Map(agents.map((a) => [String(a._id), a.userId ? String(a.userId) : null]));

  const sends: Promise<void>[] = [];
  const newUser = newAgentId ? userOf.get(String(newAgentId)) : null;
  // An agent who already had it (a clean-up of a doubly-linked employer) is not told it is new.
  const alreadyTheirs = input.previousAgentIds.map(String).includes(String(newAgentId ?? ""));
  if (newUser && !alreadyTheirs) sends.push(notifyAgentEmployerAssigned(newUser, companyName, employerId, assignedBy));
  for (const id of previous) {
    const user = userOf.get(id);
    if (user) sends.push(notifyAgentEmployerUnassigned(user, companyName, employerId));
  }
  await Promise.all(sends);
}
