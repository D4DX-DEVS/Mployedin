/**
 * The CV file an employer is served for one application.
 *
 * It is the resume sent with the application, else the seeker's Profile CV
 * (applicationCvUrlOf). One more condition applies here: the resume must be a
 * file in our own storage. A seeker can add a document to an application by
 * typing a link, of any type — a "resume" that is a link to another site is
 * shown as that link and is not a file the CV routes can serve.
 *
 * Server only (it knows the storage addresses).
 */
import { applicationCvUrlOf } from "@/lib/cv/parsedCv";
import { isStoredFileUrl } from "@/lib/storage/spaces";

type SentDocument = { url?: string; type?: string };

function storedResumes(documents: ReadonlyArray<SentDocument> | null | undefined): SentDocument[] {
  return (documents ?? []).filter((doc) => doc.type === "resume" && !!doc.url && isStoredFileUrl(doc.url));
}

/** Whether a CV file was sent with this application. */
export function hasSentCvFile(documents: ReadonlyArray<SentDocument> | null | undefined): boolean {
  return storedResumes(documents).length > 0;
}

/** The file the CV routes serve for this application; null when there is none. */
export function servedApplicationCvUrl(
  documents: ReadonlyArray<SentDocument> | null | undefined,
  profileCvUrl: string | null | undefined,
): string | null {
  return applicationCvUrlOf(storedResumes(documents), profileCvUrl);
}
