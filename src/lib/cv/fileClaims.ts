/**
 * A seeker's file must not be deleted while an application is being created
 * with it.
 *
 * releaseSeekerFile keeps any file an application already lists, but that is
 * a check followed by a delete: an application created in between (applying
 * in one tab while the CV is replaced or deleted in another) ended up pointing
 * at a file that no longer existed.
 *
 * Both sides now act on the seeker's own record, where MongoDB applies writes
 * one at a time:
 *  - claimSeekerFiles stamps `attachedAt` on each file just before the
 *    application is saved;
 *  - removeSeekerDocuments / the Profile CV upload take the entry off the
 *    record in one atomic write and read it as it was.
 * Either the claim lands first — the removal sees the stamp and keeps the
 * file — or the removal lands first — the claim finds nothing and the
 * application is refused ("choose your CV again") instead of being saved with
 * an address whose file is about to go.
 *
 * Server only.
 */
import JobSeeker from "@/models/JobSeeker";
import { releaseSeekerFile } from "@/lib/cv/cvDocuments";
import logger from "@/lib/logger";

type Id = unknown;

/**
 * How long a claim keeps a file. Saving an application takes a second or two;
 * after this, releaseSeekerFile's own check — is it in an application? — is
 * the answer again, so a claim whose application was never saved (a duplicate,
 * a crash) does not keep the file forever.
 */
export const CLAIM_HOLD_MS = 10 * 60 * 1000;

/** Whether a file stamped at `attachedAt` may still be on its way into an application. */
export function isClaimHeld(attachedAt: Date | string | null | undefined, now: number = Date.now()): boolean {
  if (!attachedAt) return false;
  const at = new Date(attachedAt).getTime();
  return Number.isFinite(at) && now - at < CLAIM_HOLD_MS;
}

/**
 * Stamp the seeker's files an application is about to carry: uploaded
 * documents and the Profile CV. Returns the addresses that are no longer on
 * the seeker's record — removed since they were read. The caller does not
 * save the application with those.
 *
 * Pass only addresses taken from the seeker's own record (a portfolio link,
 * say, is not one, and would come back as missing).
 */
export async function claimSeekerFiles(jobSeekerId: Id, urls: ReadonlyArray<string>): Promise<string[]> {
  const missing: string[] = [];
  const now = new Date();
  // timestamps: false — attaching a file is not an edit of the profile.
  // strict: false — the stamp must never be dropped. A process still holding
  // an older JobSeeker schema (a dev server before restart, an old instance
  // during a deploy) strips unknown paths, leaves an empty update that is not
  // sent, and every claim would read as "file removed", refusing every apply.
  const options = { timestamps: false, strict: false } as const;
  for (const url of new Set(urls.filter(Boolean))) {
    const asDocument = await JobSeeker.updateOne(
      { _id: jobSeekerId, "documents.url": url },
      { $set: { "documents.$.attachedAt": now } },
      options,
    );
    if (asDocument.matchedCount > 0) continue;
    const asProfileCv = await JobSeeker.updateOne(
      { _id: jobSeekerId, "cv.originalUrl": url },
      { $set: { "cv.attachedAt": now } },
      options,
    );
    if (asProfileCv.matchedCount > 0) continue;
    missing.push(url);
  }
  return missing;
}

type StoredDocument = { id?: string; url?: string; attachedAt?: Date | string };

/**
 * Release a file the seeker no longer holds — unless an application may be
 * being saved with it right now. Never throws: the seeker's change is already
 * made, and a file left behind costs only storage.
 */
export async function releaseUnlessClaimed(
  jobSeekerId: Id,
  file: { url?: string | null; attachedAt?: Date | string | null },
): Promise<void> {
  if (!file.url || isClaimHeld(file.attachedAt)) return;
  try {
    // This file takes the id as it comes off a record; releaseSeekerFile wants
    // a string or ObjectId. The string form is the same id to the database.
    await releaseSeekerFile(String(jobSeekerId), file.url);
  } catch (err) {
    logger.warn({ err, jobSeekerId: String(jobSeekerId) }, "[cv] could not release a removed file");
  }
}

/**
 * Take these documents off the seeker's record and release their files.
 * Returns the documents that were removed (as they were stored).
 */
export async function removeSeekerDocuments(jobSeekerId: Id, ids: ReadonlyArray<string>): Promise<StoredDocument[]> {
  if (ids.length === 0) return [];
  const before = (await JobSeeker.findOneAndUpdate(
    { _id: jobSeekerId },
    { $pull: { documents: { id: { $in: [...ids] } } } },
    { new: false, projection: { documents: 1 } },
  ).lean()) as { documents?: StoredDocument[] } | null;
  const removed = (before?.documents ?? []).filter((d) => d.id && ids.includes(d.id));
  for (const doc of removed) await releaseUnlessClaimed(jobSeekerId, doc);
  return removed;
}
