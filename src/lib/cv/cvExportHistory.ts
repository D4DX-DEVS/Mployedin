/* Client-safe: types only. The reads are in cvExportHistory.server.ts. */

export type CvExportVersionName = "standardised" | "original";

/** A seeker's CV exports for one job, as a list row shows them. */
export interface JobExportSummary {
  /** Completed exports of this seeker's CV for the job. */
  count: number;
  /** The newest one (ISO). */
  lastAt: string;
  /** Who did the newest one: display name, never an email. "" when the account is gone. */
  lastBy: string;
  lastVersions: CvExportVersionName[];
}

/** Where a seeker stands with one job: their application to it, if any. */
export interface JobApplicationSummary {
  applicationId: string;
  status: string;
  /** When the status last changed (ISO). */
  updatedAt: string;
}

/** The job the admin is finding seekers for, with its counts for the job bar. */
export interface SeekerJobContext {
  job: {
    id: string;
    title: string;
    company?: string;
    city?: string;
    country?: string;
    status: string;
    createdAt?: string;
  };
  /** Seekers who applied to it. */
  appliedCount: number;
  /** Distinct seekers whose CV was exported for it. */
  exportedCount: number;
}

/** One entry of a seeker's CV export history (profile page). */
export interface CvExportHistoryRow {
  id: string;
  at: string;
  by: string;
  byRole: string;
  /** Null for an export with no job chosen (and every export from before jobs were recorded). */
  job: { id: string; title: string; company?: string } | null;
  /** Empty for exports from before versions were recorded. */
  versions: CvExportVersionName[];
}
