/**
 * One label for where an assigned task stands, combining the work status and
 * the review state: the reviewer cares about "Awaiting review", not about
 * "completed + awaiting_review".
 */
export type TaskState = "pending" | "in_progress" | "awaiting_review" | "approved" | "returned" | "completed";

export function taskState(task: { status: string; reviewStatus?: string }): TaskState {
  if (task.reviewStatus === "awaiting_review") return "awaiting_review";
  if (task.reviewStatus === "approved") return "approved";
  if (task.reviewStatus === "returned" && task.status !== "completed") return "returned";
  if (task.status === "in_progress") return "in_progress";
  if (task.status === "completed") return "completed";
  return "pending";
}

export const TASK_STATE_CLASS: Record<TaskState, string> = {
  pending: "bg-slate-100 text-slate-700",
  in_progress: "bg-blue-100 text-blue-700",
  awaiting_review: "bg-violet-100 text-violet-700",
  approved: "bg-emerald-100 text-emerald-700",
  returned: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-700",
};

/** The `assignedTasks` key for each state; literal keys so the i18n checks see them. */
export function taskStateKey(state: TaskState) {
  switch (state) {
    case "pending": return "statePending" as const;
    case "in_progress": return "stateInProgress" as const;
    case "awaiting_review": return "stateAwaitingReview" as const;
    case "approved": return "stateApproved" as const;
    case "returned": return "stateReturned" as const;
    case "completed": return "stateCompleted" as const;
  }
}
