/**
 * The seeker's application progress trail.
 *
 * LinkedIn, Indeed and Naukri all show an applicant a dated trail of what
 * happened to their application, including the moment the employer opened it
 * ("Application viewed"). The page used to show the status pills alone, with
 * no dates and repeats like "Interview → Interview". This builds the trail
 * from the stored status history plus `viewedByEmployerAt`.
 */
import { collapseStatusHistory } from "./applicationFormat";

export interface TimelineEvent {
  kind: "status" | "viewed";
  /** The status reached; absent for the "viewed" event. */
  status?: string;
  at: string;
  /** The stage the application is in now. */
  current: boolean;
}

interface TimelineInput {
  status: string;
  appliedAt: string;
  viewedByEmployerAt?: string | null;
  statusHistory?: readonly { status: string; changedAt: string }[];
}

const time = (iso: string) => new Date(iso).getTime();

export function buildApplicationTimeline(app: TimelineInput): TimelineEvent[] {
  const history = collapseStatusHistory(app.statusHistory ?? []);
  const statusEvents: TimelineEvent[] = (history.length > 0
    ? history
    : [{ status: "applied", changedAt: app.appliedAt }]
  ).map((h) => ({ kind: "status", status: h.status, at: h.changedAt, current: false }));

  // The newest entry for the current status is where the application stands.
  for (let i = statusEvents.length - 1; i >= 0; i -= 1) {
    if (statusEvents[i].status === app.status) {
      statusEvents[i].current = true;
      break;
    }
  }

  const events = [...statusEvents];
  const viewed = app.viewedByEmployerAt;
  if (viewed && !Number.isNaN(time(viewed)) && time(viewed) >= time(app.appliedAt)) {
    events.push({ kind: "viewed", at: viewed, current: false });
  }
  // Stable sort keeps a status and a view stamped in the same instant in order.
  return events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => time(a.event.at) - time(b.event.at) || a.index - b.index)
    .map(({ event }) => event);
}

/** Keys of the "what happens next" copy (applicationDetail.next.*). */
export type NextStepKey =
  | "applied"
  | "applied_viewed"
  | "shortlisted"
  | "interview_scheduled"
  | "selected"
  | "offer"
  | "hired"
  | "rejected"
  | "withdrawn";

const STEP_KEYS: readonly NextStepKey[] = [
  "shortlisted", "interview_scheduled", "selected", "offer", "hired", "rejected", "withdrawn",
];

export function nextStepFor(status: string, viewedByEmployer: boolean): NextStepKey | null {
  if (status === "applied") return viewedByEmployer ? "applied_viewed" : "applied";
  return (STEP_KEYS as readonly string[]).includes(status) ? (status as NextStepKey) : null;
}
