/**
 * Where each job seeker's admin semantic-search vector lives
 * (docs/CLOUDFLARE-STORAGE-MIGRATION-PLAN.md, section 6).
 *
 * SEARCH_VECTOR_STORE=mongo (default): `JobSeeker.searchEmbedding`, 3072 Gemini
 *   numbers per profile (about 40 KB: most of the jobseekers collection), searched
 *   by Atlas $vectorSearch or the in-memory scan, exactly as before.
 * SEARCH_VECTOR_STORE=vectorize: the vector is cut to its first 768 values and
 *   re-normalised (gemini-embedding-001 is trained for that; Vectorize stops at
 *   1536), stored in the Worker's `search` index under the JobSeeker _id, and
 *   `searchVectorAt` marks the profile as having one. Mongo keeps no vector.
 * "vectorize" without DATA_WORKER_URL / DATA_WORKER_SECRET behaves as "mongo".
 *
 * Moving existing vectors: scripts/move-search-vectors-to-vectorize.ts.
 */
import { Types } from "mongoose";
import JobSeeker from "@/models/JobSeeker";
import { dataWorkerConfigured, deleteVectors, queryVectors, upsertVectors } from "@/lib/cloudflare/dataWorkerClient";

export type SearchVectorStore = "mongo" | "vectorize";

/** Must match workers/mployedin-data/src/vectors.ts SEARCH_DIMENSIONS. */
export const SEARCH_VECTOR_DIMS = 768;
/** Vectorize returns at most this many ids per query (no values, no metadata). */
export const SEARCH_TOP_K = 100;
const QUERY_TIMEOUT_MS = 5_000;

export function searchVectorStore(env: Record<string, string | undefined> = process.env): SearchVectorStore {
  return env.SEARCH_VECTOR_STORE?.trim().toLowerCase() === "vectorize" && dataWorkerConfigured(env) ? "vectorize" : "mongo";
}

/** The first SEARCH_VECTOR_DIMS values, scaled back to unit length. Null for a vector too short or all zeros. */
export function toSearchVector(embedding: number[]): number[] | null {
  if (!Array.isArray(embedding) || embedding.length < SEARCH_VECTOR_DIMS) return null;
  const head = embedding.slice(0, SEARCH_VECTOR_DIMS);
  const norm = Math.sqrt(head.reduce((sum, x) => sum + x * x, 0));
  if (!Number.isFinite(norm) || norm === 0) return null;
  return head.map((x) => x / norm);
}

/** Stores freshly generated search embeddings wherever SEARCH_VECTOR_STORE says. */
export async function saveSearchVectors(items: Array<{ id: unknown; embedding: number[] }>): Promise<void> {
  if (items.length === 0) return;
  if (searchVectorStore() === "mongo") {
    await Promise.all(items.map((i) => JobSeeker.updateOne({ _id: i.id }, { $set: { searchEmbedding: i.embedding } })));
    return;
  }
  const vectors = items.flatMap((i) => {
    const values = toSearchVector(i.embedding);
    return values ? [{ id: String(i.id), values }] : [];
  });
  if (vectors.length === 0) return;
  await upsertVectors("search", vectors);
  await JobSeeker.updateMany(
    { _id: { $in: vectors.map((v) => new Types.ObjectId(v.id)) } },
    { $set: { searchVectorAt: new Date() }, $unset: { searchEmbedding: 1 } },
  );
}

/**
 * Mongo filter for profiles that have no search vector yet in the active store
 * (the search route backfills a few per request).
 */
export function missingSearchVectorFilter(): Record<string, unknown> {
  return searchVectorStore() === "vectorize"
    ? { searchVectorAt: { $exists: false } }
    : { "searchEmbedding.0": { $exists: false } };
}

/**
 * Nearest seekers to a 3072-d query embedding in Vectorize, best first, cosine
 * at least `minCosine`. Throws when Vectorize can't answer. The ids are not yet
 * filtered by status or scope: the caller does that in Mongo.
 */
export async function searchSeekerVectors(queryEmbedding: number[], minCosine: number): Promise<Array<{ id: string; score: number }>> {
  const vector = toSearchVector(queryEmbedding);
  if (!vector) throw new Error("query embedding has too few dimensions");
  const { matches } = await queryVectors("search", { vector, topK: SEARCH_TOP_K }, QUERY_TIMEOUT_MS);
  return matches.filter((m) => m.score >= minCosine).map((m) => ({ id: m.id, score: m.score }));
}

/**
 * GDPR erasure / hard delete: removes the seeker's search vector from
 * Vectorize. Runs whenever the Worker is configured (whatever the switch says
 * now) and throws, so an erasure is never reported done with the vector stored.
 */
export async function eraseSearchVector(jobSeekerId: string): Promise<void> {
  if (!dataWorkerConfigured()) return;
  await deleteVectors("search", [jobSeekerId]);
}
