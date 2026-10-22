import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import JobSeeker from "@/models/JobSeeker";
import Application from "@/models/Application";
import Notification from "@/models/Notification";
import ConsentLog from "@/models/ConsentLog";
import WhatsAppMessageLog from "@/models/WhatsAppMessageLog";
import { deleteLiftedSuppressions } from "@/models/WhatsAppSuppression";
import { redactUserMessages } from "@/lib/gdpr/redactMessages";
import { deleteCvRecordsOfSeeker } from "@/lib/cv/cvDocuments";
import { toWaRecipient } from "@/lib/communications/whatsapp/phone";
import logger from "@/lib/logger";

/**
 * The WhatsApp part of an erasure, shared by the admin erasure below and the
 * job seeker's own account deletion (api/job-seekers/account): the delivery log
 * rows, the number's STOP-list entries that are no longer in force, then the
 * whole `whatsapp` subdocument (wa_id, consent, window, STOP, START code).
 *
 * Log rows hold the subject's number in `to`, and some are owned by another user
 * (an admin's test send stamps the admin's id), so they are deleted by number as
 * well as by userId. Run it before the phone is nulled: after that nothing links
 * such a row to the subject. A failure throws before the subdocument is cleared,
 * so a retry still has the number.
 *
 * A WhatsAppSuppression entry whose STOP is still in force is kept on purpose:
 * a STOP belongs to the number, not the account, and must outlive it (the next
 * account to type the number must not message it again). An entry a newer
 * START lifted suppresses nothing (a START keeps it, with `liftedAt`, only so a
 * late redelivered STOP cannot list the number again), so it is deleted rather
 * than keep the erased person's number for no purpose. The same rule every send
 * reads decides which is which (deleteLiftedSuppressions).
 */
export async function eraseWhatsAppData(userId: string): Promise<void> {
  const subject = await User.findById(userId).select("phone whatsapp.waId").lean<{ phone?: string | null; whatsapp?: { waId?: string } } | null>();
  const numbers = new Set<string>();
  // A legacy or hand-edited document may hold something other than a string: it must not crash the erasure.
  const phone = typeof subject?.phone === "string" ? subject.phone : undefined;
  const normalised = toWaRecipient(phone);
  if (normalised) numbers.add(`+${normalised}`);
  if (subject?.whatsapp?.waId) numbers.add(`+${subject.whatsapp.waId}`);
  // Invalid-phone skipped rows keep the raw input (whatsapp/send.ts).
  if (phone?.trim()) numbers.add(phone);
  // The scan by `to` uses the { to, sentAt } index (the per-number daily cap's).
  if (numbers.size) await WhatsAppMessageLog.deleteMany({ to: { $in: [...numbers] } });
  await WhatsAppMessageLog.deleteMany({ userId });
  await deleteLiftedSuppressions([...numbers]);
  await User.updateOne({ _id: userId }, { $unset: { whatsapp: 1 } });
}

/**
 * Every secret and one-time code an account can hold: the password hash, the
 * e-mail verification, e-mail change and password reset tokens, the 2FA
 * secrets, the LinkedIn access token and the calendar feed token. An erased
 * account must not be signed into, reset or read through any of them.
 */
export const ERASED_ACCOUNT_SECRETS = [
  "passwordHash",
  "emailVerificationToken",
  "emailVerificationOtp",
  "emailVerificationExpiry",
  "pendingEmail",
  "emailChangeToken",
  "emailChangeExpires",
  "passwordResetToken",
  "passwordResetExpiry",
  "passwordResetAttempts",
  "linkedinAccessToken",
  "twoFactorSecretEnc",
  "twoFactorPendingSecretEnc",
  "twoFactorRecoveryCodes",
  "calendarFeedToken",
] as const;

/**
 * Deletes the profile photo object when it is in our own bucket (an upload, or a
 * Google/LinkedIn photo re-hosted at sign-in: avatars are in the PUBLIC part of
 * the bucket, so the copy stays downloadable until it is deleted). A provider's
 * own URL is not ours to delete. Best effort: a storage failure is logged, never
 * fatal, because the account no longer points at the object.
 */
export async function eraseStoredAvatar(avatar: string | null | undefined, userId: string): Promise<void> {
  if (typeof avatar !== "string" || !avatar.trim()) return;
  const { deleteFile, urlToKey } = await import("@/lib/storage/spaces");
  // urlToKey strips our bucket's CDN base; an address it leaves unchanged is someone else's.
  if (urlToKey(avatar) === avatar) {
    if (/digitaloceanspaces\.com/i.test(avatar)) {
      logger.warn({ userId, avatar }, "[gdpr] erasure left a profile photo on another storage host; delete it by hand");
    }
    return;
  }
  try {
    await deleteFile(avatar);
  } catch (err) {
    logger.warn({ err, userId, avatar }, "[gdpr] erasure could not delete the stored profile photo");
  }
}

/**
 * The person's consent rows stay as the evidence of each choice (UK GDPR
 * Art 7(1); kept under Art 17(3)(e)): the type, granted, policy version, choice
 * reference, source and dates. What identifies the person beyond the account id
 * goes: the name becomes "Deleted User", and the IP address and user agent are
 * removed. [LEGAL] the solicitor confirms this scope (owner list).
 */
export async function anonymiseConsentLogs(userId: string): Promise<void> {
  await ConsentLog.updateMany({ userId }, { $set: { userName: "Deleted User" }, $unset: { ipAddress: 1, userAgent: 1 } });
}

/**
 * Erase all personal data for a user — anonymize their account,
 * delete their profile, notifications, and uploaded files per GDPR.
 * @param userId The user ID to erase
 * @returns The anonymized email address for the register
 * @throws On erasure failure
 */
export async function eraseUserPersonalData(userId: string): Promise<{ anonymizedEmail: string }> {
  await connectDB();

  const anonymizedEmail = `deleted_${userId}@anonymized.mployedin.com`;

  // The WhatsApp data first: it is found by the phone the anonymisation below nulls. Done before any other
  // write, so erasure can be retried (admin/gdpr/[id]) with the number still there.
  await eraseWhatsAppData(userId);

  const [userBefore, seekerBefore] = await Promise.all([
    // Anonymize user account (the WhatsApp state went with eraseWhatsAppData). findByIdAndUpdate returns the
    // PRE-update document, so `userBefore` still has the photo address for the storage delete below.
    User.findByIdAndUpdate(userId, {
      $set: {
        name: "Deleted User",
        email: anonymizedEmail,
        phone: null,
        avatar: null,
        isActive: false,
        deletedAt: new Date(),
      },
      $unset: Object.fromEntries(ERASED_ACCOUNT_SECRETS.map((field) => [field, 1])),
    }).select("avatar").lean<{ avatar?: string | null } | null>(),
    // Delete job seeker profile data. Field names MUST match the schema exactly
    // or $unset silently no-ops: `cv` (holds originalUrl + parsed resume text)
    // and `experience` were previously misnamed `cvUrl`/`workExperience`, so
    // that PII survived "erasure". Also clear financial PII (bank/IBAN).
    // findOneAndUpdate returns the PRE-update doc, so `seekerBefore` still
    // carries cv.originalUrl for the storage hard-delete below.
    JobSeeker.findOneAndUpdate(
      { userId },
      {
        $unset: {
          cv: 1,
          skills: 1,
          experience: 1,
          education: 1,
          languages: 1,
          nationality: 1,
          passportNumber: 1,
          bankAccountNumber: 1,
          iban: 1,
          documents: 1,
        },
      },
    ).select("cv documents").lean<{ _id?: unknown; cv?: { originalUrl?: string }; documents?: { url?: string }[] } | null>(),
    // Delete notifications
    Notification.deleteMany({ userId }),
  ]);

  // Their name, IP address and user agent on the consent rows. Not caught: a failure fails the erasure, and the
  // request stays in progress for the admin to retry (every step here is safe to run twice).
  await anonymiseConsentLogs(userId);

  // Messages the user wrote, and their name on other people's conversation lists.
  try {
    await redactUserMessages(userId);
  } catch (err) {
    // The account is already deactivated, so the user can't retry: record it for staff.
    logger.error({ err, userId }, "[gdpr] message redaction failed during erasure");
  }

  // Hard-delete uploaded files from storage — DB erasure alone left the objects
  // behind. Best-effort: a storage failure must not fail the erasure itself
  // (fields are already unset; the bucket is private). Besides the CV, the
  // seeker's document library and every application attachment are theirs too,
  // and stayed downloadable by employers after erasure.
  const fileUrls = [
    seekerBefore?.cv?.originalUrl,
    ...(seekerBefore?.documents ?? []).map((d) => d.url),
  ];
  if (seekerBefore?._id) {
    const applications = await Application.find({ jobSeekerId: seekerBefore._id })
      .select("documents")
      .lean<{ documents?: { url?: string }[] }[]>();
    fileUrls.push(...applications.flatMap((a) => (a.documents ?? []).map((d) => d.url)));
    await Application.updateMany({ jobSeekerId: seekerBefore._id }, { $set: { documents: [] } });
  }
  const { deleteFile } = await import("@/lib/storage/spaces");
  for (const url of new Set(fileUrls.filter((u): u is string => Boolean(u)))) {
    try {
      await deleteFile(url);
    } catch (err) {
      // Best-effort, but the DB no longer references this object: the log line
      // is the only record left of what still needs deleting from the bucket.
      logger.warn({ err, userId, url }, "[gdpr] erasure could not delete stored file");
    }
  }
  await eraseStoredAvatar(userBefore?.avatar, userId);
  // The CV records hold each CV's full text and what was read from it.
  if (seekerBefore?._id) {
    try {
      await deleteCvRecordsOfSeeker(seekerBefore._id as string);
    } catch (err) {
      logger.error({ err, userId }, "[gdpr] erasure could not delete CV records");
    }
  }

  return { anonymizedEmail };
}
