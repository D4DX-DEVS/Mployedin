/**
 * Ordering for "matching candidates": the database's talent pool ranked for one
 * job. Pure, so the order can be tested without a database.
 *
 * The number shown is the employer-side applicant score (applicantScore.ts) —
 * the same figure the employer sees once the candidate applies — so an agent
 * never sources someone at 82% who then reads 64% in the employer's pipeline.
 */
import type { IneligibleReason } from "@/lib/matching/eligibility";
import type { QualificationKey, RequirementsStatus } from "@/lib/matching/qualifications";

/** Candidates scored in full per request, after a cheap first pass over the pool. */
export const TALENT_POOL_SHORTLIST = 50;

/**
 * Gate reasons that are the CANDIDATE's own preference (where they want to
 * work, how, for what pay). The employer's requirements (experience,
 * education) are reported through the requirements checklist instead.
 */
export const PREFERENCE_REASONS: ReadonlySet<IneligibleReason> = new Set(["country", "work_mode", "salary"]);

export interface RankablePoolCandidate {
  /** The candidate's stated preferences rule this job out (country, work mode, pay). */
  preferenceMismatch: IneligibleReason | null;
  requirementsStatus: RequirementsStatus;
  score: number;
}

/**
 * Best first: candidates whose own preferences fit, then those meeting every
 * hard requirement, then by score. A 90% candidate who only wants jobs in
 * another country is still listed, just below everyone who could take it.
 */
export function rankPoolCandidates<T extends RankablePoolCandidate>(rows: readonly T[]): T[] {
  const tier = (row: T) => (row.preferenceMismatch ? 2 : 0) + (row.requirementsStatus === "not_met" ? 1 : 0);
  return [...rows].sort((a, b) => tier(a) - tier(b) || b.score - a.score);
}

/** First pass: which of the pool get a full score. Eligible pairs lead. */
export function shortlistByPairScore<T extends { eligible: boolean; score: number }>(rows: readonly T[], size: number): T[] {
  return [...rows]
    .sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score)
    .slice(0, size);
}

/** The preference reason worth showing, or null when the gate passed or failed on a requirement. */
export function preferenceMismatchOf(eligible: boolean, reason: IneligibleReason | undefined): IneligibleReason | null {
  if (eligible || !reason) return null;
  return PREFERENCE_REASONS.has(reason) ? reason : null;
}

export interface UnmetRequirement {
  key: QualificationKey;
  required?: string;
  actual?: string;
  label?: string;
}
