/**
 * Re-score a job's applicants after the job changes.
 *
 * An application is scored once, on arrival. When the employer later edits
 * what the job asks for — skills, experience, qualification, location,
 * deal-breaker answers — or saves new matching weights, every existing score
 * and checklist describes a job that no longer exists, and Shortlist Top ranks
 * on it. This brings them back in line.
 *
 * Deliberately narrower than the arrival worker: it rewrites the score, the
 * checklist and the skills lists, but never rejects anyone (auto-reject is an
 * on-arrival rule) and does not pay for a new narrative.
 *
 * Debounced per job, so an employer saving the form five times in a minute
 * costs one run.
 */

import { inngest } from "./client";
import { connectDB } from "@/lib/db/mongoose";
import Application from "@/models/Application";
import logger from "@/lib/logger";
import { applicantMatchUpdate, scoreApplicationsOfJob } from "@/lib/matching/scoreApplication";

export const RESCORE_EVENT = "job/applicants-rescore";

/** Upper bound per run; a job past this is re-scored best-effort, newest first. */
const MAX_APPLICANTS = 2000;
const BATCH_SIZE = 25;

export const rescoreJobApplicants = inngest.createFunction(
  {
    id: "rescore-job-applicants",
    name: "Re-score Job Applicants",
    retries: 2,
    concurrency: { limit: 2 },
    debounce: { key: "event.data.jobId", period: "60s" },
    triggers: [{ event: RESCORE_EVENT }],
  },
  async ({
    event,
    step,
  }: {
    event: { data: { jobId: string } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    step: any;
  }) => {
    const { jobId } = event.data;
    await connectDB();

    const ids: string[] = await step.run("list-applicants", async () => {
      const rows = await Application.find({ jobId, status: { $ne: "withdrawn" } })
        .sort({ appliedAt: -1 })
        .limit(MAX_APPLICANTS)
        .select("_id")
        .lean();
      return (rows as Array<{ _id: unknown }>).map((row) => String(row._id));
    });

    let rescored = 0;
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE);
      rescored += await step.run(`rescore-${i / BATCH_SIZE}`, async () => {
        const scored = await scoreApplicationsOfJob(jobId, batch);
        if (scored.length === 0) return 0;
        await Application.bulkWrite(
          scored.map(({ applicationId, match }) => ({
            updateOne: { filter: { _id: applicationId }, update: { $set: applicantMatchUpdate(match) } },
          })),
        );
        return scored.length;
      });
    }

    logger.info({ jobId, rescored, considered: ids.length }, "[rescore] job applicants re-scored");
    return { rescored };
  },
);

/**
 * Queue a re-score. Never throws: a job save must not fail because the queue
 * is down — the scores are then stale until the next edit, which is what they
 * were before this existed.
 */
export async function queueApplicantRescore(jobIds: ReadonlyArray<string>): Promise<void> {
  if (jobIds.length === 0) return;
  try {
    await inngest.send(jobIds.map((jobId) => ({ name: RESCORE_EVENT, data: { jobId } })));
  } catch (err) {
    logger.error({ err, jobIds: jobIds.slice(0, 20) }, "[rescore] failed to queue applicant re-score");
  }
}
