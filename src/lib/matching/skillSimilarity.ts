/**
 * Skill-vector maths, with no database or provider dependency.
 *
 * Kept separate from `skillVectors.ts` (which owns the Mongo cache) so the
 * relevance scorer stays a pure function: it can be unit-tested without a
 * database, and importing it does not drag Mongoose into a jsdom test.
 */

import { normalizeSkill } from "@/lib/matchScore";

/** Resolved skill vectors, keyed by canonical string. */
export type SkillVectorMap = Map<string, number[]>;

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
