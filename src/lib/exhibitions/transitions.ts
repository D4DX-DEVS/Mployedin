import type { ExhibitionRequestStatus } from "@/models/ExhibitionRequest";

/**
 * Which status moves each reviewing role may make, by current status. The
 * PATCH route enforces it; the admin queue reads it to offer only the actions
 * the server will accept (it used to offer Approve and Reject at every stage,
 * and most of them came back 400).
 */
export const VALID_TRANSITIONS: Record<string, Partial<Record<ExhibitionRequestStatus, ExhibitionRequestStatus[]>>> = {
  super_agent: {
    submitted: ["under_review", "rejected"],
    under_review: ["approved", "rejected", "revision_requested"],
    revision_requested: ["under_review"],
  },
  admin: {
    submitted: ["under_review", "approved", "rejected"],
    under_review: ["approved", "rejected", "revision_requested"],
    approved: ["budget_approved", "rejected"],
    revision_requested: ["under_review"],
    budget_approved: ["resources_assigned"],
    resources_assigned: ["active"],
    active: ["completed"],
    completed: ["archived"],
    rejected: ["archived"],
  },
};

export function adminCanMove(from: string, to: ExhibitionRequestStatus): boolean {
  return VALID_TRANSITIONS.admin[from as ExhibitionRequestStatus]?.includes(to) ?? false;
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
