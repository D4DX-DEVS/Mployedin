/**
 * Cancel one interview the way a calendar client understands it.
 *
 * DELETE used to flip the status and stop there: no SEQUENCE bump and no
 * METHOD:CANCEL, so the event stayed in the candidate's calendar. The PATCH
 * path did bump and resend, but then also sent a second "cancelled" email. This
 * is now the only cancel path: bump `icsSequence`, send the ICS CANCEL (which is
 * the email), and leave an in-app notice.
 */

import type mongoose from "mongoose";
import Interview from "@/models/Interview";
import JobSeeker from "@/models/JobSeeker";
import Job from "@/models/Job";
import { sendInterviewInvite } from "@/lib/interviews/sendInvite";
import { notify } from "@/lib/notifications/trigger";
import { getUserLocale, localePath } from "@/lib/i18n/localePath";
import logger from "@/lib/logger";

/** Statuses an interview can still be cancelled from. */
export const CANCELLABLE_INTERVIEW_STATUSES = ["scheduled", "confirmed", "rescheduled"] as const;

export interface CancelInterviewOptions {
  /** Leave an in-app notice for the candidate. The ICS CANCEL email is sent either way. */
  notifyCandidate?: boolean;
  /** In-app notice body; defaults to "cancelled by the employer". */
  message?: string;
}

/**
 * Returns true when this call cancelled the interview, false when it was not
 * open (already cancelled or completed) or does not exist.
 */
export async function cancelInterview(
  interviewId: string | mongoose.Types.ObjectId,
  { notifyCandidate = true, message }: CancelInterviewOptions = {},
): Promise<boolean> {
  const cancelled = (await Interview.findOneAndUpdate(
    { _id: interviewId, status: { $in: [...CANCELLABLE_INTERVIEW_STATUSES] } },
    // A calendar client ignores an update whose SEQUENCE has not moved.
    { $set: { status: "cancelled" }, $inc: { icsSequence: 1 } },
    { new: true },
  )
    .select("jobSeekerId jobId")
    .lean()) as { _id: unknown; jobSeekerId?: unknown; jobId?: unknown } | null;
  if (!cancelled) return false;

  try {
    const [seeker, job] = await Promise.all([
      JobSeeker.findById(cancelled.jobSeekerId).select("userId").lean() as Promise<{ userId?: unknown } | null>,
      Job.findById(cancelled.jobId).select("title").lean() as Promise<{ title?: string } | null>,
    ]);
    const seekerUserId = seeker?.userId ? String(seeker.userId) : null;
    const locale = await getUserLocale(seekerUserId);

    // The ICS CANCEL is the email. Fire and forget: the cancellation is saved.
    void sendInterviewInvite(String(cancelled._id), locale).catch(() => {});

    if (notifyCandidate && seekerUserId) {
      const jobTitle = job?.title ?? "a position";
      await notify({
        userId: seekerUserId,
        type: "interview_update",
        title: "Interview Cancelled",
        message: message ?? `Your interview for "${jobTitle}" has been cancelled by the employer.`,
        link: localePath(locale, "/job-seeker/interviews"),
        // The calendar cancellation above already went by email.
        sendEmail: false,
        metadata: { jobTitle, interviewId: String(cancelled._id) },
      });
    }
  } catch (err) {
    logger.error({ err, interviewId: String(interviewId) }, "Interview cancelled but the candidate could not be told");
  }

  return true;
}
