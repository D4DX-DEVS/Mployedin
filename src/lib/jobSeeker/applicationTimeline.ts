/**
 * The seeker's application progress trail.
 *
 * LinkedIn, Indeed and Naukri all show an applicant a dated trail of what
 * happened to their application, including the moment the employer opened it
 * ("Application viewed"). The page used to show the status pills alone, with
 * no dates and repeats like "Interview → Interview". This builds the trail
 * from the stored status history plus `viewedByEmployerAt`.
 *
 * Steps are the seeker's (lib/jobSeeker/seekerStatus): Shortlisted reads "In
 * review", Selected stays under "Interview", Rejected reads "Not selected".
 */
import { seekerStageHistory, seekerStageOf, type SeekerStage } from "./seekerStatus";

export interface TimelineEvent {
  kind: "status" | "viewed";
  /** The seeker step reached; absent for the "viewed" event. */
  status?: SeekerStage;
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
  const history = seekerStageHistory(app.statusHistory ?? []);
  const statusEvents: TimelineEvent[] = (history.length > 0
    ? history
    : [{ status: "applied", stage: "applied" as const, changedAt: app.appliedAt }]
  ).map((h) => ({ kind: "status", status: h.stage, at: h.changedAt, current: false }));

  // The newest entry for the current step is where the application stands.
  const currentStage = seekerStageOf(app.status);
  for (let i = statusEvents.length - 1; i >= 0; i -= 1) {
    if (statusEvents[i].status === currentStage) {
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

/** Keys of the "what happens next" copy (applicationDetail.next.*): a seeker step, or "applied_viewed". */
export type NextStepKey = SeekerStage | "applied_viewed";

export function nextStepFor(status: string, viewedByEmployer: boolean): NextStepKey | null {
  const stage = seekerStageOf(status);
  if (stage === "applied") return viewedByEmployer ? "applied_viewed" : "applied";
  return stage;
}
