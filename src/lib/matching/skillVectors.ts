/**
 * Semantic skill matching — the cached vector layer.
 *
 * `matchScore.ts` compares skills as exact strings. Measured on the live corpus
 * that produced a mean skills component of 6.6 out of 100, because jobs ask for
 * "API Testing" and "Postman" while candidates wrote "Manual Testing" and
 * "Cypress". A recruiter reads those as overlapping; a string compare does not.
 *
 * This module embeds each distinct skill once, caches the vector in Mongo
 * forever, and compares vectors instead. Runtime cost during the daily cron is
 * therefore zero API calls — only arithmetic — which matters because the cron
 * scores tens of thousands of seeker x job pairs.
 *
 * Embeddings stay on Google direct: OpenRouter sells no embedding model, and
 * the Atlas index is built on `gemini-embedding-001`.
 *
 * Storage: 768 float32 values as little-endian bytes (3 KB a skill). Rows
 * written before 2026-10-16 hold the full 3,072 numbers as a BSON array
 * (42 KB a skill); they are read truncated, so both forms score identically,
 * and `scripts/migrate-skill-vectors-f32.ts` rewrites them. The size matters
 * because a cold server reads ~180 of these before it can score a seeker's
 * home page, and on the shared Atlas tier that read ran at ~100 KB/s.
 *
 * Every entry point degrades to lexical-only matching if embeddings are
 * unavailable. A missing AI key must never stop the digest going out.
 */

import logger from "@/lib/logger";
import SkillVector from "@/models/SkillVector";
import { generateEmbeddingBatch, EMBEDDING_DIMENSIONS } from "@/lib/ai/embeddings";
import { GOOGLE_AI_MODELS, hasGoogleAiApiKey } from "@/lib/ai/googleAI";
import {
  skillKey,
  toSkillVector,
  EMPTY_SKILL_VECTORS,
  SKILL_VECTOR_DIMENSIONS,
  type SkillVectorMap,
} from "@/lib/matching/skillSimilarity";

// The vector maths lives in `skillSimilarity.ts` so the relevance scorer can
// import it without pulling in Mongoose. Re-exported here for callers that
// already reach for this module.
export {
  skillKey,
  skillSimilarity,
  bestSimilarity,
  EMPTY_SKILL_VECTORS,
  type SkillVectorMap,
} from "@/lib/matching/skillSimilarity";

/** Google's embeddings endpoint accepts an array; keep batches modest. */
const EMBED_BATCH_SIZE = 64;

/**
 * Vectors this process has already read or embedded.
 *
 * A stored vector never changes: the key is the canonical skill, and anything
 * of another shape is rejected by decodeStoredSkillVector before it gets
 * here. So nothing in this map can go stale. It exists because the in-app
 * recommendation feed scores its whole pool on every scroll page, and without
 * it each page re-read every vector it needed from Mongo. Cleared wholesale
 * past the cap rather than LRU-evicted: the whole platform vocabulary is well
 * under it today.
 */
const MEMO_CAP = 3000;
const memo: SkillVectorMap = new Map();

function remember(canonical: string, vector: number[]): void {
  if (memo.size >= MEMO_CAP) memo.clear();
  memo.set(canonical, vector);
}

/** For tests. */
export function clearSkillVectorMemo(): void {
  memo.clear();
}

/** A 768-dim vector as the bytes stored in Mongo: float32, little-endian. */
export function encodeSkillVector(vector: readonly number[]): Buffer {
  const bytes = Buffer.alloc(vector.length * 4);
  vector.forEach((x, i) => bytes.writeFloatLE(x, i * 4));
  return bytes;
}

/** The bytes of a stored vector, whether lean() handed back a Buffer or the driver's Binary. */
function bytesOf(raw: unknown): Uint8Array | null {
  if (raw instanceof Uint8Array) return raw;
  const inner = (raw as { buffer?: unknown } | null)?.buffer;
  return inner instanceof Uint8Array ? inner : null;
}

/**
 * A stored `vector` field as the 768 numbers scoring uses, or `null` when the
 * row is not one of ours (wrong size, wrong type). Accepts both storage forms:
 * the float32 bytes written now and the legacy 3,072-number array, which is
 * truncated and renormalized exactly as the embedder's output is on write.
 */
export function decodeStoredSkillVector(raw: unknown): number[] | null {
  if (Array.isArray(raw)) return raw.length === EMBEDDING_DIMENSIONS ? toSkillVector(raw) : null;
  const bytes = bytesOf(raw);
  if (!bytes || bytes.byteLength !== SKILL_VECTOR_DIMENSIONS * 4) return null;
  const view = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const vector = Array.from({ length: SKILL_VECTOR_DIMENSIONS }, (_, i) => view.readFloatLE(i * 4));
  // Corrupt bytes read as absent, so the skill is embedded again instead of
  // poisoning every cosine with NaN or scoring zero against everything.
  let norm = 0;
  for (const x of vector) {
    if (!Number.isFinite(x)) return null;
    norm += x * x;
  }
  return norm > 0 ? vector : null;
}

/**
 * Load vectors for the given skills, embedding and caching any that are new.
 *
 * `allowEmbedding: false` returns only what is already cached. Pages that show
 * a match percentage do NOT use it: a seeker who has just added a skill would
 * see it scored lexically in the app and semantically in that morning's email.
 * Job skills are embedded by the hourly digest run, so in practice a request
 * only ever embeds the handful of skills a seeker has just typed, once.
 */
export async function loadSkillVectors(
  rawSkills: Iterable<string>,
  opts: { allowEmbedding?: boolean } = {},
): Promise<SkillVectorMap> {
  const allowEmbedding = opts.allowEmbedding ?? true;

  // Canonical key -> one raw spelling, kept for the `sample` column and as the
  // text actually sent to the embedder.
  const wanted = new Map<string, string>();
  for (const raw of rawSkills) {
    const key = skillKey(raw);
    if (key && !wanted.has(key)) wanted.set(key, raw.trim());
  }
  if (wanted.size === 0) return EMPTY_SKILL_VECTORS;

  const out: SkillVectorMap = new Map();
  for (const key of [...wanted.keys()]) {
    const known = memo.get(key);
    if (known) {
      out.set(key, known);
      wanted.delete(key);
    }
  }
  if (wanted.size === 0) return out;

  let cached: Array<{ canonical: string; vector: unknown }> = [];
  try {
    cached = await SkillVector.find({ canonical: { $in: [...wanted.keys()] } })
      .select("canonical vector")
      .lean<Array<{ canonical: string; vector: unknown }>>();
  } catch (err) {
    logger.warn({ err }, "[skillVectors] cache read failed; falling back to lexical only");
    return EMPTY_SKILL_VECTORS;
  }

  for (const row of cached) {
    // A vector of another shape (other model, corrupt bytes) is not comparable
    // to a fresh one. Treat it as absent rather than mixing dimensionalities.
    const vector = decodeStoredSkillVector(row.vector);
    if (vector) {
      out.set(row.canonical, vector);
      remember(row.canonical, vector);
      wanted.delete(row.canonical);
    }
  }

  if (wanted.size === 0 || !allowEmbedding || !hasGoogleAiApiKey()) return out;

  const missing = [...wanted.entries()];
  for (let i = 0; i < missing.length; i += EMBED_BATCH_SIZE) {
    const slice = missing.slice(i, i + EMBED_BATCH_SIZE);
    try {
      const vectors = await generateEmbeddingBatch(slice.map(([, raw]) => raw));
      // The full-length check is the model guard: a different embedder would
      // hand back another size, and must not be stored under this model's name.
      const docs = slice
        .map(([canonical, raw], idx) => ({ canonical, raw, full: vectors[idx] }))
        .filter((d) => d.full?.length === EMBEDDING_DIMENSIONS)
        .flatMap((d) => {
          const vector = toSkillVector(d.full);
          return vector ? [{ canonical: d.canonical, raw: d.raw, vector }] : [];
        });

      for (const d of docs) {
        out.set(d.canonical, d.vector);
        remember(d.canonical, d.vector);
      }

      if (docs.length > 0) {
        // Upsert rather than insert: two crons embedding the same new skill at
        // once must not fail on the unique index.
        await SkillVector.bulkWrite(
          docs.map((d) => ({
            updateOne: {
              filter: { canonical: d.canonical },
              update: {
                $set: {
                  vector: encodeSkillVector(d.vector),
                  dims: SKILL_VECTOR_DIMENSIONS,
                  embeddingModel: GOOGLE_AI_MODELS.embedding,
                  sample: d.raw,
                },
              },
              upsert: true,
            },
          })),
          { ordered: false },
        );
      }
    } catch (err) {
      // Partial coverage is fine — those skills simply score lexically.
      logger.warn({ err, batch: slice.length }, "[skillVectors] embedding batch failed");
    }
  }

  return out;
}

/** Anything carrying a JobProfile-shaped `profile`. Structural, to avoid a cycle. */
interface SkillBearingJob {
  profile: { skills?: string[]; preferredSkills?: string[] };
}

/**
 * Every skill string a batch will need, so one embedding pass covers the whole
 * cron run instead of one per seeker.
 */
export function collectSkillVocabulary(
  jobs: ReadonlyArray<SkillBearingJob>,
  seekers: ReadonlyArray<{ skills?: string[] }>,
): string[] {
  const all = new Set<string>();
  for (const j of jobs) {
    for (const s of j.profile.skills ?? []) all.add(s);
    for (const s of j.profile.preferredSkills ?? []) all.add(s);
  }
  for (const s of seekers) for (const skill of s.skills ?? []) all.add(skill);
  return [...all];
}

/** Load the vectors for a whole batch up front. Safe to skip; scoring degrades to lexical. */
export async function prepareSkillVectors(
  jobs: ReadonlyArray<SkillBearingJob>,
  seekers: ReadonlyArray<{ skills?: string[] }>,
): Promise<SkillVectorMap> {
  return loadSkillVectors(collectSkillVocabulary(jobs, seekers));
}
