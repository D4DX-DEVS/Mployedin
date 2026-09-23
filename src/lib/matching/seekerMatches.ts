/**
 * The engine, wired for a page request.
 *
 * The emails score through `recommendJobsFor`; the app used to score the same
 * seeker against the same jobs with the older `calculateMatchScore` — other
 * weights, lexical skills only, no hard gates, no Jev — and recommended
 * anything off a list sorted by that number. So the home page could lead with
 * a 67% job the morning email had rightly left out, and the percentage on one
 * job differed between the two.
 *
 * Every in-app surface now scores through `scorePair` with the options below,
 * which are the ones the crons use: the admin's threshold, the admin's AI
 * switch, and the shared Jev verdict store, so a verdict the email paid for is
 * the one the page shows.
 */

import { isAiRerankEnabled, resolveMatchThreshold } from "@/models/SystemConfig";
import type { SeekerProfile } from "@/lib/matchScore";
import type { IneligibleReason } from "@/lib/matching/eligibility";
import { mongoJevVerdictStore } from "@/lib/matching/jevVerdictStore";
import {
  diagnoseLimitingFactor,
  hasKnownLocation,
  scorePair,
  toCandidateJob,
  type LimitingFactor,
  type PairScore,
  type RecommendOptions,
} from "@/lib/matching/recommend";
import { prepareSkillVectors } from "@/lib/matching/skillVectors";
import { IRRELEVANT_SORT_PENALTY } from "@/lib/jobRecommendations";

export type EngineOptions = Required<Pick<RecommendOptions, "threshold" | "useAi" | "verdicts">>;

/** The admin-controlled settings every surface must score under. */
export async function resolveEngineOptions(): Promise<EngineOptions> {
  const [threshold, useAi] = await Promise.all([resolveMatchThreshold(), isAiRerankEnabled()]);
  return { threshold, useAi, verdicts: mongoJevVerdictStore };
}

export interface MatchFields {
  /** The engine's score: the same number the email shows for this pair. */
  matchScore: number;
  /** Job skills the seeker has, lexically or by meaning. */
  matchedSkills: string[];
  /** Clears every hard gate (country, pay, experience, ...). */
  eligible: boolean;
  /** Eligible and at or above the threshold: what "Recommended for you" lists. */
  recommended: boolean;
  /**
   * Ordering only, never shown. Ineligible jobs sink by a fixed penalty so a
   * browse list keeps them visible below the ones that fit.
   */
  sortScore: number;
}

export interface ScoredPool<T> {
  /** Best-first: recommended jobs lead, then the rest by sortScore. */
  jobs: Array<T & MatchFields>;
  threshold: number;
  recommendedCount: number;
  eligibleCount: number;
  /** Best score among eligible jobs, the figure the near-miss email quotes. */
  bestScore: number;
  /** Why nothing was recommended. Absent when something was. */
  limitingFactor?: LimitingFactor;
}

/**
 * Score a candidate pool for one seeker with the engine and order it.
 *
 * Every job is scored, eligible or not, so a browse list can still show a
 * percentage for all of them; only `recommended` jobs belong in anything
 * labelled a recommendation. Never throws on an AI failure: `scorePair` falls
 * back to the deterministic score.
 */
export async function scoreSeekerPool<T extends Record<string, unknown>>(
  seeker: SeekerProfile,
  jobs: readonly T[],
  engine?: EngineOptions,
): Promise<ScoredPool<T>> {
  const options = engine ?? (await resolveEngineOptions());
  const candidates = jobs.map((job) => toCandidateJob(job));
  const vectors = await prepareSkillVectors(candidates, [seeker]);

  const scores: PairScore[] = await Promise.all(
    candidates.map((candidate) => scorePair(seeker, candidate, { ...options, vectors })),
  );

  const rejected: Partial<Record<IneligibleReason, number>> = {};
  // Every job is still scored for the browse list, but with no country known
  // none may be called a recommendation — the same rule the email follows.
  const located = hasKnownLocation(seeker);
  let eligibleCount = 0;
  let bestScore = 0;
  const scored = jobs.map((job, i) => {
    const pair = scores[i];
    if (pair.eligible) {
      eligibleCount += 1;
      bestScore = Math.max(bestScore, pair.score);
    } else if (pair.reason) {
      rejected[pair.reason] = (rejected[pair.reason] ?? 0) + 1;
    }
    const recommended = located && pair.eligible && pair.score >= options.threshold;
    return {
      ...job,
      matchScore: pair.score,
      matchedSkills: pair.breakdown.matchedSkills,
      eligible: pair.eligible,
      recommended,
      sortScore: pair.eligible ? pair.score : Math.max(0, pair.score - IRRELEVANT_SORT_PENALTY),
    };
  });

  // Recommended first whatever the arithmetic: an ineligible 95 sinks to 75
  // under the penalty, but a threshold below 20 points would let it climb past
  // an eligible 80 without this.
  scored.sort(
    (a, b) => Number(b.recommended) - Number(a.recommended) || b.sortScore - a.sortScore,
  );

  const recommendedCount = scored.filter((job) => job.recommended).length;
  return {
    jobs: scored,
    threshold: options.threshold,
    recommendedCount,
    eligibleCount,
    bestScore,
    ...(recommendedCount === 0
      ? { limitingFactor: diagnoseLimitingFactor(seeker, rejected, eligibleCount) }
      : {}),
  };
}

/**
 * One seeker/job pair through the engine — for the surfaces that score a
 * single applicant: the employer's "analyse match" and the screening worker.
 * They used to run the older scorer, so an employer could see 67% on an
 * application the seeker had been emailed as a 92% match.
 */
export async function scoreOnePair(
  seeker: SeekerProfile,
  job: Record<string, unknown>,
  engine?: EngineOptions,
): Promise<PairScore> {
  const options = engine ?? (await resolveEngineOptions());
  const candidate = toCandidateJob(job);
  const vectors = await prepareSkillVectors([candidate], [seeker]);
  return scorePair(seeker, candidate, { ...options, vectors });
}

/** Application.matchBreakdown as the engine fills it. */
export interface StoredMatchBreakdown {
  skills: number;
  role: number;
  experience: number;
  /** The final score, Jev included — always equal to aiMatchScore. */
  overall: number;
}

/**
 * The engine's parts in the shape an application stores. Location and pay are
 * not here because the engine does not score them: they are pass/fail gates,
 * reported through `eligible` / `reason` instead of as a percentage.
 */
export function storedBreakdown(pair: Pick<PairScore, "score" | "breakdown">): StoredMatchBreakdown {
  return {
    skills: pair.breakdown.skills,
    role: pair.breakdown.role,
    experience: pair.breakdown.experience,
    overall: pair.score,
  };
}
