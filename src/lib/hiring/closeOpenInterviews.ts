import mongoose from "mongoose";
import Interview from "@/models/Interview";
import { PIPELINE_STAGES } from "@/lib/hiring/pipeline";
import { sendInterviewInvite } from "@/lib/interviews/sendInvite";
import logger from "@/lib/logger";

/** Stages that only make sense once interviewing is behind the candidate. */
const PAST_INTERVIEWING: readonly string[] = PIPELINE_STAGES.slice(
  PIPELINE_STAGES.indexOf("interview_scheduled") + 1,
);

/**
 * Application statuses that leave no interview for the candidate to attend:
 * past interviewing, or out of the process altogether.
 */
export const STATUSES_WITHOUT_INTERVIEWS: readonly string[] = [...PAST_INTERVIEWING, "rejected", "withdrawn"];

/**
 * True when moving to `next` leaves no interview for the candidate to attend.
 * A rejected or withdrawn candidate's slot used to stay `scheduled`, so the
 * Interviews page kept counting it and the reminder cron kept mailing them.
 */
export function closesOpenInterviews(next: string): boolean {
  return STATUSES_WITHOUT_INTERVIEWS.includes(next);
}

export interface ClosedInterviewSummary {
  completed: number;
  cancelled: number;
}

/**
 * Close out the interviews a candidate still holds once they have moved past
 * interviewing, been rejected or withdrawn. Call it after the stage change has
 * saved, so a change that fails leaves the interviews as they were.
 *
 * Extending an offer used to leave the interview `scheduled`, so the Interviews
 * tab kept counting it, the Overview inbox advertised "upcoming interviews"
 * that would never happen, and the reminder job kept mailing the candidate
 * about a slot they had already been hired out of.
 *
 * A slot in the past is recorded as `completed` — it is what the decision was
 * based on. A slot still in the future is `cancelled`, because it genuinely
 * will not take place. Neither writes an `outcome`: only a human knows how the
 * interview actually went.
 *
 * The candidate is sent a calendar CANCEL for each cancelled slot, as when an
 * interview is cancelled by hand; without it the accepted invitation stayed in
 * their calendar. The SEQUENCE is bumped so calendar clients apply it.
 */
export async function closeOpenInterviewsForAdvance(
  applicationId: string | mongoose.Types.ObjectId,
  opts: { now?: Date; locale?: string } = {},
): Promise<ClosedInterviewSummary> {
  const now = opts.now ?? new Date();
  const summary: ClosedInterviewSummary = { completed: 0, cancelled: 0 };
  const open = { applicationId, status: { $in: ["scheduled", "confirmed"] } };

  try {
    const [completed, upcoming] = await Promise.all([
      Interview.updateMany({ ...open, scheduledAt: { $lte: now } }, { $set: { status: "completed" } }),
      Interview.find({ ...open, scheduledAt: { $gt: now } }).select("_id").lean(),
    ]);
    summary.completed = completed.modifiedCount ?? 0;

    if (upcoming.length > 0) {
      const ids = upcoming.map((iv) => iv._id);
      const cancelled = await Interview.updateMany(
        { ...open, _id: { $in: ids }, scheduledAt: { $gt: now } },
        { $set: { status: "cancelled" }, $inc: { icsSequence: 1 } },
      );
      summary.cancelled = cancelled.modifiedCount ?? 0;
      // Reads the row back, so only once the cancel has saved. Never throws.
      for (const id of ids) void sendInterviewInvite(String(id), opts.locale).catch(() => {});
    }
  } catch (err) {
    // Never fail the stage change over this — the candidate has moved on either
    // way; the worst case is the stale count this function exists to prevent.
    logger.error({ err, applicationId: String(applicationId) }, "failed to close open interviews on advance");
  }

  return summary;
}
