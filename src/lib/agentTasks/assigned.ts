import mongoose from "mongoose";
import AgentTask, { type AgentTaskAssigneeRole } from "@/models/AgentTask";
import User from "@/models/User";
import { getSuperAgentTeamAgentUserIds } from "@/lib/auth/agentRestrictions";
import { pushHistory, readTaskHistory } from "./history";
import { TaskError } from "./taskError";
import { validateTaskLinks, type TaskLinkInput } from "./links";
import { assigneeHome, nameOf, notifyQuietly, reviewerHome } from "./taskNotify";

/**
 * Tasks a super agent or an admin gives someone, and their review.
 *
 * Who may receive one:
 *  - admin → any active agent (directly, or "through" a super agent whose team
 *    they are on: `managedBy`), or any active super agent (`assigneeRole`)
 *  - super agent → agents on their team only
 * One task can go to many people: each gets their own copy, tied by `groupId`.
 *
 * States of a given task:
 *   pending / in_progress            reviewStatus none | returned (working)
 *   completed|failed + awaiting_review  reported, waiting for the giver
 *   completed|failed + approved         the giver accepted the report
 *   in_progress + returned              sent back with a comment
 *   completed + none                    review switched off: closed on done
 *   cancelled                           withdrawn by the giver
 * A reported failure always waits for the giver, even with review off.
 *
 * Who may act on a given task (approve, send back, withdraw, reassign, edit):
 * admin always; a super agent if they gave it, or if it was routed through
 * them (`managedBy`) AND the agent is still on their team. A super agent sees
 * (view only) admin's direct tasks to their current team.
 *
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

type Id = mongoose.Types.ObjectId;
const oid = (id: string): Id => new mongoose.Types.ObjectId(id);

/** True when the task came from a super agent or an admin. */
export function isAssignedTask(task: { assignedBy?: { userId?: unknown } | null } | null | undefined): boolean {
  return Boolean(task?.assignedBy?.userId);
}

/** Who a task's `userId` is; rows from before the field = agent. */
export function assigneeRoleOf(task: { assigneeRole?: string | null }): AgentTaskAssigneeRole {
  return task.assigneeRole === "super_agent" || task.assigneeRole === "admin" ? task.assigneeRole : "agent";
}

/**
 * The agent USER ids this caller may assign to. Admin: every agent ("all").
 * Super agent: their team (getSuperAgentScope). Anyone else, or a super agent
 * with no profile: nobody — never everybody.
 */
export async function assigneeScope(ctx: AssignerCtx): Promise<"all" | Id[]> {
  if (ctx.role === "admin") return "all";
  if (ctx.role !== "super_agent") return [];
  return getSuperAgentTeamAgentUserIds(ctx.userId);
}

export function inScope(scope: "all" | Id[], userId: string): boolean {
  return scope === "all" || scope.some((id) => String(id) === userId);
}

/**
 * Which given tasks this caller can see in "Tasks I gave". Admin: all of them.
 * Super agent: the ones they gave (wherever the agent is now), plus any given
 * to an agent currently on their team. Anyone else: none (null).
 */
export async function visibleGivenFilter(ctx: AssignerCtx): Promise<{ filter: Record<string, unknown>; team: Id[] } | null> {
  const base = { "assignedBy.userId": { $exists: true } };
  if (ctx.role === "admin") return { filter: base, team: [] };
  if (ctx.role !== "super_agent") return null;
  const team = await getSuperAgentTeamAgentUserIds(ctx.userId);
  return {
    filter: { ...base, $or: [{ "assignedBy.userId": oid(ctx.userId) }, ...(team.length ? [{ userId: { $in: team } }] : [])] },
    team,
  };
}

/** May this caller act on (review, withdraw, reassign, edit) this given task? */
export function canActOnTask(
  ctx: AssignerCtx,
  task: { userId?: unknown; assignedBy?: { userId?: unknown } | null; managedBy?: unknown },
  team: readonly Id[],
): boolean {
  if (ctx.role === "admin") return true;
  if (ctx.role !== "super_agent") return false;
  if (String(task.assignedBy?.userId ?? "") === ctx.userId) return true;
  // Routed through them: only while the agent is still on their team.
  return String(task.managedBy ?? "") === ctx.userId && team.some((id) => String(id) === String(task.userId));
}

/** Loads a given task the caller may act on, or throws 404 / 403. */
export async function loadActionableTask(ctx: AssignerCtx, taskId: string) {
  if (!mongoose.isValidObjectId(taskId)) throw new TaskError(400, "Invalid task ID");
  const visible = await visibleGivenFilter(ctx);
  if (!visible) throw new TaskError(403, "Forbidden");
  const task = await AgentTask.findById(taskId).lean();
  if (!task || !isAssignedTask(task)) throw new TaskError(404, "Task not found");
  if (!canActOnTask(ctx, task, visible.team)) {
    const seen = ctx.role === "admin" || String(task.assignedBy?.userId) === ctx.userId
      || visible.team.some((id) => String(id) === String(task.userId));
    if (!seen) throw new TaskError(404, "Task not found");
    throw new TaskError(403, "Only the person who gave this task or an admin can change it");
  }
  return { task, team: visible.team };
}

/**
 * The agents the caller can pick in "Give a task", by name. An admin assigning
 * through a super agent (`viaSuperAgent`) picks from that super agent's team.
 */
export async function listAssignableAgents(ctx: AssignerCtx, viaSuperAgent?: string): Promise<AssignableAgent[]> {
  const scope = ctx.role === "admin" && viaSuperAgent
    ? (mongoose.isValidObjectId(viaSuperAgent) ? await getSuperAgentTeamAgentUserIds(viaSuperAgent) : [])
    : await assigneeScope(ctx);
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

/** Admin only: the super agents a task can be given to (or through), by name. */
export async function listAssignableSuperAgents(ctx: AssignerCtx): Promise<AssignableAgent[]> {
  if (ctx.role !== "admin") return [];
  const users = await User.find({ role: "super_agent", isActive: { $ne: false } })
    .select("_id name email")
    .sort({ name: 1 })
    .limit(500)
    .lean<Array<{ _id: unknown; name?: string; email?: string }>>();
  return users.map((u) => ({ userId: String(u._id), name: u.name ?? "", email: u.email ?? "" }));
}

// Its own module so links.ts can throw it without importing this file back.
export { TaskError };

export interface AssignInput {
  /** Legacy single-agent form; `assigneeUserIds` wins when both are sent. */
  agentUserId?: string;
  assigneeUserIds?: string[];
  assigneeRole?: "agent" | "super_agent";
  title: string;
  description?: string;
  priority: "high" | "medium" | "low";
  dueDate?: Date;
  superAgentUserId?: string;
  reviewRequired?: boolean;
  candidateId?: string;
  jobId?: string;
  employerId?: string;
}

/**
 * Records on a given task are checked as the person who gets it: the task
 * links straight to them, so each must be one they can open (client
 * 2026-10-30: super agent and admin tasks could not point at a record).
 */
export function assigneeLinkCtx(userId: string, role: AgentTaskAssigneeRole = "agent"): AssignerCtx {
  return { userId, role };
}

/** Checks who the task may go to; returns their names. Throws before anything is created. */
async function checkAssignees(ctx: AssignerCtx, role: "agent" | "super_agent", ids: string[], via?: string) {
  if (ids.length === 0) throw new TaskError(400, "Choose who the task is for");
  if (ids.some((id) => !mongoose.isValidObjectId(id))) throw new TaskError(400, "Choose someone from the list");
  if (role === "super_agent") {
    if (ctx.role !== "admin") throw new TaskError(403, "Only an admin can give tasks to super agents");
    if (via) throw new TaskError(400, "A task for a super agent can't go through another super agent");
  } else {
    const scope = await assigneeScope(ctx);
    if (ids.some((id) => !inScope(scope, id))) throw new TaskError(403, "That agent isn't in your team");
    if (via) {
      if (!mongoose.isValidObjectId(via)) throw new TaskError(400, "Choose a super agent");
      const sa = await User.findOne({ _id: via, role: "super_agent" }).select("_id").lean();
      if (!sa) throw new TaskError(404, "Super agent not found");
      const team = await getSuperAgentTeamAgentUserIds(via);
      if (ids.some((id) => !team.some((t) => String(t) === id))) {
        throw new TaskError(400, "That agent isn't in this super agent's team");
      }
    }
  }
  const users = await Promise.all(
    ids.map((id) => User.findOne({ _id: id, role, isActive: { $ne: false } }).select("_id name").lean<{ name?: string } | null>()),
  );
  if (users.some((u) => !u)) throw new TaskError(404, role === "super_agent" ? "Super agent not found" : "Agent not found");
  return users.map((u) => u?.name ?? "");
}

/**
 * Gives one task to one or many people: one copy each, tied by `groupId` when
 * there are several. Nothing is created unless every person is allowed.
 */
export async function assignTasks(ctx: AssignerCtx, input: AssignInput) {
  if (ctx.role !== "admin" && ctx.role !== "super_agent") throw new TaskError(403, "Forbidden");
  const role = input.assigneeRole ?? "agent";
  const ids = [...new Set((input.assigneeUserIds?.length ? input.assigneeUserIds : input.agentUserId ? [input.agentUserId] : []).map(String))];
  if (ids.length > 100) throw new TaskError(400, "Pick 100 people or fewer");
  // Admin giving it through a super agent; ignored for anyone else.
  const via = ctx.role === "admin" && input.superAgentUserId ? input.superAgentUserId : undefined;
  const names = await checkAssignees(ctx, role, ids, via);

  // Records are checked as each person; a link only makes sense for one.
  const linkInput: TaskLinkInput = { candidateId: input.candidateId, jobId: input.jobId, employerId: input.employerId };
  const wantsLinks = Boolean(linkInput.candidateId || linkInput.jobId || linkInput.employerId);
  if (wantsLinks && ids.length > 1) throw new TaskError(400, "Link records only when the task goes to one person");
  const links = wantsLinks ? await validateTaskLinks(assigneeLinkCtx(ids[0], role), linkInput, { forAssignee: true }) : undefined;

  const groupId = ids.length > 1 ? new mongoose.Types.ObjectId() : undefined;
  const now = new Date();
  const tasks = await Promise.all(ids.map((id) => AgentTask.create({
    userId: oid(id),
    assigneeRole: role,
    title: input.title,
    description: input.description,
    priority: input.priority,
    dueDate: input.dueDate,
    category: "other",
    assignedBy: { userId: oid(ctx.userId), role: ctx.role as AssignerRole, assignedAt: now },
    ...(via ? { managedBy: oid(via) } : {}),
    ...(links ? { links } : {}),
    ...(groupId ? { groupId } : {}),
    reviewRequired: input.reviewRequired !== false,
    reviewStatus: "none",
    history: [{ action: "assigned", to: "pending", by: oid(ctx.userId), at: now }],
  })));

  const assignerName = await nameOf(ctx.userId);
  await Promise.all(tasks.map((task, i) => notifyQuietly({
    userId: ids[i],
    actorId: ctx.userId,
    title: "New task assigned",
    message: `${assignerName || "Your manager"} assigned you: ${task.title}`,
    link: assigneeHome(role),
    titleKey: "taskAssignedTitle",
    bodyKey: "taskAssignedBody",
    params: { name: assignerName, title: task.title },
    metadata: { taskId: String(task._id) },
  })));
  if (via) {
    await notifyQuietly({
      userId: via,
      actorId: ctx.userId,
      title: "Task for your team",
      message: `${assignerName || "An admin"} assigned ${names.length === 1 ? names[0] || "one of your agents" : `${names.length} of your agents`}: ${input.title}`,
      link: "/super-agent/tasks?tab=gave",
      titleKey: "taskViaSuperAgentTitle",
      bodyKey: "taskViaSuperAgentBody",
      params: { name: assignerName, agent: names.length === 1 ? names[0] : String(names.length), title: input.title },
      metadata: { taskId: String(tasks[0]._id) },
    });
  }
  return tasks;
}

/** One person, one task (the market-gap flow and older callers). */
export async function assignTask(ctx: AssignerCtx, input: AssignInput) {
  const [task] = await assignTasks(ctx, input);
  return task;
}

/**
 * The assignee reports a given task Completed or Failed (note optional). With
 * review on, both go to the giver; with review off, Completed closes it and
 * Failed still waits for the giver to decide.
 */
export async function submitAssignedTask(
  assigneeUserId: string,
  taskId: string,
  outcome: "completed" | "failed",
  completionNote?: string,
) {
  const task = await AgentTask.findOne({ _id: taskId, userId: assigneeUserId }).lean();
  if (!task) throw new TaskError(404, "Task not found");
  if (!isAssignedTask(task)) throw new TaskError(400, "Only assigned tasks go to review");
  if (task.status === "cancelled") throw new TaskError(409, "This task was withdrawn");
  if (task.reviewStatus === "awaiting_review" || task.reviewStatus === "approved") {
    throw new TaskError(409, "This task is already submitted");
  }
  const closesDirectly = task.reviewRequired === false && outcome === "completed";
  const updated = await AgentTask.findOneAndUpdate(
    { _id: taskId, userId: assigneeUserId, status: { $ne: "cancelled" }, reviewStatus: { $nin: ["awaiting_review", "approved"] } },
    {
      $set: { status: outcome, reviewStatus: closesDirectly ? "none" : "awaiting_review", completionNote },
      ...pushHistory({ action: closesDirectly ? "status" : "submitted", by: assigneeUserId, from: task.status, to: outcome, note: completionNote }),
    },
    { returnDocument: "after" },
  ).lean();
  if (!updated) throw new TaskError(409, "This task is already submitted");

  const assignerId = String(task.assignedBy!.userId);
  const doerName = await nameOf(assigneeUserId);
  const message = outcome === "failed"
    ? `${doerName || "Someone"} couldn't complete: ${task.title}`
    : `${doerName || "Someone"} finished: ${task.title}`;
  const home = await reviewerHome(assignerId, task.assignedBy!.role as AssignerRole);
  await notifyQuietly({
    userId: assignerId,
    actorId: assigneeUserId,
    title: closesDirectly ? "Task done" : "Task ready for review",
    message,
    link: closesDirectly ? home : `${home}&review=awaiting_review`,
    titleKey: closesDirectly ? "taskDoneTitle" : "taskSubmittedTitle",
    bodyKey: closesDirectly ? "taskDoneBody" : "taskSubmittedBody",
    params: { name: doerName, title: task.title },
    metadata: { taskId },
  });
  // Given through a super agent: they review it too, so they hear about it.
  if (task.managedBy && String(task.managedBy) !== assignerId && !closesDirectly) {
    await notifyQuietly({
      userId: String(task.managedBy),
      actorId: assigneeUserId,
      title: "Task ready for review",
      message,
      link: "/super-agent/tasks?tab=gave&review=awaiting_review",
      titleKey: "taskSubmittedTitle",
      bodyKey: "taskSubmittedBody",
      params: { name: doerName, title: task.title },
      metadata: { taskId },
    });
  }
  return updated;
}

/** A given task's activity, for whoever may see it in "Tasks I gave". */
export async function assignedTaskHistory(ctx: AssignerCtx, taskId: string) {
  if (!mongoose.isValidObjectId(taskId)) throw new TaskError(400, "Invalid task ID");
  const visible = await visibleGivenFilter(ctx);
  if (!visible) throw new TaskError(404, "Task not found");
  const task = await AgentTask.findById(taskId).select("userId createdAt assignedBy managedBy history").lean();
  if (!task || !isAssignedTask(task)) throw new TaskError(404, "Task not found");
  const sees = ctx.role === "admin"
    || String(task.assignedBy?.userId) === ctx.userId
    || visible.team.some((id) => String(id) === String(task.userId));
  if (!sees) throw new TaskError(404, "Task not found");
  return readTaskHistory(task);
}

export async function reviewTask(
  ctx: AssignerCtx,
  taskId: string,
  action: "approve" | "return",
  comment?: string,
) {
  const { task } = await loadActionableTask(ctx, taskId).catch((err: unknown) => {
    if (err instanceof TaskError && err.status === 403) {
      throw new TaskError(403, "Only the person who assigned this task or an admin can review it");
    }
    throw err;
  });
  if (task.reviewStatus !== "awaiting_review") throw new TaskError(409, "This task isn't waiting for review");
  if (action === "return" && !comment?.trim()) throw new TaskError(400, "Say what needs to change");

  const updated = await AgentTask.findOneAndUpdate(
    { _id: taskId, reviewStatus: "awaiting_review" },
    {
      $set: {
        reviewStatus: action === "approve" ? "approved" : "returned",
        // Approving accepts what was reported (completed or failed);
        // sending back puts them straight back to work on it.
        status: action === "approve" ? task.status : "in_progress",
        reviewedBy: oid(ctx.userId),
        reviewedAt: new Date(),
        reviewComment: comment?.trim() || undefined,
      },
      ...pushHistory({
        action: action === "approve" ? "approved" : "returned",
        by: ctx.userId,
        from: task.status,
        to: action === "approve" ? task.status : "in_progress",
        note: comment,
      }),
    },
    { returnDocument: "after" },
  ).lean();
  if (!updated) throw new TaskError(409, "This task isn't waiting for review");

  const reviewerName = await nameOf(ctx.userId);
  await notifyQuietly({
    userId: String(task.userId),
    actorId: ctx.userId,
    title: action === "approve" ? "Task approved" : "Task sent back",
    message: action === "approve"
      ? `${reviewerName || "Your reviewer"} approved: ${task.title}`
      : `${reviewerName || "Your reviewer"} sent back: ${task.title} — ${comment}`,
    link: assigneeHome(assigneeRoleOf(task)),
    titleKey: action === "approve" ? "taskApprovedTitle" : "taskReturnedTitle",
    bodyKey: action === "approve" ? "taskApprovedBody" : "taskReturnedBody",
    params: { name: reviewerName, title: task.title, comment: comment ?? "" },
    metadata: { taskId },
  });
  return updated;
}

