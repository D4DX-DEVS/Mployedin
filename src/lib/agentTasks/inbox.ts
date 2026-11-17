import mongoose from "mongoose";
import AgentTask, { CLOSED_TASK_STATUSES } from "@/models/AgentTask";
import { getSuperAgentTeamAgentUserIds } from "@/lib/auth/agentRestrictions";

/**
 * The Tasks nav badge for an admin or super agent: tasks given to them that
 * are still open (not yet reported), plus reports waiting for their review.
 * Their own private to-dos don't count: they set those themselves.
 */
export async function taskInboxCount(ctx: { userId: string; role: string }): Promise<number> {
  if (ctx.role !== "admin" && ctx.role !== "super_agent") return 0;
  const me = new mongoose.Types.ObjectId(ctx.userId);
  const team = ctx.role === "super_agent" ? await getSuperAgentTeamAgentUserIds(ctx.userId) : [];
  const reviewable = ctx.role === "admin"
    ? { "assignedBy.userId": me }
    : { $or: [{ "assignedBy.userId": me }, { managedBy: me, userId: { $in: team } }] };
  const [givenToMe, needsMe] = await Promise.all([
    AgentTask.countDocuments({
      userId: me,
      "assignedBy.userId": { $exists: true },
      status: { $nin: CLOSED_TASK_STATUSES },
      reviewStatus: { $ne: "awaiting_review" },
    }),
    AgentTask.countDocuments({ reviewStatus: "awaiting_review", ...reviewable }),
  ]);
  return givenToMe + needsMe;
}
