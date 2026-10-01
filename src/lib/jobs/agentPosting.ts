import type { Types } from "mongoose";
import connectDB from "@/lib/db/mongoose";
import Agent from "@/models/Agent";

const OBJECT_ID = /^[a-f0-9]{24}$/i;

/**
 * May this agent create job content for `employerId`? Only for an employer an
 * admin assigned to them — the rule POST /api/jobs and /api/jobs/auto-draft
 * already apply. Area visibility is not enough: a posting speaks for the
 * employer.
 *
 * Returns the agent's own `_id` (stamped on a job as `agentId`), or null.
 */
export async function agentPostingFor(agentUserId: string, employerId: unknown): Promise<Types.ObjectId | null> {
  const requested = employerId == null ? "" : String(employerId);
  if (!OBJECT_ID.test(requested)) return null;
  await connectDB();
  const agent = await Agent.findOne({ userId: agentUserId }).select("_id assignedEmployerIds").lean();
  if (!agent) return null;
  const assigned = ((agent.assignedEmployerIds as unknown[] | undefined) ?? []).map(String);
  return assigned.includes(requested) ? (agent._id as Types.ObjectId) : null;
}
