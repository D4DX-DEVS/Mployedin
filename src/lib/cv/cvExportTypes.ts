/**
 * The bulk CV export's manifest: what POST /api/cv-export/manifest is sent and
 * what it answers. Types and one constant only, so the export dialog can import
 * them without pulling in anything from the server.
 *
 * The browser asks the manifest which of the selected candidates it may export
 * and which CV versions exist, then fetches the files through the CV route
 * (`originalUrl` / `builtUrl`), which applies the same gate again.
 */

import type { CvExportVersionName, JobApplicationSummary, JobExportSummary } from "@/lib/cv/cvExportHistory";

/** The most candidates one export may cover (owner decision 4A). */
export const CV_EXPORT_MAX_ITEMS = 50;

/** One selected candidate. `applicationId` is set where the list is of applicants. */
export interface CvExportManifestRequestItem {
  seekerId: string;
  applicationId?: string | null;
}

export interface CvExportManifestRequest {
  /** 1 to CV_EXPORT_MAX_ITEMS items; 24-hex ids. */
  items: CvExportManifestRequestItem[];
  /**
   * The job these CVs are exported for (admin only; ignored for other roles).
   * Recorded with the export, and the answer says who already has a CV for it.
   */
  jobId?: string | null;
}

/**
 * A candidate the person may not open. Only the ids come back — never a name,
 * and nothing that says whether the candidate exists. `seekerId` and
 * `applicationId` are the ones that were sent.
 */
export interface CvExportDeniedItem {
  seekerId: string;
  applicationId?: string;
  denied: true;
}

/** A candidate the person may export, and what exists for them. */
export interface CvExportAllowedItem {
  /** The candidate's profile id (taken from the profile read, not from the request). */
  seekerId: string;
  /** Echoes the id that was sent, when one was. */
  applicationId?: string;
  denied?: false;
  /** The profile's full name, else the account's; "" when neither is set (the ZIP names that file "Candidate {last6(id)}"). */
  name: string;
  /** The Mployedin CV can be made: the profile holds experience, education, skills or a summary. */
  hasStandardised: boolean;
  /**
   * There is an original CV file to fetch. With `applicationId` (employer and
   * admin) it is the CV sent with that application, else the profile's file.
   */
  hasOriginal: boolean;
  /**
   * The original is itself a PDF built on Mployedin (the seeker applied with
   * the CV they built). Always false when `hasOriginal` is false.
   *
   * It only drives a label. The UI shows "CV sent with application" only when
   * the row has an `applicationId` (an applicant list); without one the
   * original is the profile's file and keeps the ordinary "Original" label.
   */
  originalIsBuilt: boolean;
  /** Same-origin: `/api/employers/candidates/{seekerId}/cv[?applicationId=…]`. */
  originalUrl: string;
  /** Same-origin: `/api/employers/candidates/{seekerId}/cv?kind=built` (JSON the standardised PDF is drawn from). */
  builtUrl: string;
  /**
   * Only when a job was sent: this candidate's earlier CV exports for that job,
   * and their own application to it. Null where there is none.
   */
  forJob?: {
    exported: JobExportSummary | null;
    application: JobApplicationSummary | null;
  };
}

/** One row of the manifest, in the order the items were sent. */
export type CvExportManifestItem = CvExportAllowedItem | CvExportDeniedItem;

export interface CvExportManifestResponse {
  items: CvExportManifestItem[];
  /**
   * Names this export for the confirm call (POST /api/cv-export/complete),
   * sent once the ZIP is built with the candidates whose files are in it.
   * Absent when nobody could be exported.
   */
  batchId?: string;
}

/** POST /api/cv-export/complete: the candidates whose CV files really landed in the ZIP. */
export interface CvExportCompleteRequest {
  batchId: string;
  items: Array<{ seekerId: string; versions: CvExportVersionName[] }>;
}
