import mongoose from "mongoose";
import Agent from "@/models/Agent";
import { Employer } from "@/models/Employer";
import Job from "@/models/Job";
import SuperAgent from "@/models/SuperAgent";
import User from "@/models/User";

/**
 * Which agent looks after an employer, and moving an employer between agents.
 *
 * The link is stored twice — `Employer.agentId` and `Agent.assignedEmployerIds`
 * — and different screens read different ends (see getSuperAgentBook). A move
 * therefore writes BOTH ends, so the agent dashboard, the super-agent book,
 * targets and invoicing all agree on who owns the employer afterwards.
 */

/** Jobs still being worked. Closed/expired jobs stay with the agent who ran them. */
export const OPEN_JOB_STATUSES = ["draft", "active", "paused"] as const;

export interface AssignableAgent {
  id: string;
  name: string;
  email: string;
  superAgentName: string | null;
}

export interface EmployerAgentSummary {
  id: string;
  name: string;
  superAgentName: string | null;
}

export type AssignEmployerAgentResult =
  | {
      ok: true;
      changed: boolean;
      previousAgentIds: string[];
      agentId: string | null;
      movedOpenJobs: number;
    }
  | { ok: false; status: 400 | 404; error: string };

const isObjectId = (value: unknown): value is string =>
  typeof value === "string" && mongoose.Types.ObjectId.isValid(value);

/** Map SuperAgent doc id → that super-agent's display name. */
async function superAgentNames(saIds: string[]): Promise<Map<string, string>> {
  if (saIds.length === 0) return new Map();
  const sas = await SuperAgent.find({ _id: { $in: saIds }, roleArchivedAt: null }).select("userId").lean();
  const users = await User.find({ _id: { $in: sas.map((s) => s.userId) } }).select("name").lean();
  const userName = new Map(users.map((u) => [String(u._id), (u.name as string) ?? ""]));
  return new Map(sas.map((s) => [String(s._id), userName.get(String(s.userId)) ?? ""]));
}

/**
 * Every agent an admin may hand an employer to: an active user holding a live
 * (non-archived) agent profile. Sorted by name for the picker.
 */
export async function listAssignableAgents(): Promise<AssignableAgent[]> {
  const agents = await Agent.find({ roleArchivedAt: null }).select("userId superAgentId").lean();
  const users = await User.find({ _id: { $in: agents.map((a) => a.userId) }, role: "agent", isActive: true })
    .select("name email")
    .lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));
  const saNames = await superAgentNames([...new Set(agents.map((a) => String(a.superAgentId ?? "")).filter(Boolean))]);

  return agents
    .filter((a) => userMap.has(String(a.userId)))
    .map((a) => {
      const user = userMap.get(String(a.userId))!;
      return {
        id: String(a._id),
        name: (user.name as string) || (user.email as string) || "",
        email: (user.email as string) ?? "",
        superAgentName: a.superAgentId ? saNames.get(String(a.superAgentId)) || null : null,
      };
    })
    .sort((x, y) => x.name.localeCompare(y.name));
}

/**
 * The agent looking after each employer. `Employer.agentId` wins; an employer
 * reachable only through some agent's `assignedEmployerIds` falls back to
 * that agent, so the admin never sees "No agent" for an employer an agent
 * is actually working.
 */
export async function resolveEmployerAgents(
  employers: readonly { _id: unknown; agentId?: unknown }[],
): Promise<Map<string, EmployerAgentSummary>> {
  const employerIds = employers.map((e) => String(e._id));
  const linkedAgents = employerIds.length
    ? await Agent.find({ assignedEmployerIds: { $in: employerIds }, roleArchivedAt: null })
        .select("_id assignedEmployerIds")
        .lean()
    : [];

  const agentOf = new Map<string, string>();
  for (const e of employers) {
    // agentId may arrive populated ({ _id, userId }) from older callers.
    const raw = e.agentId as { _id?: unknown } | string | undefined;
    const direct = raw && typeof raw === "object" ? raw._id : raw;
    if (direct) agentOf.set(String(e._id), String(direct));
  }
  for (const agent of linkedAgents) {
    for (const empId of (agent.assignedEmployerIds as unknown[]) ?? []) {
      const key = String(empId);
      if (employerIds.includes(key) && !agentOf.has(key)) agentOf.set(key, String(agent._id));
    }
  }

  const agentIds = [...new Set(agentOf.values())];
  if (agentIds.length === 0) return new Map();
  const agents = await Agent.find({ _id: { $in: agentIds } }).select("userId superAgentId").lean();
  const users = await User.find({ _id: { $in: agents.map((a) => a.userId) } }).select("name email").lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));
  const saNames = await superAgentNames([...new Set(agents.map((a) => String(a.superAgentId ?? "")).filter(Boolean))]);
  const summary = new Map(
    agents.map((a) => {
      const user = userMap.get(String(a.userId));
      return [
        String(a._id),
        {
          id: String(a._id),
          name: (user?.name as string) || (user?.email as string) || "",
          superAgentName: a.superAgentId ? saNames.get(String(a.superAgentId)) || null : null,
        },
      ] as const;
    }),
  );

  const out = new Map<string, EmployerAgentSummary>();
  for (const [empId, agentId] of agentOf) {
    const s = summary.get(agentId);
    if (s) out.set(empId, s);
  }
  return out;
}

/**
 * Employer ids that no agent looks after, from either end of the link.
 * Used by the admin "No agent" filter.
 */
export async function unassignedEmployerFilter(): Promise<Record<string, unknown>> {
  const linked = (await Agent.distinct("assignedEmployerIds", { roleArchivedAt: null })) as unknown[];
  return { $or: [{ agentId: null }, { agentId: { $exists: false } }], _id: { $nin: linked } };
}

/**
 * Put an employer under `agentId`, or under no agent when `agentId` is null.
 *
 * - Both ends of the link are rewritten: the employer leaves every other
 *   agent's `assignedEmployerIds`, and `Employer.agentId` points at the new one.
 * - Open jobs (draft/active/paused) move to the new agent, so future
 *   applications, placements and invoices land with whoever now runs the
 *   account. Closed jobs, placements, commissions and invoices are left alone:
 *   what the previous agent already earned stays theirs.
 */
export async function assignEmployerAgent(
  employerId: string,
  agentId: string | null,
): Promise<AssignEmployerAgentResult> {
  if (!isObjectId(employerId)) return { ok: false, status: 400, error: "Invalid employer id" };
  if (agentId !== null && !isObjectId(agentId)) return { ok: false, status: 400, error: "Invalid agent id" };

  const employer = await Employer.findById(employerId).select("_id agentId").lean<{ _id: unknown; agentId?: unknown } | null>();
  if (!employer) return { ok: false, status: 404, error: "Employer not found" };

  if (agentId) {
    const agent = await Agent.findById(agentId).select("userId roleArchivedAt").lean<{ userId: unknown; roleArchivedAt?: Date | null } | null>();
    if (!agent || agent.roleArchivedAt) return { ok: false, status: 404, error: "Agent not found" };
    const agentUser = await User.findById(agent.userId).select("isActive role").lean<{ isActive?: boolean; role?: string } | null>();
    if (!agentUser || agentUser.role !== "agent" || agentUser.isActive === false) {
      return { ok: false, status: 400, error: "That agent account is inactive" };
    }
  }

  const listedBy = await Agent.find({ assignedEmployerIds: employer._id }).select("_id").lean();
  const previousAgentIds = [
    ...new Set([
      ...(employer.agentId ? [String(employer.agentId)] : []),
      ...listedBy.map((a) => String(a._id)),
    ]),
  ];

  // Already exactly this state: one owner, on both ends (or none at all).
  const alreadyThere = agentId
    ? String(employer.agentId ?? "") === agentId && listedBy.length === 1 && String(listedBy[0]._id) === agentId
    : previousAgentIds.length === 0;
  if (alreadyThere) {
    return { ok: true, changed: false, previousAgentIds, agentId, movedOpenJobs: 0 };
  }

  await Agent.updateMany(
    { assignedEmployerIds: employer._id, ...(agentId ? { _id: { $ne: agentId } } : {}) },
    { $pull: { assignedEmployerIds: employer._id } },
  );
  if (agentId) {
    await Agent.updateOne({ _id: agentId }, { $addToSet: { assignedEmployerIds: employer._id } });
  }
  await Employer.updateOne(
    { _id: employer._id },
    agentId ? { $set: { agentId } } : { $unset: { agentId: "" } },
  );

  const jobs = await Job.updateMany(
    { employerId: employer._id, status: { $in: [...OPEN_JOB_STATUSES] }, deletedAt: null },
    agentId ? { $set: { agentId } } : { $unset: { agentId: "" } },
  );

  return {
    ok: true,
    changed: true,
    previousAgentIds,
    agentId,
    movedOpenJobs: jobs.modifiedCount ?? 0,
  };
}
