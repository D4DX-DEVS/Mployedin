import mongoose from "mongoose";
import Interview from "@/models/Interview";
import { PIPELINE_STAGES, type PipelineStage } from "@/lib/hiring/pipeline";
import logger from "@/lib/logger";

/** Stages that only make sense once interviewing is behind the candidate. */
const PAST_INTERVIEWING: readonly string[] = PIPELINE_STAGES.slice(
  PIPELINE_STAGES.indexOf("interview_scheduled") + 1,
);

/**
 * True when moving to `next` puts the candidate beyond the interview stage.
 * `rejected` / `withdrawn` are deliberately excluded: those already have their
 * own handling and an interview cancelled by a rejection is a different event.
 */
export function advancesPastInterviewing(next: string): next is PipelineStage {
  return PAST_INTERVIEWING.includes(next);
}

export interface ClosedInterviewSummary {
  completed: number;
  cancelled: number;
}

/**
 * Close out the interviews a candidate still holds once they have moved past
 * interviewing.
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
 */
export async function closeOpenInterviewsForAdvance(
  applicationId: string | mongoose.Types.ObjectId,
  opts: { now?: Date } = {},
): Promise<ClosedInterviewSummary> {
  const now = opts.now ?? new Date();
  const summary: ClosedInterviewSummary = { completed: 0, cancelled: 0 };

  try {
    const [completed, cancelled] = await Promise.all([
      Interview.updateMany(
        { applicationId, status: { $in: ["scheduled", "confirmed"] }, scheduledAt: { $lte: now } },
        { $set: { status: "completed" } },
      ),
      Interview.updateMany(
        { applicationId, status: { $in: ["scheduled", "confirmed"] }, scheduledAt: { $gt: now } },
        { $set: { status: "cancelled" } },
      ),
    ]);
    summary.completed = completed.modifiedCount ?? 0;
    summary.cancelled = cancelled.modifiedCount ?? 0;
  } catch (err) {
    // Never fail the stage change over this — the candidate has moved on either
    // way; the worst case is the stale count this function exists to prevent.
    logger.error({ err, applicationId: String(applicationId) }, "failed to close open interviews on advance");
  }

  return summary;
}

export interface ExitCleanupSummary {
  interviewsCompleted: number;
  interviewsCancelled: number;
  offersWithdrawn: number;
}

/**
 * Close everything still open on an application that has left the pipeline
 * (rejected or withdrawn).
 *
 * Both used to stay open: the reminder cron kept mailing a rejected candidate
 * about an interview, and a pending offer sat there to be accepted after the
 * candidate had withdrawn. A slot already in the past is recorded `completed`;
 * a future one is cancelled through `cancelInterview`, which sends the ICS
 * CANCEL so it leaves the candidate's calendar. Open offers are withdrawn with
 * a timeline event saying why.
 *
 * Never throws — the status change that called this has already been saved.
 */
export async function closeOpenItemsForExit(
  applicationId: string | mongoose.Types.ObjectId,
  exitStatus: "rejected" | "withdrawn",
  opts: { now?: Date; actorRole?: string } = {},
): Promise<ExitCleanupSummary> {
  const now = opts.now ?? new Date();
  const summary: ExitCleanupSummary = { interviewsCompleted: 0, interviewsCancelled: 0, offersWithdrawn: 0 };

  try {
    const [{ cancelInterview }, { default: Offer }, { OPEN_OFFER_STATUSES }] = await Promise.all([
      import("@/lib/interviews/cancelInterview"),
      import("@/models/Offer"),
      import("@/lib/offers/status"),
    ]);

    const completed = await Interview.updateMany(
      { applicationId, status: { $in: ["scheduled", "confirmed"] }, scheduledAt: { $lte: now } },
      { $set: { status: "completed" } },
    );
    summary.interviewsCompleted = completed.modifiedCount ?? 0;

    const upcoming = (await Interview.find({
      applicationId,
      status: { $in: ["scheduled", "confirmed", "rescheduled"] },
      scheduledAt: { $gt: now },
    })
      .select("_id")
      .lean()) as Array<{ _id: mongoose.Types.ObjectId }>;
    for (const iv of upcoming) {
      // The rejection / withdrawal is the candidate-facing news; the ICS
      // CANCEL still goes out so the slot leaves their calendar.
      if (await cancelInterview(iv._id, { notifyCandidate: false })) summary.interviewsCancelled++;
    }

    const withdrawn = await Offer.updateMany(
      { applicationId, status: { $in: [...OPEN_OFFER_STATUSES] } },
      {
        $set: { status: "withdrawn", respondedAt: now },
        $push: {
          events: {
            type: "withdrawn",
            at: now,
            actorRole: opts.actorRole ?? "system",
            note: exitStatus === "rejected" ? "Application rejected" : "Application withdrawn",
          },
        },
      },
    );
    summary.offersWithdrawn = withdrawn.modifiedCount ?? 0;
  } catch (err) {
    logger.error({ err, applicationId: String(applicationId), exitStatus }, "failed to close open interviews/offers on exit");
  }

  return summary;
}
