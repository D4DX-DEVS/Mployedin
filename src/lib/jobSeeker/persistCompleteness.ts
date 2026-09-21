/**
 * Score a seeker document and write the result back.
 *
 * Kept apart from `profileCompleteness.ts` so the formula itself stays a pure
 * function with no model import — the scorer is unit-tested against plain
 * objects, this thin wrapper is the only part that touches Mongo.
 *
 * Every route that writes a field the formula reads should call this. The
 * routes that did not (`/api/job-seekers/settings`, `/api/job-seekers/profile`)
 * are why the stored figure drifted from the one the profile page computes.
 */

import JobSeeker from "@/models/JobSeeker";
import logger from "@/lib/logger";
import {
  profileCompletenessScore,
  type ProfileCompletenessInput,
} from "./profileCompleteness";

/**
 * @param userId the seeker's user id
 * @param doc    the seeker document *after* the write (a hydrated doc, a lean
 *               object, or `null` — in which case it is re-read)
 * @returns the score written, or null when the seeker could not be resolved
 */
export async function recomputeCompleteness(
  userId: string,
  doc?: unknown,
): Promise<number | null> {
  try {
    const toPlain = (d: unknown): ProfileCompletenessInput | null => {
      if (!d) return null;
      const o = d as { toObject?: () => unknown };
      return (typeof o.toObject === "function" ? o.toObject() : o) as ProfileCompletenessInput;
    };

    let plain = toPlain(doc);
    // `userId` is worth 10 points on its own, so any real seeker document
    // scores at least 10. A doc without it is not the document we think it is
    // — a driver that returned a write result instead of the record, say — and
    // scoring it would persist a 0, which is exactly the drift this module
    // exists to stop. Re-read instead of trusting it.
    if (!plain?.userId) {
      plain = toPlain(await JobSeeker.findOne({ userId }).lean());
    }
    if (!plain?.userId) return null;

    const score = profileCompletenessScore(plain);
    await JobSeeker.updateOne({ userId }, { $set: { profileCompleteness: score } });
    return score;
  } catch (err) {
    // A completeness figure is never worth failing the user's save over.
    logger.warn({ err, userId }, "[profile-completeness] recompute failed");
    return null;
  }
}
