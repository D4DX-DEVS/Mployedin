/**
 * Jobs and seekers that left the matching pool since `since` lose their copy in
 * Vectorize (lib/matching/vectorStore.ts). The pool is what the refresh cron
 * embeds: active, undeleted jobs and seekers whose role is not archived. Atlas
 * needs none of this because it filters on the live document at query time.
 *
 * Anything this misses (a status change written with timestamps off) costs
 * recall only: callers re-filter ids in Mongo. The vector backfill
 * (scripts/backfill-vectors-to-vectorize.ts --apply) removes every departed id.
 */
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import { connectDB } from "@/lib/db/mongoose";
import { removeMatchVectors } from "@/lib/matching/vectorStore";

/** A cron run's worth: the next run picks up the rest. */
const PER_RUN = 1000;

/** Mongo filters for documents that hold a vector but are out of the pool. */
export const DEPARTED_JOBS = {
  matchEmbedding: { $exists: true },
  $or: [{ status: { $ne: "active" } }, { deletedAt: { $ne: null } }],
};
export const DEPARTED_SEEKERS = { matchEmbedding: { $exists: true }, roleArchivedAt: { $ne: null } };

async function departedIds(model: typeof Job | typeof JobSeeker, filter: Record<string, unknown>): Promise<string[]> {
  const docs = (await (model as typeof Job).find(filter).select("_id").limit(PER_RUN).lean()) as Array<{ _id: unknown }>;
  return docs.map((d) => String(d._id));
}

export async function pruneDepartedVectors(since: Date): Promise<{ jobs: number; seekers: number }> {
  await connectDB();
  const changed = { updatedAt: { $gte: since } };
  const [jobs, seekers] = await Promise.all([
    departedIds(Job, { ...DEPARTED_JOBS, ...changed }),
    departedIds(JobSeeker, { ...DEPARTED_SEEKERS, ...changed }),
  ]);
  await removeMatchVectors("job", jobs);
  await removeMatchVectors("seeker", seekers);
  return { jobs: jobs.length, seekers: seekers.length };
}
