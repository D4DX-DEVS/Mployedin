import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import JobSeeker from "@/models/JobSeeker";
import Application from "@/models/Application";
import Notification from "@/models/Notification";
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

  const [, seekerBefore] = await Promise.all([
    // Anonymize user account (the WhatsApp state went with eraseWhatsAppData)
    User.findByIdAndUpdate(userId, {
      name: "Deleted User",
      email: anonymizedEmail,
      phone: null,
      isActive: false,
      deletedAt: new Date(),
    }),
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
