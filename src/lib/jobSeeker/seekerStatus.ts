/**
 * What a job seeker is shown of an application's status.
 *
 * Employers move candidates through eight statuses; the seeker sees five steps
 * and two endings (owner decision 2026-11-13). Shortlisted and Selected are the
 * employer's own sorting: "Shortlisted" followed days later by a rejection read
 * worse than "In review", and "Selected" after an interview sounded like a job
 * before any offer existed. The employer side keeps every stage.
 *
 *   applied              -> Applied
 *   shortlisted          -> In review
 *   interview_scheduled  -> Interview
 *   selected             -> Interview
 *   offer                -> Offer
 *   hired                -> Hired
 *   rejected             -> Not selected
 *   withdrawn            -> Withdrawn
 *
 * No server or browser imports: the list route, the notification helpers and
 * the seeker pages all read this one table.
 */
import type { ApplicationStatus } from "@/models/Application";

export const SEEKER_STAGES = [
  "applied",
  "in_review",
  "interview",
  "offer",
  "hired",
  "not_selected",
  "withdrawn",
] as const;

export type SeekerStage = (typeof SEEKER_STAGES)[number];

const STAGE_OF: Record<ApplicationStatus, SeekerStage> = {
  applied: "applied",
  shortlisted: "in_review",
  interview_scheduled: "interview",
  selected: "interview",
  offer: "offer",
  hired: "hired",
  rejected: "not_selected",
  withdrawn: "withdrawn",
};

/** The seeker's step for a stored status; null for a status this table doesn't know. */
export function seekerStageOf(status: string | null | undefined): SeekerStage | null {
  if (!status) return null;
  return (STAGE_OF as Record<string, SeekerStage>)[status] ?? null;
}

/**
 * The stored status whose badge colour each seeker step borrows, so the seeker
 * badge and the employer badge for the same stage look alike.
 */
export const SEEKER_STAGE_BADGE_STATUS: Record<SeekerStage, ApplicationStatus> = {
  applied: "applied",
  in_review: "shortlisted",
  interview: "interview_scheduled",
  offer: "offer",
  hired: "hired",
  not_selected: "rejected",
  withdrawn: "withdrawn",
};

/**
 * The list's tabs (owner, 2026-11-13): everything, then the three moments a
 * seeker acts on or wants to find — an interview, an offer (Hired included:
 * an accepted offer becomes the hire), and the closed ones. Applied and In
 * review sit under All.
 */
export const SEEKER_STATUS_TABS = ["all", "interview", "offer", "closed"] as const;

export type SeekerStatusTab = (typeof SEEKER_STATUS_TABS)[number];

/** Stored statuses behind each tab other than "all". */
export const SEEKER_TAB_STATUSES: Record<Exclude<SeekerStatusTab, "all">, readonly ApplicationStatus[]> = {
  interview: ["interview_scheduled", "selected"],
  offer: ["offer", "hired"],
  closed: ["rejected", "withdrawn"],
};

export function isSeekerStatusTab(value: string): value is Exclude<SeekerStatusTab, "all"> {
  return Object.prototype.hasOwnProperty.call(SEEKER_TAB_STATUSES, value);
}

/** Each tab's total, summed from per-status counts. */
export function seekerTabCounts(byStatus: Readonly<Record<string, number>>): Record<Exclude<SeekerStatusTab, "all">, number> {
  const sum = (statuses: readonly string[]) => statuses.reduce((total, s) => total + (byStatus[s] ?? 0), 0);
  return {
    interview: sum(SEEKER_TAB_STATUSES.interview),
    offer: sum(SEEKER_TAB_STATUSES.offer),
    closed: sum(SEEKER_TAB_STATUSES.closed),
  };
}

/**
 * Employer moves the seeker is not told about: neither changes what the seeker
 * sees (In review / Interview stay put), so a message would be noise.
 */
const SILENT_FOR_SEEKER: readonly string[] = ["shortlisted", "selected"];

export function isSilentForSeeker(status: string): boolean {
  return SILENT_FOR_SEEKER.includes(status);
}

/**
 * A status history in seeker steps, without back-to-back repeats: Shortlisted
 * then Selected used to read "In review -> Interview -> Interview". Each run
 * keeps its first entry, so the date is when that step began. Unknown
 * statuses are dropped.
 */
export function seekerStageHistory<T extends { status: string }>(
  history: readonly T[],
): Array<T & { stage: SeekerStage }> {
  const out: Array<T & { stage: SeekerStage }> = [];
  for (const entry of history) {
    const stage = seekerStageOf(entry.status);
    if (!stage) continue;
    if (out.length > 0 && out[out.length - 1].stage === stage) continue;
    out.push({ ...entry, stage });
  }
  return out;
}
