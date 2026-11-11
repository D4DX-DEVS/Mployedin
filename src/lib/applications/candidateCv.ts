/**
 * Which CV an employer's candidate row opens.
 *
 * A row that comes from an application (a job is selected) opens the CV sent
 * with that application; a talent-pool row has no application and opens the
 * seeker's Profile CV. The rows used to be keyed on the Profile CV alone, so
 * an applicant whose CV was an uploaded resume or the one built on Mployedin
 * showed no CV, and one with both showed the wrong file.
 */

export interface CandidateCvSource {
  _id: string;
  cv?: { originalUrl?: string };
  /** Set when the row's application was sent with a CV. */
  applicationCv?: { applicationId: string; extension: string };
}

/** The file extension of a stored file's URL, for the viewer's PDF/image detection. */
export function fileExtensionOf(url: string | undefined): string {
  return url?.split("?")[0].split(".").pop()?.toLowerCase() || "pdf";
}

/** Whether "View CV" has a file to open for this row. */
export function candidateHasCv(candidate: CandidateCvSource): boolean {
  return Boolean(candidate.applicationCv || candidate.cv?.originalUrl);
}

/**
 * Where this row's CV is read from, streamed inline through our own origin.
 * The hash keeps the viewer's PDF/image detection working without reaching
 * the server. Null when there is no CV.
 */
export function candidateCvHref(candidate: CandidateCvSource): string | null {
  if (candidate.applicationCv) {
    const { applicationId, extension } = candidate.applicationCv;
    return `/api/employers/candidates/${candidate._id}/cv?applicationId=${applicationId}#cv.${extension}`;
  }
  if (candidate.cv?.originalUrl) {
    return `/api/employers/candidates/${candidate._id}/cv#cv.${fileExtensionOf(candidate.cv.originalUrl)}`;
  }
  return null;
}
