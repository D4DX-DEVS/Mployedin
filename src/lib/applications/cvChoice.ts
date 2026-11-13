/**
 * Which CV an application carries — one rule for every way of applying.
 *
 * A seeker can hold three kinds of CV: the Profile CV (`cv.originalUrl`), the
 * resumes they uploaded to their documents, and the CV they built on
 * Mployedin (profile + saved design; its stored copy is a resume document
 * marked `builtHash`). The apply screens used to preselect different ones, and
 * the paths with no screen (auto-apply, the assistant) attached none.
 *
 * The order, wherever nothing was chosen explicitly:
 *   0. the CV the seeker marked "send this one" on My CVs (`preferredCvId`),
 *      while it still exists;
 *   1. the Profile CV — the seeker's main CV, the one their profile was read from;
 *   2. the resume they uploaded most recently;
 *   3. the CV built on Mployedin.
 * Exactly one CV is sent. What the seeker did choose is never replaced by
 * another: a chosen file that is gone is refused (see the apply handlers).
 *
 * No server or browser imports: the apply dialogs and the API both use this.
 */

/** Apply-dialog key for the Profile CV. */
export const PROFILE_CV_KEY = "__profile_cv__";
/** Apply-dialog key for the CV built on Mployedin. */
export const BUILT_CV_KEY = "__built_cv__";

export interface SeekerDocumentLike {
  id?: string;
  name: string;
  url: string;
  category?: string;
  type?: string;
  /** Set on the stored copy of the built CV; absent on the seeker's own uploads. */
  builtHash?: string;
}

export interface ApplicationDocument {
  name: string;
  url: string;
  type: string;
}

const isResume = (d: SeekerDocumentLike) => (d.category ?? d.type) === "resume";

/** The resumes the seeker uploaded themselves, oldest first — not the stored built CV. */
export function uploadedResumes<T extends SeekerDocumentLike>(documents: readonly T[] | null | undefined): T[] {
  return (documents ?? []).filter((d) => isResume(d) && !d.builtHash);
}

/**
 * The CV an apply screen preselects: a document id, PROFILE_CV_KEY,
 * BUILT_CV_KEY, or "" when the seeker has no CV at all.
 */
export function defaultCvKey(input: {
  documents: readonly SeekerDocumentLike[] | null | undefined;
  hasProfileCv: boolean;
  hasBuiltCv: boolean;
  /** The seeker's own pick from My CVs: a document id, PROFILE_CV_KEY or BUILT_CV_KEY. */
  preferredId?: string | null;
}): string {
  const preferred = input.preferredId;
  if (preferred) {
    if (preferred === PROFILE_CV_KEY && input.hasProfileCv) return PROFILE_CV_KEY;
    if (preferred === BUILT_CV_KEY && input.hasBuiltCv) return BUILT_CV_KEY;
    if (uploadedResumes(input.documents).some((d) => d.id === preferred)) return preferred;
  }
  if (input.hasProfileCv) return PROFILE_CV_KEY;
  const newest = uploadedResumes(input.documents).at(-1);
  if (newest?.id) return newest.id;
  return input.hasBuiltCv ? BUILT_CV_KEY : "";
}

/**
 * The CV attached when an application is sent without the seeker choosing one
 * (auto-apply, the assistant, a client that named none). Empty when they have
 * no CV file. The built CV can only be sent here from its stored copy — it is
 * rendered in the browser, so a seeker who never sent it has none to attach.
 */
export function defaultApplicationCv(seeker: {
  documents?: readonly SeekerDocumentLike[] | null;
  cv?: { originalUrl?: string | null } | null;
  /** The seeker's own pick from My CVs (see `defaultCvKey`). */
  preferredCvId?: string | null;
} | null | undefined): ApplicationDocument[] {
  const profileCvUrl = seeker?.cv?.originalUrl;
  const preferred = seeker?.preferredCvId;
  if (preferred) {
    if (preferred === PROFILE_CV_KEY && profileCvUrl) return [{ name: "CV", url: profileCvUrl, type: "resume" }];
    const builtCopy = (seeker?.documents ?? []).filter((d) => isResume(d) && !!d.builtHash).at(-1);
    if (preferred === BUILT_CV_KEY && builtCopy?.url) return [{ name: builtCopy.name, url: builtCopy.url, type: "resume" }];
    const chosen = uploadedResumes(seeker?.documents).find((d) => d.id === preferred);
    if (chosen?.url) return [{ name: chosen.name, url: chosen.url, type: "resume" }];
  }
  // "CV" is the name applications have always given the Profile CV.
  if (profileCvUrl) return [{ name: "CV", url: profileCvUrl, type: "resume" }];

  const documents = seeker?.documents ?? [];
  const pick =
    uploadedResumes(documents).at(-1) ??
    documents.filter((d) => isResume(d) && !!d.builtHash).at(-1);
  return pick?.url ? [{ name: pick.name, url: pick.url, type: "resume" }] : [];
}

/**
 * Every application carries a CV: employers read it first, and one sent
 * without it is skipped. Each apply path refuses with this code when the
 * seeker has none (the apply screens map it to their own copy).
 */
export const CV_REQUIRED_CODE = "CV_REQUIRED";
export const CV_REQUIRED_MESSAGE = "Add your CV to apply. Upload one, or build one on My CVs.";

/* ── Accepted CV files ──
   One list for the file pickers and the upload routes. The pickers used to
   offer legacy .doc, which every route then refused. */

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** MIME types the CV upload routes accept (lib/security/file-validation.ts `cv`). */
export const CV_UPLOAD_MIME_TYPES = [
  "application/pdf",
  DOCX_MIME,
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** The same set as a file input's `accept`. */
export const CV_UPLOAD_ACCEPT = ".pdf,.docx,.jpg,.jpeg,.png,.webp";

const CV_UPLOAD_EXTENSIONS = CV_UPLOAD_ACCEPT.split(",");

/**
 * Whether a picked file is one the server will take. Browsers leave `type`
 * empty for some files, so an empty type is judged by the extension.
 */
export function isAcceptedCvFile(file: { name: string; type: string }): boolean {
  if (file.type) return (CV_UPLOAD_MIME_TYPES as readonly string[]).includes(file.type);
  const name = file.name.toLowerCase();
  return CV_UPLOAD_EXTENSIONS.some((ext) => name.endsWith(ext));
}
