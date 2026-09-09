import type { JobStatus } from "@/models/Job";

/**
 * The only status moves a client may ask for (workspace spec §3.12).
 *
 * Closed is final — decision 5 was "no reopen"; a support case reopens a job
 * in the database, not through the UI. Expired → active is an extension, so
 * the request must also move the deadline forward or drop it (see
 * `expiryExtended`), or the nightly sweep expires the job again.
 */
export const JOB_STATUS_TRANSITIONS: Readonly<Record<JobStatus, readonly JobStatus[]>> = {
  draft: ["active"],
  active: ["paused", "closed"],
  paused: ["active", "closed"],
  expired: ["active"],
  closed: [],
};

/** Same-status writes are allowed: editors resend the current status with every save. */
export function canTransitionJobStatus(from: JobStatus, to: JobStatus): boolean {
  if (from === to) return true;
  return (JOB_STATUS_TRANSITIONS[from] ?? []).includes(to);
}

/** `null` clears the deadline; a string must be a future date. Anything else is not an extension. */
export function expiryExtended(expiresAt: unknown): boolean {
  if (expiresAt === null) return true;
  if (typeof expiresAt !== "string") return false;
  const ts = new Date(expiresAt).getTime();
  return Number.isFinite(ts) && ts > Date.now();
}
