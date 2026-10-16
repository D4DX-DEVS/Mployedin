import type { ExhibitionRequestStatus } from "@/models/ExhibitionRequest";

/**
 * Which status moves each role may make, by current status. The PATCH route
 * enforces it; the screens read it to offer only the actions the server will
 * accept.
 *
 * The workflow is three people doing one job each (owner, 2026-10-15): the
 * agent submits, the super agent verifies with a recommended budget, the
 * admin approves the payment and the support items in one step, and the
 * agent reports the event. Completed is the final record: its balance
 * (approved against spent) is shown, not settled as a further step, and
 * nothing is archived (rejected stays rejected). A request that needs fixing is
 * sent back to the agent (one action); anything else is corrected in place
 * with Edit. The step-back and reopen moves are gone: they asked for a
 * reason at every stage and let a decision bounce between reviewers.
 *
 * resources_assigned and active are no longer entered; requests already
 * there can still be completed.
 */
export const VALID_TRANSITIONS: Record<string, Partial<Record<ExhibitionRequestStatus, ExhibitionRequestStatus[]>>> = {
  agent: {
    budget_approved: ["completed"],
    resources_assigned: ["completed"],
    active: ["completed"],
  },
  super_agent: {
    submitted: ["approved", "rejected", "revision_requested", "under_review"],
    under_review: ["approved", "rejected", "revision_requested"],
    revision_requested: ["under_review"],
  },
  admin: {
    submitted: ["approved", "rejected", "revision_requested", "under_review"],
    under_review: ["approved", "rejected", "revision_requested"],
    approved: ["budget_approved", "rejected", "revision_requested"],
    revision_requested: ["under_review"],
    budget_approved: ["completed", "rejected"],
    resources_assigned: ["completed", "rejected"],
    active: ["completed", "rejected"],
  },
};

/** Approved for payment and waiting on the event and the agent's report. */
export const PAYMENT_APPROVED_STATUSES: readonly string[] = ["budget_approved", "resources_assigned", "active"];

export function canMove(role: string, from: string, to: ExhibitionRequestStatus): boolean {
  return VALID_TRANSITIONS[role]?.[from as ExhibitionRequestStatus]?.includes(to) ?? false;
}

export function adminCanMove(from: string, to: ExhibitionRequestStatus): boolean {
  return canMove("admin", from, to);
}

/**
 * The forward step an admin takes next from each status — the one action the
 * queue row and the inspector offer first. Reject and send-back are offered
 * separately, where `adminCanMove` allows them.
 */
export const ADMIN_NEXT_STEP: Partial<Record<ExhibitionRequestStatus, { status: ExhibitionRequestStatus; labelKey: string }>> = {
  submitted: { status: "approved", labelKey: "approveAction" },
  under_review: { status: "approved", labelKey: "approveAction" },
  revision_requested: { status: "under_review", labelKey: "reReview" },
  approved: { status: "budget_approved", labelKey: "approvePayment" },
  budget_approved: { status: "completed", labelKey: "complete" },
  resources_assigned: { status: "completed", labelKey: "complete" },
  active: { status: "completed", labelKey: "complete" },
};

/**
 * Stages where the request is a finished record: its facts, priority and
 * event files stay as they were. Only the outcome (leads, summary, spend,
 * photos) is still recorded on a completed event. Archived is no longer
 * entered; older requests already there stay closed.
 */
export const CLOSED_STATUSES: readonly string[] = ["completed", "rejected", "archived"];

export function isClosedStatus(status: string): boolean {
  return CLOSED_STATUSES.includes(status);
}

/**
 * An older event archived after it was completed (archiving is retired).
 * Archive also closed rejected requests, so the history tells the two apart.
 */
export function isSettled(item: { status: string; statusHistory?: readonly { status?: string }[] }): boolean {
  return item.status === "archived" && (item.statusHistory ?? []).some((entry) => entry.status === "completed");
}

/**
 * Past the admin's payment approval, an in-place edit changes something two
 * people already signed off, so it needs a reason and is logged old to new.
 */
export function editNeedsReason(status: string): boolean {
  return PAYMENT_APPROVED_STATUSES.includes(status) || status === "completed";
}

/**
 * Whether the event's start date has come. Nobody marks an event active any
 * more; it runs on its dates, and the agent reports it once it has started.
 * Dates are stored as the day at 00:00 UTC, so the check allows for agents
 * whose local day begins up to 14 hours before UTC's. No date: no gate.
 */
export function eventHasStarted(start: Date | string | null | undefined, now: Date = new Date()): boolean {
  if (!start) return true;
  const at = new Date(start).getTime();
  if (Number.isNaN(at)) return true;
  return at <= now.getTime() + 14 * 60 * 60 * 1000;
}

/** Support is allocated in the payment approval and adjusted until the event is reported. */
export const SUPPORT_ALLOCATE_STATUSES: readonly string[] = ["approved", ...PAYMENT_APPROVED_STATUSES];
/** Delivery is tracked once the support is approved, up to the event's report. */
export const SUPPORT_DELIVERY_STATUSES: readonly string[] = PAYMENT_APPROVED_STATUSES;

/** The agent's Report event: an approved event whose start date has come. */
export function canReportEvent(item: { status: string; eventStartDate?: Date | string | null }): boolean {
  return PAYMENT_APPROVED_STATUSES.includes(item.status) && eventHasStarted(item.eventStartDate);
}
