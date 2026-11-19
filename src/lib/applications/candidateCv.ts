/**
 * Which CV an employer's candidate row opens.
 *
 * A row that comes from an application (a job is selected) opens the CV sent
 * with that application; a talent-pool row has no application and opens the
 * seeker's Profile CV. The rows used to be keyed on the Profile CV alone, so
 * an applicant whose CV was an uploaded resume or the one built on Mployedin
 * showed no CV, and one with both showed the wrong file.
 */
import { BUILT_CV_NAME } from "@/lib/cv/builtCvName";
import { withDownloadFlag } from "@/lib/cv/downloadFlag";

export interface CandidateCvSource {
  _id: string;
  cv?: { originalUrl?: string };
  /** Set when the row's application was sent with a CV. */
  applicationCv?: { applicationId: string; extension: string };
  /** The profile holds enough to draw the Standardised CV (hasBuiltCvContent): no upload needed. */
  canBuildCv?: boolean;
  /**
   * Talent-pool rows only: whether the CV route would serve this seeker to the viewer
   * (an application to one of their jobs, or one of their talent pools). False = no
   * View CV and no Original link, which would only answer "couldn't be found". Unset
   * on application rows, which are accessible by definition.
   */
  cvAccessible?: boolean;
}

/** The file extension of a stored file's URL, for the viewer's PDF/image detection. */
export function fileExtensionOf(url: string | undefined): string {
  return url?.split("?")[0].split(".").pop()?.toLowerCase() || "pdf";
}

/**
 * Whether "View CV" has something to open for this row: a file, or a profile
 * the Standardised CV can be drawn from. The viewer shows whichever exists.
 */
export function candidateHasCv(candidate: CandidateCvSource): boolean {
  if (candidate.cvAccessible === false) return false;
  return Boolean(candidate.applicationCv || candidate.cv?.originalUrl || candidate.canBuildCv);
}

/**
 * The address "View CV" opens in the viewer. The candidate CV route is the one
 * URL that has a Standardised CV beside any file, so a row with only a built CV
 * opens it too (the viewer finds there is no original and shows the built one).
 * Null when there is nothing to open.
 */
export function candidateViewCvHref(candidate: CandidateCvSource): string | null {
  if (candidate.cvAccessible === false) return null;
  return candidateCvHref(candidate) ?? (candidate.canBuildCv ? `/api/employers/candidates/${candidate._id}/cv#cv.pdf` : null);
}

/**
 * Where this row's uploaded file is read from, streamed inline through our own
 * origin. The hash keeps the viewer's PDF/image detection working without
 * reaching the server. Null when there is no file (a built CV is not one).
 */
export function candidateCvHref(candidate: CandidateCvSource): string | null {
  if (candidate.cvAccessible === false) return null;
  if (candidate.applicationCv) {
    const { applicationId, extension } = candidate.applicationCv;
    return `/api/employers/candidates/${candidate._id}/cv?applicationId=${applicationId}#cv.${extension}`;
  }
  if (candidate.cv?.originalUrl) {
    return `/api/employers/candidates/${candidate._id}/cv#cv.${fileExtensionOf(candidate.cv.originalUrl)}`;
  }
  return null;
}

/**
 * The "Original CV" menu link: the same file as candidateCvHref, but opened in a
 * new tab to keep, so it is an actual download and carries `download=1` (the CV
 * route counts that; the viewer's preview, candidateViewCvHref, never carries it).
 */
export function candidateOriginalDownloadHref(candidate: CandidateCvSource): string | null {
  return withDownloadFlag(candidateCvHref(candidate));
}

/**
 * The row as an applicant-review-only colleague (a company member with
 * canReviewApplicants but not canManageTalentPools) may use it. The CV route opens
 * a CV for them only through an application of their company, and a row's address
 * names one only when it carries `applicationCv` — so any other row is not openable.
 */
export function forApplicationOnlyViewer<T extends CandidateCvSource>(candidate: T): T {
  return candidate.applicationCv ? candidate : { ...candidate, cvAccessible: false };
}

/** Hosts our own storage is served from, as far as the browser can tell (the server knows exactly; see sentCv.ts). */
function isOwnStorageHost(host: string): boolean {
  const publicHost = (process.env.NEXT_PUBLIC_R2_PUBLIC_HOST ?? "").replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
  return (
    (publicHost !== "" && host === publicHost) ||
    host.endsWith(".digitaloceanspaces.com") ||
    host.endsWith(".r2.dev") ||
    host.endsWith(".r2.cloudflarestorage.com")
  );
}

/**
 * Whether a URL could be a file in our own storage rather than a link to another
 * site. The browser cannot know the storage addresses for certain, so this is
 * generous: a relative path, a known storage host, or the host of a file already
 * known to be stored (the Profile CV) counts.
 */
function looksLikeStoredFile(url: string, knownStoredUrl?: string): boolean {
  if (!/^[a-z][a-z\d+.-]*:/i.test(url)) return true; // not absolute: ours
  try {
    const host = new URL(url).host.toLowerCase();
    if (isOwnStorageHost(host)) return true;
    return !!knownStoredUrl && new URL(knownStoredUrl).host.toLowerCase() === host;
  } catch {
    return false;
  }
}

export interface SentCvFile {
  /** The candidate CV route has a file to serve for this application. */
  servable: boolean;
  /** That file is the PDF built on Mployedin that was sent with the application, not an upload. */
  built: boolean;
}

/**
 * What "Original CV" would open for an application: the resume sent with it, else
 * the Profile CV. A resume that is a link to another site is not served (the route
 * skips it and falls back to the Profile CV), so with no Profile CV there is
 * nothing to open.
 */
export function sentCvFileOf(
  documents: ReadonlyArray<{ name?: string; url?: string; type?: string }> | null | undefined,
  profileCvUrl: string | undefined,
): SentCvFile {
  const resume = documents?.find((doc) => doc.type === "resume" && doc.url);
  const built = !!resume && BUILT_CV_NAME.test(resume.name ?? "");
  const sentIsFile = !!resume?.url && (built || looksLikeStoredFile(resume.url, profileCvUrl));
  return { servable: sentIsFile || !!profileCvUrl, built: sentIsFile && built };
}
