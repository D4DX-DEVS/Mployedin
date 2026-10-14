import mongoose from "mongoose";
import User from "@/models/User";
import type { AgentTaskHistoryAction, AgentTaskStatus, IAgentTaskHistoryEntry } from "@/models/AgentTask";

/** Oldest lines drop off past this, so a long-lived task can't grow unbounded. */
const HISTORY_CAP = 100;

/** A `$push` for one history line; merge it into the update that makes the change. */
export function pushHistory(entry: {
  action: AgentTaskHistoryAction;
  by: string;
  from?: AgentTaskStatus;
  to?: AgentTaskStatus;
  note?: string;
}) {
  return {
    $push: {
      history: {
        $each: [{
          action: entry.action,
          from: entry.from,
          to: entry.to,
          note: entry.note?.trim() || undefined,
          by: new mongoose.Types.ObjectId(entry.by),
          at: new Date(),
        }],
        $slice: -HISTORY_CAP,
      },
    },
  };
}

export interface TaskHistoryItem {
  action: AgentTaskHistoryAction;
  from?: AgentTaskStatus;
  to?: AgentTaskStatus;
  note?: string;
  byName: string;
  at: string;
}

/**
 * The task's activity, newest first, with names resolved. Tasks created before
 * history was recorded get their creation line from `createdAt`.
 */
export async function readTaskHistory(task: {
  userId: unknown;
  createdAt?: Date;
  assignedBy?: { userId?: unknown } | null;
  history?: IAgentTaskHistoryEntry[];
}): Promise<TaskHistoryItem[]> {
  const lines = [...(task.history ?? [])];
  if (!lines.some((l) => l.action === "created" || l.action === "assigned") && task.createdAt) {
    const creator = task.assignedBy?.userId ?? task.userId;
    lines.unshift({
      action: task.assignedBy?.userId ? "assigned" : "created",
      by: creator as mongoose.Types.ObjectId,
      at: task.createdAt,
    });
  }
  const ids = [...new Set(lines.map((l) => String(l.by)))];
  const users = ids.length
    ? await User.find({ _id: { $in: ids } }).select("_id name").lean<Array<{ _id: unknown; name?: string }>>()
    : [];
  const names = new Map(users.map((u) => [String(u._id), u.name ?? ""]));
  return lines
    .map((l) => ({
      action: l.action,
      from: l.from,
      to: l.to,
      note: l.note,
      byName: names.get(String(l.by)) ?? "",
      at: new Date(l.at).toISOString(),
    }))
    .reverse();
}
