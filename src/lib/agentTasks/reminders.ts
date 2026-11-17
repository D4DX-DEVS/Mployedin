import mongoose from "mongoose";
import AgentTask, { CLOSED_TASK_STATUSES, type AgentTaskAssigneeRole } from "@/models/AgentTask";
import { assigneeHome, notifyQuietly, reviewerHome } from "./taskNotify";

/**
 * The daily task reminders (Tasks for every role, rule 5). Each is sent once
 * per task — `remindedAt` records it, and a changed due date clears it:
 *  - due tomorrow → the person doing it (in-app)
 *  - overdue      → the person doing it (in-app)
 *  - overdue, given task → whoever gave it (in-app AND email, once)
 * A task waiting for review is with the giver, so it doesn't nag the doer.
 * Personal to-dos only ever remind their owner, in-app.
 */

const BATCH = 2000;

type Reminder = "dueSoon" | "overdue" | "giverOverdue";
interface ReminderTask {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  title: string;
  assigneeRole?: AgentTaskAssigneeRole;
  assignedBy?: { userId?: mongoose.Types.ObjectId; role?: "admin" | "super_agent" };
}

/** Where the person doing it finds the task: "My tasks" for their own, "Given to me" for given ones. */
function doerLink(t: ReminderTask): string {
  const role = t.assigneeRole ?? "agent";
  if (t.assignedBy?.userId) return assigneeHome(role);
  return role === "admin" ? "/admin/tasks" : role === "super_agent" ? "/super-agent/tasks" : "/agent/tasks";
}

/** Claims the reminder on one task; false when another run already sent it. */
async function claim(id: mongoose.Types.ObjectId, kind: Reminder, at: Date): Promise<boolean> {
  const res = await AgentTask.updateOne(
    { _id: id, [`remindedAt.${kind}`]: { $exists: false } },
    { $set: { [`remindedAt.${kind}`]: at } },
  );
  return res.modifiedCount === 1;
}

export interface ReminderRunResult {
  dueSoon: number;
  overdue: number;
  giverOverdue: number;
}

export async function runTaskReminders(now = new Date()): Promise<ReminderRunResult> {
  const startTomorrow = new Date(now);
  startTomorrow.setUTCHours(24, 0, 0, 0);
  const endTomorrow = new Date(startTomorrow.getTime() + 24 * 60 * 60 * 1000 - 1);
  const open = { status: { $nin: CLOSED_TASK_STATUSES }, reviewStatus: { $ne: "awaiting_review" as const } };
  const fields = "_id userId title assigneeRole assignedBy";

  const [dueSoon, overdue, giverOverdue] = await Promise.all([
    AgentTask.find({ ...open, dueDate: { $gte: startTomorrow, $lte: endTomorrow }, "remindedAt.dueSoon": { $exists: false } })
      .select(fields).limit(BATCH).lean<ReminderTask[]>(),
    AgentTask.find({ ...open, dueDate: { $ne: null, $lt: now }, "remindedAt.overdue": { $exists: false } })
      .select(fields).limit(BATCH).lean<ReminderTask[]>(),
    AgentTask.find({
      status: { $nin: CLOSED_TASK_STATUSES },
      "assignedBy.userId": { $exists: true },
      dueDate: { $ne: null, $lt: now },
      "remindedAt.giverOverdue": { $exists: false },
    }).select(fields).limit(BATCH).lean<ReminderTask[]>(),
  ]);

  const result: ReminderRunResult = { dueSoon: 0, overdue: 0, giverOverdue: 0 };

  for (const t of dueSoon) {
    if (!(await claim(t._id, "dueSoon", now))) continue;
    result.dueSoon++;
    await notifyQuietly({
      userId: String(t.userId),
      title: "Task due tomorrow",
      message: `Due tomorrow: ${t.title}`,
      link: doerLink(t),
      titleKey: "taskDueSoonTitle",
      bodyKey: "taskDueSoonBody",
      params: { title: t.title },
      metadata: { taskId: String(t._id) },
    });
  }

  for (const t of overdue) {
    if (!(await claim(t._id, "overdue", now))) continue;
    result.overdue++;
    await notifyQuietly({
      userId: String(t.userId),
      title: "Task overdue",
      message: `Overdue: ${t.title}`,
      link: doerLink(t),
      titleKey: "taskOverdueTitle",
      bodyKey: "taskOverdueBody",
      params: { title: t.title },
      metadata: { taskId: String(t._id) },
    });
  }

  for (const t of giverOverdue) {
    const giver = t.assignedBy?.userId;
    if (!giver || !(await claim(t._id, "giverOverdue", now))) continue;
    result.giverOverdue++;
    await notifyQuietly({
      userId: String(giver),
      title: "A task you gave is overdue",
      message: `Overdue: ${t.title}`,
      link: await reviewerHome(String(giver), t.assignedBy?.role),
      titleKey: "taskGiverOverdueTitle",
      bodyKey: "taskGiverOverdueBody",
      params: { title: t.title },
      metadata: { taskId: String(t._id) },
      // The one task email (owner, 2026-11-17): overdue work you gave.
      sendEmail: true,
    });
  }
  return result;
}
