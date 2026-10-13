import mongoose from "mongoose";
import AgentTask, { type AgentTaskReviewStatus } from "@/models/AgentTask";
import SuperAgent from "@/models/SuperAgent";
import User from "@/models/User";
import { getSuperAgentTeamAgentUserIds } from "@/lib/auth/agentRestrictions";
import { notify } from "@/lib/notifications/trigger";
import { escapeRegex } from "@/lib/security/sanitize";

/**
 * Tasks a super agent or an admin gives an agent, and their review.
 *
 * An AgentTask's `userId` is the agent's USER id; super-agent scope is held as
 * Agent PROFILE ids. Everything here converts once, in `assigneeScope`, so the
 * routes never compare the two id spaces.
 *
 * States of an assigned task:
 *   pending / in_progress            reviewStatus none | returned (agent working)
 *   completed + awaiting_review      agent submitted it with a note
 *   completed + approved             reviewer accepted it
 *   pending   + returned             reviewer sent it back with a comment
 * Personal to-dos never carry `assignedBy` and never enter review.
 */

export type AssignerRole = "super_agent" | "admin";

export interface AssignerCtx {
  userId: string;
  role: string;
}

export interface AssignableAgent {
  userId: string;
  name: string;
  email: string;
}

/** True when the task came from a super agent or an admin. */
export function isAssignedTask(task: { assignedBy?: { userId?: unknown } | null } | null | undefined): boolean {
  return Boolean(task?.assignedBy?.userId);
}

/**
 * The agent USER ids this caller may assign to and review. Admin: every agent
 * ("all"). Super agent: their team (getSuperAgentScope). Anyone else, or a
 * super agent with no profile: nobody — never everybody.
 */
export async function assigneeScope(ctx: AssignerCtx): Promise<"all" | mongoose.Types.ObjectId[]> {
  if (ctx.role === "admin") return "all";
  if (ctx.role !== "super_agent") return [];
  return getSuperAgentTeamAgentUserIds(ctx.userId);
}

function inScope(scope: "all" | mongoose.Types.ObjectId[], agentUserId: string): boolean {
  return scope === "all" || scope.some((id) => String(id) === agentUserId);
}

/** The agents the caller can pick in "Assign task", by name. */
export async function listAssignableAgents(ctx: AssignerCtx): Promise<AssignableAgent[]> {
  const scope = await assigneeScope(ctx);
  if (scope !== "all" && scope.length === 0) return [];
  const users = await User.find({
    role: "agent",
    isActive: { $ne: false },
    ...(scope === "all" ? {} : { _id: { $in: scope } }),
  })
    .select("_id name email")
    .sort({ name: 1 })
    .limit(1000)
    .lean<Array<{ _id: unknown; name?: string; email?: string }>>();
  return users.map((u) => ({ userId: String(u._id), name: u.name ?? "", email: u.email ?? "" }));
}

export interface AssignedListParams {
  status?: string;
  reviewStatus?: string;
  agentUserId?: string;
  search?: string;
  page: number;
  limit: number;
}

export async function listAssignedTasks(ctx: AssignerCtx, p: AssignedListParams) {
  const scope = await assigneeScope(ctx);
  const empty = { total: 0, page: p.page, totalPages: 1, items: [], stats: { open: 0, awaitingReview: 0, returned: 0, approved: 0 } };
  if (scope !== "all" && scope.length === 0) return empty;

  const base: Record<string, unknown> = { "assignedBy.userId": { $exists: true } };
  if (scope !== "all") base.userId = { $in: scope };

  const filter: Record<string, unknown> = { ...base };
  // An agent filter narrows inside the scope; it can never widen it.
  if (p.agentUserId) {
    if (!mongoose.isValidObjectId(p.agentUserId) || !inScope(scope, p.agentUserId)) return empty;
    filter.userId = new mongoose.Types.ObjectId(p.agentUserId);
  }
  if (p.status === "open") filter.status = { $ne: "completed" };
  else if (p.status === "pending" || p.status === "in_progress" || p.status === "completed") filter.status = p.status;
  if (p.reviewStatus === "awaiting_review" || p.reviewStatus === "approved" || p.reviewStatus === "returned") {
    filter.reviewStatus = p.reviewStatus;
  }
  if (p.search) filter.title = { $regex: escapeRegex(p.search), $options: "i" };

  const [rows, total, open, reviewRows] = await Promise.all([
    AgentTask.find(filter)
      .sort({ createdAt: -1 })
      .skip((p.page - 1) * p.limit)
      .limit(p.limit)
      .lean(),
    AgentTask.countDocuments(filter),
    AgentTask.countDocuments({ ...base, status: { $ne: "completed" } }),
    AgentTask.aggregate<{ _id: AgentTaskReviewStatus; count: number }>([
      { $match: base },
      { $group: { _id: "$reviewStatus", count: { $sum: 1 } } },
    ]),
  ]);
  const byReview = Object.fromEntries(reviewRows.map((r) => [r._id, r.count]));

  const userIds = [...new Set(rows.flatMap((t) => [String(t.userId), String(t.assignedBy?.userId ?? ""), String(t.reviewedBy ?? "")]).filter(Boolean))];
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } }).select("_id name").lean<Array<{ _id: unknown; name?: string }>>()
    : [];
  const names = new Map(users.map((u) => [String(u._id), u.name ?? ""]));

  return {
    total,
    page: p.page,
    totalPages: Math.max(Math.ceil(total / p.limit), 1),
    stats: {
      open,
      awaitingReview: byReview.awaiting_review ?? 0,
      returned: byReview.returned ?? 0,
      approved: byReview.approved ?? 0,
    },
    items: rows.map((t) => ({
      _id: String(t._id),
      title: t.title,
      description: t.description,
      priority: t.priority,
      status: t.status,
      reviewStatus: t.reviewStatus ?? "none",
      dueDate: t.dueDate,
      completionNote: t.completionNote,
      reviewComment: t.reviewComment,
      reviewedAt: t.reviewedAt,
      createdAt: t.createdAt,
      agentUserId: String(t.userId),
      agentName: names.get(String(t.userId)) ?? "",
      assignedByName: names.get(String(t.assignedBy?.userId)) ?? "",
      assignedByRole: t.assignedBy?.role,
      // Only the assigner's own super agent or an admin may review; the UI
      // shows Approve / Send back only when this is true.
      canReview: t.reviewStatus === "awaiting_review" && canReviewTask(ctx, t.assignedBy),
    })),
  };
}

function canReviewTask(ctx: AssignerCtx, assignedBy?: { userId?: unknown; role?: string } | null): boolean {
  if (ctx.role === "admin") return true;
  return ctx.role === "super_agent" && String(assignedBy?.userId ?? "") === ctx.userId;
}

export class TaskError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function nameOf(userId: string): Promise<string> {
  const u = await User.findById(userId).select("name").lean<{ name?: string }>();
  return u?.name ?? "";
}

/** Where a notification about this task should take each side. */
async function reviewerHome(assignerUserId: string, role: AssignerRole | undefined): Promise<string> {
  if (role === "admin") return "/admin/agent-tasks";
  const sa = await SuperAgent.exists({ userId: assignerUserId });
  return sa ? "/super-agent/tasks" : "/admin/agent-tasks";
}

export interface AssignInput {
  agentUserId: string;
  title: string;
  description?: string;
  priority: "high" | "medium" | "low";
  dueDate?: Date;
}

export async function assignTask(ctx: AssignerCtx, input: AssignInput) {
  if (ctx.role !== "admin" && ctx.role !== "super_agent") throw new TaskError(403, "Forbidden");
  if (!mongoose.isValidObjectId(input.agentUserId)) throw new TaskError(400, "Choose an agent");
  const scope = await assigneeScope(ctx);
  if (!inScope(scope, input.agentUserId)) throw new TaskError(403, "That agent isn't in your team");
  const agentUser = await User.findOne({ _id: input.agentUserId, role: "agent" }).select("_id").lean();
  if (!agentUser) throw new TaskError(404, "Agent not found");

  const task = await AgentTask.create({
    userId: new mongoose.Types.ObjectId(input.agentUserId),
    title: input.title,
    description: input.description,
    priority: input.priority,
    dueDate: input.dueDate,
    category: "other",
    assignedBy: {
      userId: new mongoose.Types.ObjectId(ctx.userId),
      role: ctx.role as AssignerRole,
      assignedAt: new Date(),
    },
    reviewStatus: "none",
  });

  const assignerName = await nameOf(ctx.userId);
  await notify({
    userId: input.agentUserId,
    actorId: ctx.userId,
    type: "system",
    title: "New task assigned",
    message: `${assignerName || "Your manager"} assigned you: ${task.title}`,
    link: "/agent/tasks?kind=assigned",
    titleKey: "taskAssignedTitle",
    bodyKey: "taskAssignedBody",
    params: { name: assignerName, title: task.title },
    metadata: { taskId: String(task._id) },
  }).catch(() => {});

  return task;
}

/** Agent submits an assigned task as done, with a note: it goes to review. */
export async function submitAssignedTask(agentUserId: string, taskId: string, completionNote: string) {
  const task = await AgentTask.findOne({ _id: taskId, userId: agentUserId }).lean();
  if (!task) throw new TaskError(404, "Task not found");
  if (!isAssignedTask(task)) throw new TaskError(400, "Only assigned tasks go to review");
  if (task.reviewStatus === "awaiting_review" || task.reviewStatus === "approved") {
    throw new TaskError(409, "This task is already submitted");
  }
  const updated = await AgentTask.findOneAndUpdate(
    { _id: taskId, userId: agentUserId, reviewStatus: { $nin: ["awaiting_review", "approved"] } },
    { $set: { status: "completed", reviewStatus: "awaiting_review", completionNote } },
    { returnDocument: "after" },
  ).lean();
  if (!updated) throw new TaskError(409, "This task is already submitted");

  const assignerId = String(task.assignedBy!.userId);
  const agentName = await nameOf(agentUserId);
  await notify({
    userId: assignerId,
    actorId: agentUserId,
    type: "system",
    title: "Task ready for review",
    message: `${agentName || "An agent"} finished: ${task.title}`,
    link: `${await reviewerHome(assignerId, task.assignedBy!.role as AssignerRole)}?review=awaiting_review`,
    titleKey: "taskSubmittedTitle",
    bodyKey: "taskSubmittedBody",
    params: { name: agentName, title: task.title },
    metadata: { taskId },
  }).catch(() => {});
  return updated;
}

export async function reviewTask(
  ctx: AssignerCtx,
  taskId: string,
  action: "approve" | "return",
  comment?: string,
) {
  if (!mongoose.isValidObjectId(taskId)) throw new TaskError(400, "Invalid task ID");
  const task = await AgentTask.findById(taskId).lean();
  if (!task || !isAssignedTask(task)) throw new TaskError(404, "Task not found");
  const scope = await assigneeScope(ctx);
  if (!inScope(scope, String(task.userId)) || !canReviewTask(ctx, task.assignedBy)) {
    throw new TaskError(403, "Only the person who assigned this task or an admin can review it");
  }
  if (task.reviewStatus !== "awaiting_review") throw new TaskError(409, "This task isn't waiting for review");
  if (action === "return" && !comment?.trim()) throw new TaskError(400, "Say what needs to change");

  const updated = await AgentTask.findOneAndUpdate(
    { _id: taskId, reviewStatus: "awaiting_review" },
    {
      $set: {
        reviewStatus: action === "approve" ? "approved" : "returned",
        status: action === "approve" ? "completed" : "pending",
        reviewedBy: new mongoose.Types.ObjectId(ctx.userId),
        reviewedAt: new Date(),
        reviewComment: comment?.trim() || undefined,
      },
    },
    { returnDocument: "after" },
  ).lean();
  if (!updated) throw new TaskError(409, "This task isn't waiting for review");

  const reviewerName = await nameOf(ctx.userId);
  await notify({
    userId: String(task.userId),
    actorId: ctx.userId,
    type: "system",
    title: action === "approve" ? "Task approved" : "Task sent back",
    message: action === "approve"
      ? `${reviewerName || "Your reviewer"} approved: ${task.title}`
      : `${reviewerName || "Your reviewer"} sent back: ${task.title} — ${comment}`,
    link: "/agent/tasks?kind=assigned",
    titleKey: action === "approve" ? "taskApprovedTitle" : "taskReturnedTitle",
    bodyKey: action === "approve" ? "taskApprovedBody" : "taskReturnedBody",
    params: { name: reviewerName, title: task.title, comment: comment ?? "" },
    metadata: { taskId },
  }).catch(() => {});
  return updated;
}
