import type { ExhibitionRequestStatus } from "@/models/ExhibitionRequest";

/**
 * The stage each status steps back to. Reviewers asked for a way to undo a
 * move made too early or by mistake (client feedback 2026-10-14: "no back
 * option"); before this every move was one-way, so the only fix for a wrong
 * approval was a new request. A step back always needs a reason.
 */
export const STEP_BACK: Partial<Record<ExhibitionRequestStatus, ExhibitionRequestStatus>> = {
  approved: "under_review",
  budget_approved: "approved",
  resources_assigned: "budget_approved",
  active: "resources_assigned",
  completed: "active",
  rejected: "under_review",
};

/**
 * Which status moves each role may make, by current status. The PATCH route
 * enforces it; the admin queue reads it to offer only the actions the server
 * will accept (it used to offer Approve and Reject at every stage, and most of
 * them came back 400).
 *
 * A super agent may step back only their own decisions, and only while the
 * request still sits at them (the route also checks a rejection was theirs).
 * An agent's one move is reporting their running event completed.
 */
export const VALID_TRANSITIONS: Record<string, Partial<Record<ExhibitionRequestStatus, ExhibitionRequestStatus[]>>> = {
  agent: {
    active: ["completed"],
  },
  super_agent: {
    submitted: ["under_review", "rejected"],
    under_review: ["approved", "rejected", "revision_requested"],
    revision_requested: ["under_review"],
    approved: ["under_review"],
    rejected: ["under_review"],
  },
  admin: {
    submitted: ["under_review", "approved", "rejected"],
    under_review: ["approved", "rejected", "revision_requested"],
    approved: ["budget_approved", "rejected", "under_review"],
    revision_requested: ["under_review"],
    budget_approved: ["resources_assigned", "approved"],
    resources_assigned: ["active", "budget_approved"],
    active: ["completed", "resources_assigned"],
    completed: ["archived", "active"],
    rejected: ["archived", "under_review"],
  },
};

export function canMove(role: string, from: string, to: ExhibitionRequestStatus): boolean {
  return VALID_TRANSITIONS[role]?.[from as ExhibitionRequestStatus]?.includes(to) ?? false;
}

export function adminCanMove(from: string, to: ExhibitionRequestStatus): boolean {
  return canMove("admin", from, to);
}

/** True when `from → to` is a step back rather than progress. */
/**
 * The history entry that moved the request into `status`. Entries written
 * while it stays there (a priority change, a details edit, a support save)
 * repeat the status, so the move is the first entry of the trailing run —
 * the last entry with that status is not (it let a super agent's priority
 * change pass for their own rejection of an admin's decision).
 */
export function entryIntoStatus<T extends { status?: string }>(history: readonly T[] | undefined, status: string): T | undefined {
  const list = history ?? [];
  let i = list.length - 1;
  if (i < 0 || list[i].status !== status) return undefined;
  while (i > 0 && list[i - 1].status === status) i -= 1;
  return list[i];
}

/**
 * A super agent may undo only their own decision: an approval or rejection
 * the admin made is the admin's to reverse.
 */
export function superAgentOwnsCurrentDecision(item: { status: string; statusHistory?: readonly { status?: string; approverRole?: string }[] }): boolean {
  if (item.status !== "approved" && item.status !== "rejected") return false;
  return entryIntoStatus(item.statusHistory, item.status)?.approverRole === "super_agent";
}

export function isStepBack(from: string, to: string): boolean {
  return STEP_BACK[from as ExhibitionRequestStatus] === to;
}

/**
 * The forward step an admin takes next from each status — the one action the
 * queue row and the inspector offer first. Reject, send-back and start-review
 * are offered separately, where `adminCanMove` allows them.
 */
export const ADMIN_NEXT_STEP: Partial<Record<ExhibitionRequestStatus, { status: ExhibitionRequestStatus; labelKey: string }>> = {
  submitted: { status: "approved", labelKey: "approveAction" },
  under_review: { status: "approved", labelKey: "approveAction" },
  revision_requested: { status: "under_review", labelKey: "reReview" },
  approved: { status: "budget_approved", labelKey: "approveBudget" },
  budget_approved: { status: "resources_assigned", labelKey: "assignResources" },
  resources_assigned: { status: "active", labelKey: "markActive" },
  active: { status: "completed", labelKey: "complete" },
  completed: { status: "archived", labelKey: "archive" },
  rejected: { status: "archived", labelKey: "archive" },
};
