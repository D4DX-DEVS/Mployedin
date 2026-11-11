/* Client-safe: the agent Job Seekers page imports the labels and classes, so
   nothing here may pull in a model. The aggregation is hiringStatus.server.ts. */

export const HIRING_STATUSES = ["placed", "offer", "interviewing", "shortlisted", "applied", "notProgressed", "waiting"] as const;
export type HiringStatusType = (typeof HIRING_STATUSES)[number];

/**
 * Computes the hiring status for a job seeker based on their applications.
 * Returns the furthest stage reached across all applications.
 *
 * Hierarchy (highest to lowest):
 * - placed (hired)
 * - offer
 * - interviewing (interview_scheduled or selected)
 * - shortlisted
 * - applied
 * - notProgressed (rejected and/or withdrawn, with no progress)
 * - waiting (no applications)
 */
export function computeHiringStatus(applicationStatuses: readonly string[]): HiringStatusType {
  if (applicationStatuses.length === 0) {
    return "waiting";
  }

  // Check for highest priority statuses first
  if (applicationStatuses.includes("hired")) {
    return "placed";
  }

  if (applicationStatuses.includes("offer")) {
    return "offer";
  }

  if (
    applicationStatuses.includes("interview_scheduled") ||
    applicationStatuses.includes("selected")
  ) {
    return "interviewing";
  }

  if (applicationStatuses.includes("shortlisted")) {
    return "shortlisted";
  }

  if (applicationStatuses.includes("applied")) {
    return "applied";
  }

  // Only rejected/withdrawn
  if (
    applicationStatuses.every((s) => s === "rejected" || s === "withdrawn")
  ) {
    return "notProgressed";
  }

  // Default (shouldn't reach here if the logic is complete)
  return "waiting";
}

/** One application of a seeker, as the staff lists and the profile panel show it. */
export interface SeekerApplicationRow {
  id: string;
  jobId: string;
  jobTitle: string;
  company?: string;
  status: string;
  /** When the application last changed (ISO). */
  updatedAt: string;
}

/** The application statuses that put a seeker at each hiring status. */
const STATUSES_OF: Record<HiringStatusType, readonly string[]> = {
  placed: ["hired"],
  offer: ["offer"],
  interviewing: ["interview_scheduled", "selected"],
  shortlisted: ["shortlisted"],
  applied: ["applied"],
  notProgressed: ["rejected", "withdrawn"],
  waiting: [],
};

/**
 * The job a seeker's hiring status comes from: the most recently changed
 * application at that stage. Undefined for "waiting" (no applications).
 */
export function pickHiringApplication(
  applications: readonly SeekerApplicationRow[],
  hiringStatus: HiringStatusType,
): SeekerApplicationRow | undefined {
  const stages = STATUSES_OF[hiringStatus];
  return applications
    .filter((a) => stages.includes(a.status))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

/**
 * Maps hiring status to StatusBadge class name.
 */
export const hiringStatusClassMap: Record<HiringStatusType, string> = {
  placed: "status-active",
  offer: "status-premium",
  interviewing: "status-interview",
  shortlisted: "status-shortlisted",
  applied: "status-applied",
  notProgressed: "status-withdrawn",
  waiting: "status-pending",
};

/**
 * Maps hiring status to translation key (used with statusBadge namespace).
 */
export const hiringStatusLabelKeyMap: Record<HiringStatusType, string> = {
  placed: "hiringStatus.placed",
  offer: "hiringStatus.offer",
  interviewing: "hiringStatus.interviewing",
  shortlisted: "hiringStatus.shortlisted",
  applied: "hiringStatus.applied",
  notProgressed: "hiringStatus.notProgressed",
  waiting: "hiringStatus.waiting",
};
