import mongoose from "mongoose";
import AgentTask, { CLOSED_TASK_STATUSES } from "@/models/AgentTask";
import User from "@/models/User";
import { getSuperAgentTeamAgentUserIds } from "@/lib/auth/agentRestrictions";
import type { TaskActionInput } from "@/lib/validators/agent-tasks";
import { assigneeRoleOf, assigneeScope, canActOnTask, inScope, loadActionableTask, type AssignerCtx } from "./assigned";
import { pushHistory } from "./history";
import { assigneeHome, nameOf, notifyQuietly } from "./taskNotify";
import { TaskError } from "./taskError";

/**
 * What a giver (or an admin) does to a task they gave, from "Tasks I gave":
 *  - withdraw: one copy or every open copy of the group → `cancelled`
 *  - reassign: the SAME task moves to someone else (history kept, back to To do)
 *  - set_due: change the due date of one copy or every open copy
 *  - set_review: the review switch — the giver may change it until the
 *    assignee starts; after that only an admin (and it is written to history)
 * Each copy is checked with canActOnTask: a super agent cannot touch an
 * admin's direct task, nor one routed through them once the agent has moved.
 */
export async function performTaskAction(ctx: AssignerCtx, taskId: string, input: TaskActionInput) {
  const { task, team } = await loadActionableTask(ctx, taskId);
  switch (input.action) {
    case "withdraw": return withdraw(ctx, task, team, input.scope, input.note);
    case "reassign": return reassign(ctx, task, input.toUserId, input.note);
    case "set_due": return setDue(ctx, task, team, input.scope, input.dueDate);
    case "set_review": return setReview(ctx, task, team, input.scope, input.reviewRequired);
  }
}

type Task = Awaited<ReturnType<typeof loadActionableTask>>["task"];
type Id = mongoose.Types.ObjectId;

/** The copies an action applies to: this one, or every copy of its group the caller may act on. */
async function targets(ctx: AssignerCtx, task: Task, team: Id[], scope: "one" | "group", openOnly: boolean) {
  const copies = scope === "group" && task.groupId
    ? await AgentTask.find({ groupId: task.groupId }).lean()
    : [task];
  return copies.filter((c) => canActOnTask(ctx, c, team) && (!openOnly || !CLOSED_TASK_STATUSES.includes(c.status)));
}

async function withdraw(ctx: AssignerCtx, task: Task, team: Id[], scope: "one" | "group", note?: string) {
  const copies = await targets(ctx, task, team, scope, true);
  if (copies.length === 0) throw new TaskError(409, "There is nothing open to withdraw");
  const giverName = await nameOf(ctx.userId);
  let changed = 0;
  for (const c of copies) {
    const res = await AgentTask.updateOne(
      { _id: c._id, status: { $nin: CLOSED_TASK_STATUSES } },
      { $set: { status: "cancelled", reviewStatus: "none" }, ...pushHistory({ action: "withdrawn", by: ctx.userId, from: c.status, to: "cancelled", note }) },
    );
    if (res.modifiedCount === 0) continue;
    changed++;
    await notifyQuietly({
      userId: String(c.userId),
      actorId: ctx.userId,
      title: "Task withdrawn",
      message: `${giverName || "Your manager"} withdrew: ${c.title}${note ? ` — ${note}` : ""}`,
      link: assigneeHome(assigneeRoleOf(c)),
      titleKey: "taskWithdrawnTitle",
      bodyKey: "taskWithdrawnBody",
      params: { name: giverName, title: c.title },
      metadata: { taskId: String(c._id) },
    });
  }
  return { changed };
}

async function reassign(ctx: AssignerCtx, task: Task, toUserId: string, note?: string) {
  if (CLOSED_TASK_STATUSES.includes(task.status)) throw new TaskError(409, "Only an open task can go to someone else");
  if (String(task.userId) === toUserId) throw new TaskError(400, "The task is already theirs");
  const role = assigneeRoleOf(task);
  if (role === "admin") throw new TaskError(400, "Personal tasks can't be given to someone else");
  const person = await User.findOne({ _id: toUserId, role, isActive: { $ne: false } }).select("_id name").lean<{ name?: string } | null>();
  if (!person) throw new TaskError(404, role === "super_agent" ? "Super agent not found" : "Agent not found");
  if (role === "super_agent" && ctx.role !== "admin") throw new TaskError(403, "Only an admin can give tasks to super agents");
  if (role === "agent") {
    if (!inScope(await assigneeScope(ctx), toUserId)) throw new TaskError(403, "That agent isn't in your team");
    // Routed through a super agent: the new agent must be on that team too.
    if (task.managedBy) {
      const viaTeam = await getSuperAgentTeamAgentUserIds(String(task.managedBy));
      if (!viaTeam.some((id) => String(id) === toUserId)) {
        throw new TaskError(400, "That agent isn't in the team this task goes through");
      }
    }
  }
  if (task.groupId && (await AgentTask.exists({ groupId: task.groupId, userId: toUserId, status: { $ne: "cancelled" } }))) {
    throw new TaskError(409, "They already have a copy of this task");
  }

  const fromUserId = String(task.userId);
  const updated = await AgentTask.findOneAndUpdate(
    { _id: task._id, userId: task.userId, status: { $nin: CLOSED_TASK_STATUSES } },
    {
      $set: { userId: new mongoose.Types.ObjectId(toUserId), status: "pending", reviewStatus: "none" },
      $unset: { completionNote: "", reviewComment: "", reviewedBy: "", reviewedAt: "", remindedAt: "" },
      $push: {
        history: {
          $each: [{
            action: "reassigned",
            from: task.status,
            to: "pending",
            note: note?.trim() || undefined,
            fromUser: task.userId,
            toUser: new mongoose.Types.ObjectId(toUserId),
            by: new mongoose.Types.ObjectId(ctx.userId),
            at: new Date(),
          }],
          $slice: -100,
        },
      },
    },
    { returnDocument: "after" },
  ).lean();
  if (!updated) throw new TaskError(409, "This task changed. Reload and try again.");

  const giverName = await nameOf(ctx.userId);
  await Promise.all([
    notifyQuietly({
      userId: toUserId,
      actorId: ctx.userId,
      title: "New task assigned",
      message: `${giverName || "Your manager"} assigned you: ${task.title}`,
      link: assigneeHome(role),
      titleKey: "taskAssignedTitle",
      bodyKey: "taskAssignedBody",
      params: { name: giverName, title: task.title },
      metadata: { taskId: String(task._id) },
    }),
    notifyQuietly({
      userId: fromUserId,
      actorId: ctx.userId,
      title: "Task given to someone else",
      message: `${giverName || "Your manager"} gave “${task.title}” to ${person.name || "someone else"}`,
      link: assigneeHome(role),
      titleKey: "taskReassignedTitle",
      bodyKey: "taskReassignedBody",
      params: { name: giverName, title: task.title, to: person.name ?? "" },
      metadata: { taskId: String(task._id) },
    }),
  ]);
  return { task: updated };
}

async function setDue(ctx: AssignerCtx, task: Task, team: Id[], scope: "one" | "group", dueDate: Date | null) {
  const copies = await targets(ctx, task, team, scope, true);
  if (copies.length === 0) throw new TaskError(409, "There is nothing open to change");
  const when = dueDate ? dueDate.toISOString().slice(0, 10) : "none";
  let changed = 0;
  for (const c of copies) {
    const res = await AgentTask.updateOne(
      { _id: c._id, status: { $nin: CLOSED_TASK_STATUSES } },
      {
        $set: { dueDate },
        // A new date earns new reminders.
        $unset: { remindedAt: "" },
        ...pushHistory({ action: "due_changed", by: ctx.userId, note: `Due ${when}` }),
      },
    );
    changed += res.modifiedCount;
  }
  return { changed };
}

async function setReview(ctx: AssignerCtx, task: Task, team: Id[], scope: "one" | "group", reviewRequired: boolean) {
  const copies = await targets(ctx, task, team, scope, true);
  if (copies.length === 0) throw new TaskError(409, "There is nothing open to change");
  // Locked once the assignee has started; an admin may still change it.
  const started = copies.some((c) => c.status !== "pending" || (c.reviewStatus ?? "none") !== "none");
  if (started && ctx.role !== "admin") {
    throw new TaskError(409, "Work has started, so only an admin can change the review setting");
  }
  let changed = 0;
  for (const c of copies) {
    if ((c.reviewRequired !== false) === reviewRequired) continue;
    const res = await AgentTask.updateOne(
      { _id: c._id },
      {
        $set: { reviewRequired },
        ...pushHistory({ action: "review_switch", by: ctx.userId, note: reviewRequired ? "Review on" : "Review off" }),
      },
    );
    changed += res.modifiedCount;
  }
  return { changed };
}
