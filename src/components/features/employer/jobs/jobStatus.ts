/**
 * Job status presentation shared by the jobs list and the job workspace so the
 * two adjacent screens always agree ("Live", not "Active"). Label keys live in
 * the `employerJobs` namespace.
 */
export type JobStatus = "draft" | "active" | "paused" | "closed" | "expired";

export const JOB_STATUS_BADGE_CLASS: Record<string, string> = {
  active: "bg-status-selected-bg text-emerald-700 border-status-selected/20",
  draft: "bg-status-shortlisted-bg text-status-shortlisted border-status-shortlisted/20",
  paused: "bg-status-applied-bg text-status-applied border-border",
  closed: "bg-muted text-muted-foreground",
  expired: "bg-status-rejected-bg text-status-rejected border-status-rejected/20",
};

const JOB_STATUS_LABEL_KEYS: Record<string, string> = {
  active: "statusLabelActive",
  draft: "statusLabelDraft",
  paused: "statusLabelPaused",
  closed: "statusLabelClosed",
  expired: "statusLabelExpired",
};

/** `employerJobs.*` key for a job status; unknown statuses read as Draft. */
export function jobStatusLabelKey(status: string): string {
  return JOB_STATUS_LABEL_KEYS[status] ?? "statusLabelDraft";
}
