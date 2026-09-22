/**
 * Remembering what we already recommended.
 *
 * The pipeline excluded jobs a seeker had applied to, but nothing else — so on
 * a job board that turns over slowly, the same top five cleared the bar every
 * morning and the seeker received an identical digest day after day. Raising
 * the relevance floor makes that worse, not better: the stricter the filter,
 * the more stable the winning set.
 *
 * Rows expire on their own (see `JobRecommendation`), so a job the seeker
 * ignored can legitimately come back later rather than being suppressed for
 * good.
 */

import mongoose from "mongoose";
import logger from "@/lib/logger";
import JobRecommendation, { type IJobRecommendation } from "@/models/JobRecommendation";

export type RecommendationSource = IJobRecommendation["source"];

function toObjectId(id: string): mongoose.Types.ObjectId | null {
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
}

/**
 * Job ids already sent to this seeker inside the cooldown window.
 *
 * Returns an empty set on any failure: suppressing a job we have not actually
 * sent is a worse outcome than the occasional repeat.
 */
export async function alreadyRecommendedJobIds(userId: string): Promise<Set<string>> {
  const uid = toObjectId(userId);
  if (!uid) return new Set();
  try {
    const rows = await JobRecommendation.find({ userId: uid })
      .select("jobId")
      .lean<Array<{ jobId: mongoose.Types.ObjectId }>>();
    return new Set(rows.map((r) => r.jobId.toString()));
  } catch (err) {
    logger.warn({ err, userId }, "[recommendationLog] read failed; allowing repeats this run");
    return new Set();
  }
}

/**
 * Jobs actually recommended to this seeker since `since`, best first.
 *
 * The weekly summary reports on the week rather than re-scoring the board: a
 * second scoring pass would disagree with what was sent (the job list moves,
 * the seeker's profile moves) and, now that job matches go out on their own
 * cadence, would put the same jobs in two emails in the same week.
 */
export async function recentRecommendations(
  userId: string,
  since: Date,
  limit = 3,
): Promise<Array<{ title: string; company: string; matchScore: number }>> {
  const uid = toObjectId(userId);
  if (!uid) return [];
  try {
    const rows = await JobRecommendation.find({ userId: uid, sentAt: { $gte: since } })
      .sort({ score: -1 })
      .limit(limit)
      .populate({ path: "jobId", select: "title employerId", populate: { path: "employerId", select: "companyName" } })
      .lean<Array<{ score: number; jobId: { title?: string; employerId?: { companyName?: string } | null } | null }>>();

    return rows
      // A job deleted since it was recommended leaves a dangling reference;
      // drop it rather than printing an empty row.
      .filter((r) => r.jobId?.title)
      .map((r) => ({
        title: r.jobId!.title!,
        company: r.jobId!.employerId?.companyName ?? "Company",
        matchScore: r.score,
      }));
  } catch (err) {
    logger.warn({ err, userId }, "[recommendationLog] weekly read failed");
    return [];
  }
}

/**
 * Record what just went out.
 *
 * Upsert keyed on (userId, jobId) so a re-send after the cooldown refreshes the
 * row rather than accumulating one per send, and so a retried Inngest step
 * cannot write duplicates.
 */
export async function markRecommended(
  userId: string,
  jobs: ReadonlyArray<{ id: string; score: number }>,
  source: RecommendationSource,
  cooldownMs: number,
): Promise<void> {
  const uid = toObjectId(userId);
  if (!uid || jobs.length === 0) return;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + cooldownMs);
  const ops = jobs
    .map((job) => ({ job, jid: toObjectId(job.id) }))
    .filter((x): x is { job: { id: string; score: number }; jid: mongoose.Types.ObjectId } => x.jid !== null)
    .map(({ job, jid }) => ({
      updateOne: {
        filter: { userId: uid, jobId: jid },
        update: { $set: { score: job.score, source, sentAt: now, expiresAt } },
        upsert: true,
      },
    }));

  if (ops.length === 0) return;
  try {
    await JobRecommendation.bulkWrite(ops, { ordered: false });
  } catch (err) {
    // A lost write means a possible repeat next run, not a failed digest.
    logger.warn({ err, userId, count: ops.length }, "[recommendationLog] write failed");
  }
}
