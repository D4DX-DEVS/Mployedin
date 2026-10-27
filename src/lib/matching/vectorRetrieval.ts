/**
 * Vector retrieval: which jobs a seeker's pool holds, or which seekers a job's
 * talent pool holds, chosen by nearest matching vector instead of "newest N".
 *
 * Retrieval only. The eligibility gate, the relevance score and Jev still
 * decide every percentage; this only changes which documents reach them.
 * Every function answers null when it can't help (flag off, no current vector,
 * Atlas refusing), and the caller then runs the query it runs today.
 *
 * Atlas indexes come from scripts/create-match-vector-indexes.mjs. VECTOR_STORE
 * (lib/matching/vectorStore.ts) moves the search to Cloudflare Vectorize, or
 * runs both and logs the overlap (shadow).
 */
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import logger from "@/lib/logger";
import { matchEmbeddingModel } from "@/lib/ai/openRouterEmbeddings";
import { shadowOverlap, vectorStore, vectorizeNearest, type VectorKind } from "@/lib/matching/vectorStore";

export const JOB_MATCH_INDEX = "job_match_vector_index";
export const SEEKER_MATCH_INDEX = "jobseeker_match_vector_index";

const UNAVAILABLE_RETRY_MS = 5 * 60 * 1000;
/** Vectorize is asked on the request path: give up fast, and stay out of the way a minute after a failure. */
const VECTORIZE_TIMEOUT_MS = 3_000;
const VECTORIZE_RETRY_MS = 60 * 1000;
/** Shadow queries are observation only: never worth more than this, and never awaited by the request. */
const SHADOW_TIMEOUT_MS = 1_500;
let unavailableUntil = 0;
let vectorizeUnavailableUntil = 0;

/** For tests: forget a previous failure. */
export function resetVectorRetrievalForTests(): void {
  unavailableUntil = 0;
  vectorizeUnavailableUntil = 0;
}

/** True while the store this request would ask is backing off after a failure. */
function backingOff(): boolean {
  return Date.now() < (vectorStore() === "vectorize" ? vectorizeUnavailableUntil : unavailableUntil);
}

export function vectorRetrievalEnabled(): boolean {
  return process.env.MATCH_VECTOR_RETRIEVAL === "on";
}

type Source = { matchEmbedding?: number[]; matchEmbeddingModel?: string } | null;

function currentVector(doc: Source): number[] | null {
  if (!doc?.matchEmbedding?.length || doc.matchEmbeddingModel !== matchEmbeddingModel()) return null;
  return doc.matchEmbedding;
}

async function atlasNearest(
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

/**
 * Nearest ids from the store VECTOR_STORE names. Vectorize failing, or finding
 * nothing (not backfilled yet, writes still applying), answers null so the
 * caller runs its plain query: an empty list would empty the caller's pool. In
 * shadow mode Atlas answers at once and Vectorize is compared in the background.
 */
async function nearest(
  kind: VectorKind,
  index: string,
  queryVector: number[],
  limit: number,
  filter: Record<string, unknown>,
): Promise<string[] | null> {
  const model = kind === "job" ? Job : JobSeeker;
  const store = vectorStore();
  if (store === "atlas") return atlasNearest(model, index, queryVector, limit, filter);
  if (store === "vectorize") {
    try {
      const ids = await vectorizeNearest(kind, queryVector, limit, VECTORIZE_TIMEOUT_MS);
      return ids.length ? ids : null;
    } catch (err) {
      vectorizeUnavailableUntil = Date.now() + VECTORIZE_RETRY_MS;
      logger.warn({ err, kind }, "[vectorRetrieval] Vectorize unavailable; using the plain query");
      return null;
    }
  }
  const shadow = vectorizeNearest(kind, queryVector, limit, SHADOW_TIMEOUT_MS).catch((err: unknown) => {
    logger.warn({ err, kind }, "[vectorRetrieval] shadow Vectorize query failed");
    return null;
  });
  const atlas = await atlasNearest(model, index, queryVector, limit, filter);
  void shadow.then((vectorize) => {
    if (atlas && vectorize) logger.info({ event: "vector_shadow", kind, ...shadowOverlap(atlas, vectorize) }, "[vectorRetrieval] shadow comparison");
  });
  return atlas;
}

/** Ids of the active jobs nearest the seeker, or null to use the plain query. */
export async function vectorRetrieveJobs(seekerId: string, limit: number): Promise<string[] | null> {
  if (!vectorRetrievalEnabled() || backingOff()) return null;
  const seeker = (await JobSeeker.findById(seekerId).select("+matchEmbedding matchEmbeddingModel").lean()) as Source;
  const vector = currentVector(seeker);
  return vector ? nearest("job", JOB_MATCH_INDEX, vector, limit, { status: "active" }) : null;
}

/** Ids of the discoverable seekers nearest the job, or null to use the plain query. */
export async function vectorRetrieveSeekers(jobId: string, limit: number): Promise<string[] | null> {
  if (!vectorRetrievalEnabled() || backingOff()) return null;
  const job = (await Job.findById(jobId).select("+matchEmbedding matchEmbeddingModel").lean()) as Source;
  const vector = currentVector(job);
  return vector ? nearest("seeker", SEEKER_MATCH_INDEX, vector, limit, { profileVisibility: "visible" }) : null;
}

/** `query`, narrowed to `ids`, leaving any `_id` clause of its own intact. */
export function restrictToIds(query: Record<string, unknown>, ids: string[]): Record<string, unknown> {
  return { $and: [query, { _id: { $in: ids } }] };
}
