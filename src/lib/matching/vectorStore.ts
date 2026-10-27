/**
 * Where matching vectors are searched (docs/CLOUDFLARE-STORAGE-MIGRATION-PLAN.md part 3).
 *
 * The vectors themselves (Job.matchEmbedding, JobSeeker.matchEmbedding, 1024-d)
 * stay in MongoDB as the source of truth; Vectorize holds a copy keyed by the
 * Mongo _id, in the jobs / seekers indexes of the mployedin-data Worker.
 *
 * VECTOR_STORE=atlas (default): Atlas $vectorSearch, exactly as before.
 * VECTOR_STORE=shadow: Atlas still answers; Vectorize is kept in step and
 *   queried alongside, and each query logs `event: "vector_shadow"` with how
 *   many of Atlas's ids Vectorize also returned. Switch only when that overlap
 *   is good.
 * VECTOR_STORE=vectorize: Vectorize answers.
 * shadow / vectorize without DATA_WORKER_URL / DATA_WORKER_SECRET behave as atlas.
 *
 * Vectorize returns at most 100 nearest ids per query (topK). Atlas callers ask
 * for 500-600; on Vectorize they get the nearest 100, which Mongo then filters
 * as before. The shadow log shows what that costs before anyone switches.
 *
 * No metadata filters are pushed to Vectorize: the jobs index holds live jobs
 * only (departures are deleted by the refresh cron), and every caller re-applies
 * its own Mongo filter to the ids, so a stale copy can only cost recall, never
 * show a closed job or a hidden seeker.
 */
import logger from "@/lib/logger";
import {
  dataWorkerConfigured,
  deleteVectors,
  queryVectors,
  upsertVectors,
  type VectorIndexName,
} from "@/lib/cloudflare/dataWorkerClient";

export type VectorStore = "atlas" | "shadow" | "vectorize";
export type VectorKind = "job" | "seeker";

/** Vectorize's topK ceiling for a query that returns neither values nor metadata. */
export const VECTORIZE_TOP_K = 100;

const INDEX: Record<VectorKind, VectorIndexName> = { job: "jobs", seeker: "seekers" };

export function vectorStore(env: Record<string, string | undefined> = process.env): VectorStore {
  const value = env.VECTOR_STORE?.trim().toLowerCase();
  if ((value === "shadow" || value === "vectorize") && dataWorkerConfigured(env)) return value;
  return "atlas";
}

/** True when Vectorize must be kept in step with Mongo (shadow and vectorize). */
export function vectorSyncEnabled(): boolean {
  return vectorStore() !== "atlas";
}

/**
 * Copies freshly embedded vectors to Vectorize. Never throws: Mongo holds the
 * vector, and the backfill (scripts/backfill-vectors-to-vectorize.ts) re-copies.
 */
export async function syncMatchVectors(kind: VectorKind, items: Array<{ id: string; values: number[] }>): Promise<void> {
  if (!vectorSyncEnabled() || items.length === 0) return;
  try {
    await upsertVectors(INDEX[kind], items);
  } catch (err) {
    logger.error({ err, event: "vector_sync_failed", kind, count: items.length }, "[vectorStore] Vectorize upsert failed");
  }
}

/** Removes vectors whose document left the pool (closed job, archived seeker, emptied text). Never throws. */
export async function removeMatchVectors(kind: VectorKind, ids: string[]): Promise<void> {
  if (!vectorSyncEnabled() || ids.length === 0) return;
  try {
    await deleteVectors(INDEX[kind], ids);
  } catch (err) {
    logger.error({ err, event: "vector_sync_failed", kind, count: ids.length }, "[vectorStore] Vectorize delete failed");
  }
}

/** Ids of the documents of `kind` nearest `vector`, best first, at most VECTORIZE_TOP_K. Throws on failure. */
export async function vectorizeNearest(kind: VectorKind, vector: number[], limit: number, timeoutMs?: number): Promise<string[]> {
  const { matches } = await queryVectors(INDEX[kind], { vector, topK: Math.min(Math.max(limit, 1), VECTORIZE_TOP_K) }, timeoutMs);
  return matches.map((m) => m.id);
}

/**
 * Vectors to delete because their document left the pool for good (GDPR
 * erasure, hard delete). Runs whenever the Worker is configured, whatever
 * VECTOR_STORE says (an earlier shadow period may have copied them), and
 * throws: an erasure must not report success with the vector still stored.
 */
export async function eraseMatchVectors(kind: VectorKind, ids: string[]): Promise<void> {
  if (!dataWorkerConfigured() || ids.length === 0) return;
  await deleteVectors(INDEX[kind], ids);
}

/**
 * Shadow comparison: of Atlas's best min(100, n) ids, how many Vectorize also
 * returned. 1 means Vectorize would have handed the caller the same pool head.
 */
export function shadowOverlap(atlasIds: string[], vectorizeIds: string[]): { compared: number; overlap: number; ratio: number } {
  const head = atlasIds.slice(0, VECTORIZE_TOP_K);
  const returned = new Set(vectorizeIds);
  const overlap = head.filter((id) => returned.has(id)).length;
  return { compared: head.length, overlap, ratio: head.length ? overlap / head.length : 1 };
}
