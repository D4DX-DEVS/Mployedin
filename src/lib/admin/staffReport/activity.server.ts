import "server-only";
import mongoose from "mongoose";
import { Agent } from "@/models/Agent";
import { Job } from "@/models/Job";
import { Application } from "@/models/Application";
import { latest } from "./rules";

type Id = mongoose.Types.ObjectId;
const DAY = 86_400_000;
/** How far back "last activity" looks. Older work shows as no recent activity. */
export const ACTIVITY_LOOKBACK_DAYS = 365;

export interface AgentRef {
  _id: unknown;
  userId: unknown;
}

/**
 * Each agent's last real work: a job they posted, a candidate status they
 * changed, or an action in their activity log. Keyed by the agent's USER id.
 * Three grouped reads for any number of agents.
 */
export async function lastActivityByAgent(agents: AgentRef[], now: Date = new Date()): Promise<Map<string, Date | null>> {
  const out = new Map<string, Date | null>();
  if (agents.length === 0) return out;
  const since = new Date(now.getTime() - ACTIVITY_LOOKBACK_DAYS * DAY);
  const agentIds = agents.map((a) => a._id as Id);
  const userIds = agents.map((a) => a.userId as Id);

  const [jobs, moves, logs] = await Promise.all([
    Job.aggregate<{ _id: Id; at: Date }>([
      { $match: { agentId: { $in: agentIds }, createdAt: { $gte: since } } },
      { $group: { _id: "$agentId", at: { $max: "$createdAt" } } },
    ]),
    Application.aggregate<{ _id: Id; at: Date }>([
      { $match: { "statusHistory.changedBy": { $in: userIds }, "statusHistory.changedAt": { $gte: since } } },
      { $unwind: "$statusHistory" },
      { $match: { "statusHistory.changedBy": { $in: userIds }, "statusHistory.changedAt": { $gte: since } } },
      { $group: { _id: "$statusHistory.changedBy", at: { $max: "$statusHistory.changedAt" } } },
    ]),
    Agent.aggregate<{ _id: Id; at: Date | null }>([
      { $match: { _id: { $in: agentIds } } },
      { $project: { at: { $max: "$activityLog.timestamp" } } },
    ]),
  ]);

  const jobAt = new Map(jobs.map((r) => [String(r._id), r.at]));
  const moveAt = new Map(moves.map((r) => [String(r._id), r.at]));
  const logAt = new Map(logs.map((r) => [String(r._id), r.at]));
  for (const a of agents) {
    const at = latest(jobAt.get(String(a._id)), moveAt.get(String(a.userId)), logAt.get(String(a._id)));
    out.set(String(a.userId), at && at >= since ? at : null);
  }
  return out;
}

/** Candidate status changes each user made in a date window. Keyed by user id. */
export async function candidatesMovedBy(userIds: Id[], match: Record<string, Date>): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  const rows = await Application.aggregate<{ _id: Id; n: number }>([
    { $match: { "statusHistory.changedBy": { $in: userIds }, "statusHistory.changedAt": match } },
    { $unwind: "$statusHistory" },
    { $match: { "statusHistory.changedBy": { $in: userIds }, "statusHistory.changedAt": match } },
    { $group: { _id: "$statusHistory.changedBy", n: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.n]));
}
