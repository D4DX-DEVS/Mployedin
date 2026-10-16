/**
 * Vector retrieval: which jobs a seeker's pool holds, or which seekers a job's
 * talent pool holds, chosen by nearest matching vector instead of "newest N".
 *
 * Retrieval only. The eligibility gate, the relevance score and Jev still
 * decide every percentage; this only changes which documents reach them.
 * Every function answers null when it can't help (flag off, no current vector,
 * Atlas refusing), and the caller then runs the query it runs today.
 *
 * Indexes come from scripts/create-match-vector-indexes.mjs.
 */
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import logger from "@/lib/logger";
import { matchEmbeddingModel } from "@/lib/ai/openRouterEmbeddings";

export const JOB_MATCH_INDEX = "job_match_vector_index";
export const SEEKER_MATCH_INDEX = "jobseeker_match_vector_index";

const UNAVAILABLE_RETRY_MS = 5 * 60 * 1000;
let unavailableUntil = 0;

/** For tests: forget a previous failure. */
export function resetVectorRetrievalForTests(): void {
  unavailableUntil = 0;
}

export function vectorRetrievalEnabled(): boolean {
  return process.env.MATCH_VECTOR_RETRIEVAL === "on";
}

type Source = { matchEmbedding?: number[]; matchEmbeddingModel?: string } | null;

function currentVector(doc: Source): number[] | null {
  if (!doc?.matchEmbedding?.length || doc.matchEmbeddingModel !== matchEmbeddingModel()) return null;
  return doc.matchEmbedding;
}

async function nearest(
  model: typeof Job | typeof JobSeeker,
  index: string,
  queryVector: number[],
  limit: number,
  filter: Record<string, unknown>,
): Promise<string[] | null> {
  try {
    const hits = await (model as typeof Job).aggregate<{ _id: unknown }>([
      {
        $vectorSearch: {
          index,
          path: "matchEmbedding",
          queryVector,
          numCandidates: Math.min(Math.max(limit * 10, 200), 10000),
          limit,
          filter,
        },
      },
      { $project: { _id: 1 } },
    ]);
    return hits.map((h) => String(h._id));
  } catch (err) {
    unavailableUntil = Date.now() + UNAVAILABLE_RETRY_MS;
    logger.warn({ err, index }, "[vectorRetrieval] $vectorSearch unavailable; using the plain query");
    return null;
  }
}

/** Ids of the active jobs nearest the seeker, or null to use the plain query. */
export async function vectorRetrieveJobs(seekerId: string, limit: number): Promise<string[] | null> {
  if (!vectorRetrievalEnabled() || Date.now() < unavailableUntil) return null;
  const seeker = (await JobSeeker.findById(seekerId).select("+matchEmbedding matchEmbeddingModel").lean()) as Source;
  const vector = currentVector(seeker);
  return vector ? nearest(Job, JOB_MATCH_INDEX, vector, limit, { status: "active" }) : null;
}

/** Ids of the discoverable seekers nearest the job, or null to use the plain query. */
export async function vectorRetrieveSeekers(jobId: string, limit: number): Promise<string[] | null> {
  if (!vectorRetrievalEnabled() || Date.now() < unavailableUntil) return null;
  const job = (await Job.findById(jobId).select("+matchEmbedding matchEmbeddingModel").lean()) as Source;
  const vector = currentVector(job);
  return vector ? nearest(JobSeeker, SEEKER_MATCH_INDEX, vector, limit, { profileVisibility: "visible" }) : null;
}

/** `query`, narrowed to `ids`, leaving any `_id` clause of its own intact. */
export function restrictToIds(query: Record<string, unknown>, ids: string[]): Record<string, unknown> {
  return { $and: [query, { _id: { $in: ids } }] };
}
