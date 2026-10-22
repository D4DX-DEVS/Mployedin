import AgentTask, { type AgentTaskCategory, type AgentTaskPriority, type AgentTaskStatus } from "@/models/AgentTask";
import { isAssignedTask, submitAssignedTask, TaskError } from "./assigned";
import { pushHistory } from "./history";

/**
 * An agent changing one of their own tasks: the Tasks page (PATCH
 * /api/agent/tasks/[id]) and the Copilot both go through here, so a task the
 * Copilot closes follows the same rules as one closed on the page:
 *  - a task from a super agent or an admin: the agent works it, and Completed
 *    or Failed is a report that goes to review (note optional); what it says
 *    and when it is due stay the assigner's; while it is with the reviewer the
 *    agent can't change it
 *  - every status change is a history line (from → to, note)
 * Throws TaskError (404 / 403 / 409) for the caller to turn into a response.
 */

export interface OwnTaskUpdate {
  title?: string;
  description?: string;
  priority?: AgentTaskPriority;
  category?: AgentTaskCategory;
  dueDate?: Date | string | null;
  status?: AgentTaskStatus;
  /** Optional note with a status change; kept in the history, and as completionNote on close. */
  note?: string;
}

export interface OwnTaskUpdateResult {
  task: unknown;
  /** "submitted": an assigned task went to its reviewer instead of closing. */
  outcome: "updated" | "submitted";
}

export async function updateOwnTask(userId: string, id: string, body: OwnTaskUpdate): Promise<OwnTaskUpdateResult> {
  const note = body.note || undefined;
  const existing = await AgentTask.findOne({ _id: id, userId })
    .select("assignedBy reviewStatus status")
    .lean<{ assignedBy?: { userId?: unknown }; reviewStatus?: string; status: AgentTaskStatus }>();
  if (!existing) throw new TaskError(404, "Task not found");

  if (isAssignedTask(existing)) {
    const editsContent = [body.title, body.description, body.priority, body.category, body.dueDate].some((v) => v !== undefined);
    if (editsContent) {
      throw new TaskError(403, "This task was assigned to you, so only the person who assigned it can change it.");
    }
    // Completed or Failed on an assigned task is a report to the reviewer, not
    // a final status: it goes to review (note optional).
    if (body.status === "completed" || body.status === "failed") {
      return { task: await submitAssignedTask(userId, id, body.status, note), outcome: "submitted" };
    }
    if (existing.reviewStatus === "awaiting_review" || existing.reviewStatus === "approved") {
      throw new TaskError(409, "This task is with your reviewer.");
    }
  }

  const update: Record<string, unknown> = {};
  if (body.title !== undefined) update.title = body.title;
  if (body.description !== undefined) update.description = body.description;
  if (body.priority !== undefined) update.priority = body.priority;
  if (body.status !== undefined) update.status = body.status;
  // Closing a personal to-do keeps its optional note; reopening clears it.
  if (body.status === "completed" || body.status === "failed") update.completionNote = note;
  else if (body.status !== undefined) update.completionNote = undefined;
  if (body.category !== undefined) update.category = body.category;
  if (body.dueDate !== undefined) update.dueDate = body.dueDate ? new Date(body.dueDate) : null;

  const task = await AgentTask.findOneAndUpdate(
    { _id: id, userId },
    {
      $set: update,
      ...(body.status !== undefined && body.status !== existing.status
        ? pushHistory({ action: "status", by: userId, from: existing.status, to: body.status, note })
        : {}),
    },
    { returnDocument: "after" },
  );
  if (!task) throw new TaskError(404, "Task not found");
  return { task, outcome: "updated" };
}
