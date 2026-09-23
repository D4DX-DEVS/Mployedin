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
 * Every entry point degrades to lexical-only matching if embeddings are
 * unavailable. A missing AI key must never stop the digest going out.
 */

import logger from "@/lib/logger";
import SkillVector from "@/models/SkillVector";
import { generateEmbeddingBatch, EMBEDDING_DIMENSIONS } from "@/lib/ai/embeddings";
import { GOOGLE_AI_MODELS, hasGoogleAiApiKey } from "@/lib/ai/googleAI";
import { skillKey, EMPTY_SKILL_VECTORS, type SkillVectorMap } from "@/lib/matching/skillSimilarity";

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
 * from another embedding model is rejected by the dims check before it gets
 * here. So nothing in this map can go stale. It exists because the in-app
 * recommendation feed scores its whole pool on every scroll page, and without
 * it each page re-read ~15 MB of vectors from Mongo (821 skills, 3,072 doubles
 * each). Cleared wholesale past the cap rather than LRU-evicted: the whole
 * platform vocabulary is well under it today.
 */
const MEMO_CAP = 3000;
const memo: SkillVectorMap = new Map();

function remember(canonical: string, vector: number[]): void {
  if (memo.size >= MEMO_CAP) memo.clear();
  memo.set(canonical, vector);
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

  let cached: Array<{ canonical: string; vector: number[]; dims: number }> = [];
  try {
    cached = await SkillVector.find({ canonical: { $in: [...wanted.keys()] } })
      .select("canonical vector dims")
      .lean<Array<{ canonical: string; vector: number[]; dims: number }>>();
  } catch (err) {
    logger.warn({ err }, "[skillVectors] cache read failed; falling back to lexical only");
    return EMPTY_SKILL_VECTORS;
  }

  for (const row of cached) {
    // A vector from a different embedding model is not comparable to a fresh
    // one. Treat it as absent rather than mixing dimensionalities.
    if (row.dims === EMBEDDING_DIMENSIONS && row.vector?.length) {
      out.set(row.canonical, row.vector);
      remember(row.canonical, row.vector);
      wanted.delete(row.canonical);
    }
  }

  if (wanted.size === 0 || !allowEmbedding || !hasGoogleAiApiKey()) return out;

  const missing = [...wanted.entries()];
  for (let i = 0; i < missing.length; i += EMBED_BATCH_SIZE) {
    const slice = missing.slice(i, i + EMBED_BATCH_SIZE);
    try {
      const vectors = await generateEmbeddingBatch(slice.map(([, raw]) => raw));
      const docs = slice
        .map(([canonical, raw], idx) => ({ canonical, raw, vector: vectors[idx] }))
        .filter((d) => d.vector?.length === EMBEDDING_DIMENSIONS);

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
                  vector: d.vector,
                  dims: EMBEDDING_DIMENSIONS,
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
