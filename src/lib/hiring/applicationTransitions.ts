import type { ApplicationStatus } from "@/models/Application";

/**
 * Which `Application.status` moves a PATCH may make.
 *
 * Without a map a candidate could "withdraw" an application that was already
 * hired or rejected, and staff could jump any status to any other — including
 * `offer` or `interview_scheduled` with no Offer or Interview behind them,
 * which left the funnel claiming an offer nobody could answer.
 *
 * Staff may move backwards between the open funnel stages (the PATCH route
 * warns about open interviews separately) and may reopen a rejection, but a
 * hire and a candidate's own withdrawal are final.
 */
export const STAFF_TRANSITIONS: Readonly<Record<ApplicationStatus, readonly ApplicationStatus[]>> = {
  applied: ["shortlisted", "interview_scheduled", "selected", "rejected", "withdrawn"],
  shortlisted: ["applied", "interview_scheduled", "selected", "rejected", "withdrawn"],
  interview_scheduled: ["applied", "shortlisted", "selected", "rejected", "withdrawn"],
  selected: ["applied", "shortlisted", "interview_scheduled", "offer", "hired", "rejected", "withdrawn"],
  offer: ["selected", "hired", "rejected", "withdrawn"],
  hired: [],
  rejected: ["applied", "shortlisted", "selected"],
  withdrawn: [],
};

/** Statuses no one moves an application out of by candidate action. */
export const TERMINAL_APPLICATION_STATUSES: readonly ApplicationStatus[] = ["hired", "rejected", "withdrawn"];

/**
 * Statuses that describe a record elsewhere. The Offer and Interview routes set
 * them; a PATCH may only set them when that record already exists.
 */
export const RECORD_BACKED_STATUSES = ["offer", "interview_scheduled"] as const satisfies readonly ApplicationStatus[];
export type RecordBackedStatus = (typeof RECORD_BACKED_STATUSES)[number];

export function isRecordBackedStatus(status: string): status is RecordBackedStatus {
  return (RECORD_BACKED_STATUSES as readonly string[]).includes(status);
}

/** Targets a bulk "move stage" may use: none of them needs a backing record or a placement. */
export const BULK_MOVE_TARGETS: readonly ApplicationStatus[] = ["shortlisted", "selected", "rejected"];

export type TransitionActor = "job_seeker" | "staff";

/** True when `actor` may move an application from `from` to `to`. A no-op move is always allowed. */
export function canTransitionApplication(from: ApplicationStatus, to: ApplicationStatus, actor: TransitionActor): boolean {
  if (from === to) return true;
  if (actor === "job_seeker") {
    return to === "withdrawn" && !TERMINAL_APPLICATION_STATUSES.includes(from);
  }
  return (STAFF_TRANSITIONS[from] ?? []).includes(to);
}

export const INVALID_TRANSITION_CODE = "invalid_transition";

export function invalidTransitionBody(from: string, to: string, reason?: string) {
  return {
    error: reason ?? `An application can't move from ${from.replace(/_/g, " ")} to ${to.replace(/_/g, " ")}.`,
    code: INVALID_TRANSITION_CODE,
    from,
    to,
  };
}
