/**
 * The candidate's view of their own application.
 *
 * An application document carries the employer's working notes about the
 * candidate as well as the candidate's own data. These keys are recruiter-only:
 * the notes thread, agent/employer notes, the rejection reason, the AI
 * strengths/gaps the employer reads, and the engagement ranking. The list and
 * detail routes both use this one list so they cannot drift apart again (the
 * list once excluded `employerNotes` but shipped the `notes` thread).
 */
export const SEEKER_HIDDEN_APPLICATION_FIELDS = [
  "notes",
  "employerNotes",
  "agentNotes",
  "rejectionReason",
  "matchStrengths",
  "matchGaps",
  "matchBreakdown",
  "qualifications",
  "requirementsStatus",
  "missingSkills",
  "weightsApplied",
  "behaviorSignals",
  "behaviorScore",
] as const;

/** Mongoose exclusion projection for a seeker's application query. */
export const SEEKER_APPLICATION_PROJECTION = SEEKER_HIDDEN_APPLICATION_FIELDS.map((f) => `-${f}`).join(" ");

/** Returns a copy of a lean application without the recruiter-only keys. */
export function stripSeekerHiddenFields<T extends object>(app: T): T {
  const copy = { ...app } as Record<string, unknown>;
  for (const key of SEEKER_HIDDEN_APPLICATION_FIELDS) delete copy[key];
  return copy as T;
}
