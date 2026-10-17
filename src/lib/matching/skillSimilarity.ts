/**
 * Skill-vector maths, with no database or provider dependency.
 *
 * Kept separate from `skillVectors.ts` (which owns the Mongo cache) so the
 * relevance scorer stays a pure function: it can be unit-tested without a
 * database, and importing it does not drag Mongoose into a jsdom test.
 */

import { normalizeSkill } from "@/lib/matchScore";

/**
 * Dimensions a skill vector is kept at. `gemini-embedding-001` returns 3,072
 * numbers, but it is a Matryoshka model: the first 768, renormalized, carry
 * almost all of the meaning (Google's MTEB figures are 68.17 against 67.99).
 * Kept short because every cold server reads the whole vocabulary a page
 * needs: at 3,072 doubles a skill cost 42 KB on the wire, at 768 float32s
 * about 3 KB.
 */
export const SKILL_VECTOR_DIMENSIONS = 768;

/** Resolved skill vectors, keyed by canonical string. */
export type SkillVectorMap = Map<string, number[]>;

/**
 * The stored form of an embedding: its first SKILL_VECTOR_DIMENSIONS entries,
 * scaled to unit length. `null` when the input is too short to be one of our
 * vectors or has no direction at all.
 */
export function toSkillVector(full: ArrayLike<number>): number[] | null {
  if (full.length < SKILL_VECTOR_DIMENSIONS) return null;
  const head = Array.from({ length: SKILL_VECTOR_DIMENSIONS }, (_, i) => full[i]);
  const norm = Math.sqrt(head.reduce((sum, x) => sum + x * x, 0));
  if (!Number.isFinite(norm) || norm === 0) return null;
  return head.map((x) => x / norm);
}

export const EMPTY_SKILL_VECTORS: SkillVectorMap = new Map();

/** Canonical lookup key for a raw skill string. */
export function skillKey(raw: string): string {
  return normalizeSkill(raw);
}

/** Cosine similarity of two equal-length vectors, in [-1, 1]. */
export function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Similarity between two skills, or `null` when either has no cached vector. */
export function skillSimilarity(a: string, b: string, vectors: SkillVectorMap): number | null {
  const va = vectors.get(skillKey(a));
  const vb = vectors.get(skillKey(b));
  if (!va || !vb) return null;
  return cosine(va, vb);
}

/** Best similarity between one skill and a set of candidate skills. */
export function bestSimilarity(
  needle: string,
  haystack: readonly string[],
  vectors: SkillVectorMap,
): number | null {
  const vn = vectors.get(skillKey(needle));
  if (!vn) return null;
  let best: number | null = null;
  for (const h of haystack) {
    const vh = vectors.get(skillKey(h));
    if (!vh) continue;
    const sim = cosine(vn, vh);
    if (best === null || sim > best) best = sim;
  }
  return best;
}
