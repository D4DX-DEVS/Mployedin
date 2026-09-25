/**
 * Employer-side-only fields on a Job document.
 *
 * `GET /api/jobs` (the public feed) and `GET /api/jobs/[id]` both returned the
 * whole document, so any signed-in user — a job seeker reading a posting —
 * received `applicantIds`, i.e. the ids of every other candidate who had
 * applied, alongside the employer's internal workflow and matching config.
 * Strip these before handing a job to a caller who does not own it.
 */
export const PRIVATE_JOB_FIELDS = [
  "applicantIds",
  "agentId",
  "workflow",
  "workflowMode",
  "matchingWeights",
  // Which screening answers qualify — shipping it would hand seekers the key.
  "screeningKnockouts",
  "pauseReason",
  "preDeletionStatus",
  "clonedFrom",
] as const;

/** Delete every employer-only field from a lean job document, in place. */
export function stripPrivateJobFields<T extends Record<string, unknown>>(job: T): T {
  for (const field of PRIVATE_JOB_FIELDS) {
    delete job[field];
  }
  return job;
}
