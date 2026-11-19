/**
 * Which stored file is a seeker's "original CV" — one rule for the CV route
 * (the file it streams) and the export manifest (whether there is one, and
 * whether it is itself a Mployedin-built PDF).
 *
 *  - with an application (employer and admin screens, a seeker's own): the
 *    resume sent with it, else the Profile CV — see servedApplicationCvUrl;
 *  - otherwise (staff views, talent pool): the Profile CV, else the first
 *    resume document.
 *
 * Server only (servedApplicationCvUrl knows the storage addresses). Callers
 * pass the access gate's `application` as it came back: null where none applies.
 */
import { servedApplicationCvUrl } from "@/lib/applications/sentCv";
import { BUILT_CV_NAME } from "@/lib/cv/builtCvName";

/** The parts of the seeker's profile the rule reads. */
export interface OriginalCvSeeker {
  cv?: { originalUrl?: string | null } | null;
  documents?: ReadonlyArray<{
    category?: string;
    url?: string;
    /** Set on the stored copy of the CV built on Mployedin (cvChoice.ts). */
    builtHash?: string;
  }> | null;
}

/** The parts of the application the rule reads. */
export interface OriginalCvApplication {
  documents?: ReadonlyArray<{ name?: string; url?: string; type?: string }> | null;
}

export interface OriginalCvSource {
  /** The file the CV route serves; null when there is none. */
  url: string | null;
  /** The file is a PDF built on Mployedin, not one the seeker uploaded. */
  isBuilt: boolean;
}

function isMployedinBuilt(
  url: string,
  seeker: OriginalCvSeeker,
  application: OriginalCvApplication | null,
): boolean {
  if (seeker.documents?.some((d) => !!d.builtHash && d.url === url)) return true;
  return !!application?.documents?.some((d) => d.type === "resume" && d.url === url && BUILT_CV_NAME.test(d.name ?? ""));
}

export function resolveOriginalCvSource(
  seeker: OriginalCvSeeker,
  application: OriginalCvApplication | null,
): OriginalCvSource {
  let url: string | null | undefined;
  if (application) {
    url = servedApplicationCvUrl(application.documents, seeker.cv?.originalUrl);
  } else {
    const resumeDoc = seeker.documents?.find((d) => d.category === "resume" && d.url);
    url = seeker.cv?.originalUrl || resumeDoc?.url;
  }
  if (!url) return { url: null, isBuilt: false };
  return { url, isBuilt: isMployedinBuilt(url, seeker, application) };
}
