/**
 * Atlas $vectorSearch integration for job seeker semantic search.
 *
 * Requires an Atlas Vector Search index on the `jobseekers` collection
 * (create with `node --env-file=.env scripts/create-vector-search-index.mjs`):
 *   name: jobseeker_vector_index
 *   fields: vector(searchEmbedding, 3072, cosine) + filter(status)
 *
 * Falls back gracefully: callers receive `null` when the index is missing or
 * the cluster doesn't support $vectorSearch, and should use the in-memory
 * cosine scan instead. Availability is cached for 5 minutes to avoid paying
 * a failed aggregation on every request.
 */

import JobSeeker from "@/models/JobSeeker";
import logger from "@/lib/logger";

export const VECTOR_INDEX_NAME = "jobseeker_vector_index";

const UNAVAILABLE_RETRY_MS = 5 * 60 * 1000;
let unavailableUntil = 0;

export interface VectorHit {
  id: unknown;
  /** Raw cosine similarity in [-1, 1] (converted from Atlas's normalized score). */
  score: number;
}

/**
 * Run Atlas $vectorSearch over job seeker embeddings.
 * Returns scored hits, or `null` when $vectorSearch is unavailable
 * (missing index / unsupported cluster) so callers can fall back.
 */
export async function atlasVectorSearch(
  queryEmbedding: number[],
  opts: { limit: number; minCosine: number }
): Promise<VectorHit[] | null> {
  if (Date.now() < unavailableUntil) return null;

  try {
    const results = await JobSeeker.aggregate<{ _id: unknown; score: number }>([
      {
        $vectorSearch: {
          index: VECTOR_INDEX_NAME,
          path: "searchEmbedding",
          queryVector: queryEmbedding,
          numCandidates: Math.min(Math.max(opts.limit * 10, 200), 10000),
          limit: opts.limit,
          filter: { status: { $ne: "deleted" } },
        },
      },
      { $project: { _id: 1, score: { $meta: "vectorSearchScore" } } },
    ]);

    // Atlas normalizes cosine scores to (1 + cosine) / 2 — convert back so
    // thresholds and relevance percentages stay consistent with the fallback.
    return results
      .map((r) => ({ id: r._id, score: 2 * r.score - 1 }))
      .filter((r) => r.score >= opts.minCosine);
  } catch (err) {
    unavailableUntil = Date.now() + UNAVAILABLE_RETRY_MS;
    logger.warn({ err }, "$vectorSearch unavailable — falling back to in-memory scan");
    return null;
  }
}
