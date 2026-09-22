/**
 * The one job-recommendation pipeline.
 *
 * Four surfaces used to each roll their own: the daily digest scored against a
 * 50 floor, the weekly digest and the re-engagement mail used 40, and the
 * similar-jobs mail had no floor at all. They also disagreed about which Job
 * fields to load — the weekly digest asked Mongo for four fields that do not
 * exist on the schema, so it had been ranking on title and country alone.
 * Everything now goes through `recommendJobsFor`.
 *
 *   stage 0  retrieval   caller supplies candidates (already-applied excluded)
 *   stage 1  eligibility hard gate, both-sides-stated rule   -> eligibility.ts
 *   stage 2  relevance   skills / role / experience          -> relevance.ts
 *   stage 3  AI re-rank  Jev, on the shortlist only          -> ai/jev.ts
 *   stage 4  threshold   SystemConfig.matching.minScore
 *
 * Stage 3 is the only one that costs money, which is why it runs last and only
 * on survivors. On the live corpus the gate removes ~75% of pairs before any
 * of this, taking a full run from roughly $0.38 to $0.09.
 */

import logger from "@/lib/logger";
import { seekerProfileFromDoc, jobProfileFromDoc, type SeekerProfile, type JobProfile } from "@/lib/matchScore";
import { checkEligibility, type IneligibleReason } from "@/lib/matching/eligibility";
import { calculateRelevance, type RelevanceBreakdown } from "@/lib/matching/relevance";
// Type only: importing the Mongo-backed cache at runtime would drag Mongoose
// into every consumer, including unit tests of this orchestrator. Callers load
// vectors via prepareSkillVectors() in skillVectors.ts and pass them in.
import type { SkillVectorMap } from "@/lib/matching/skillSimilarity";
import { MAX_RECOMMENDATIONS, DEFAULT_MIN_RELEVANCE, JOB_MATCH_FIELDS } from "@/lib/matching/constants";

// Re-exported so the mailers keep a single import from this module.
export { JOB_MATCH_FIELDS };
import { decide, noulValue, hasJev, type JevQuestion } from "@/lib/ai/jev";

export interface CandidateJob {
  id: string;
  title: string;
  company: string;
  location: string;
  isRemote: boolean;
  salary?: { min?: number; max?: number; currency?: string; period?: string };
  createdAt?: Date;
  profile: JobProfile;
}

export interface RecommendedJob extends CandidateJob {
  /** Final 0–100 shown to the seeker. */
  score: number;
  breakdown: RelevanceBreakdown;
  /** Jev's probability that this is a real fit, when it was consulted. */
  aiConfidence?: number;
}

/**
 * The single thing most responsible for a seeker seeing no jobs.
 *
 * Without this the "no strong matches" email could only report gate
 * rejections, so a seeker who had simply never listed a skill was told "most
 * openings are outside your countries" — true of the jobs that were dropped,
 * useless as advice, and it blames the job board for an empty profile.
 */
export type LimitingFactor =
  | "no_skills"
  | "no_roles"
  | IneligibleReason
  | "score";

export interface RecommendationResult {
  jobs: RecommendedJob[];
  /** Everything that scored, above and below the floor — for diagnostics. */
  considered: number;
  /** Counts per gate, so we can see which constraint starves which seeker. */
  rejected: Partial<Record<IneligibleReason, number>>;
  /** Best score seen, even if it did not clear the floor. Drives the fallback email. */
  bestScore: number;
  threshold: number;
  aiUsed: boolean;
  /** Why nothing cleared the bar. Absent when something did. */
  limitingFactor?: LimitingFactor;
}

/**
 * Work out what is actually holding this seeker back.
 *
 * Profile gaps come first, because they are the only thing the seeker can fix
 * today and because they dominate the arithmetic: skills are 60% of the score,
 * so a seeker with none has a ceiling of 40 and can never clear a threshold
 * anywhere near 80 no matter what the job board does.
 */
function diagnoseLimitingFactor(
  seeker: SeekerProfile,
  rejected: Partial<Record<IneligibleReason, number>>,
  scoredCount: number,
): LimitingFactor {
  // A gate that removed more than it let through is the wall: when almost
  // nothing is even eligible, telling the seeker to add skills is advice that
  // would not have helped. This is checked before the profile gaps for that
  // reason, even though the gaps are easier to fix.
  //
  // Ties break towards the two "we don't know" gates. They carry the same count
  // as any other gate but a much better instruction: "tell us your experience"
  // is a single field the seeker can fill, where "most jobs are elsewhere" is
  // something they can do nothing about.
  const actionable = (reason: string) => (reason.endsWith("_unknown") ? 1 : 0);
  const worstGate = Object.entries(rejected).sort(
    (a, b) => (b[1] ?? 0) - (a[1] ?? 0) || actionable(b[0]) - actionable(a[0]),
  )[0];
  if (worstGate && (worstGate[1] ?? 0) > scoredCount) return worstGate[0] as IneligibleReason;

  // Plenty was eligible, so the ceiling is the profile. Skills are 60% of the
  // score: with none stated, and no CV to fall back on, the best reachable
  // total is 40 — no job can ever clear a threshold near 80.
  if ((seeker.skills ?? []).length === 0 && !(seeker.cvText ?? "").trim()) return "no_skills";
  if ((seeker.preferredRoles ?? []).length === 0) return "no_roles";

  return "score";
}

export interface RecommendOptions {
  /** Relevance floor. Callers pass the resolved SystemConfig value. */
  threshold?: number;
  limit?: number;
  /** Let Jev re-rank the shortlist. Ignored when no OpenRouter key is present. */
  useAi?: boolean;
  /** Pre-loaded skill vectors, shared across a whole cron batch. */
  vectors?: SkillVectorMap;
  /** How many top candidates to send to Jev. Each one is a billed request. */
  aiShortlistSize?: number;
}

/** Turn a lean Job document into the shape the pipeline works with. */
export function toCandidateJob(job: Record<string, unknown>): CandidateJob {
  const loc = (job.location ?? {}) as { country?: string; city?: string; isRemote?: boolean };
  const employer = job.employerId as { companyName?: string } | null | undefined;
  return {
    id: String((job._id as { toString(): string })?.toString?.() ?? job._id),
    title: (job.title as string) ?? "",
    company: employer?.companyName ?? "Company",
    location: loc.isRemote ? "Remote" : [loc.city, loc.country].filter(Boolean).join(", ") || (loc.country ?? ""),
    isRemote: Boolean(loc.isRemote),
    salary: job.salary as CandidateJob["salary"],
    createdAt: job.createdAt as Date | undefined,
    profile: jobProfileFromDoc(job as never),
  };
}

/**
 * Jev's questions about one seeker/job pair.
 *
 * Deliberately narrow. The deterministic score already knows about country,
 * pay and seniority; what it cannot do is read "Manual Testing + Cypress" as
 * partial cover for "Test Automation Frameworks". So we ask only about the
 * judgement a human recruiter adds, and blend the answer rather than replacing
 * the arithmetic with it.
 */
const JEV_QUESTIONS: Record<string, JevQuestion> = {
  genuine_fit: {
    type: "noul",
    instructions:
      "Would an experienced recruiter shortlist this candidate for this job based on their skills and background?",
    criteria: {
      true: "The candidate's skills and experience genuinely cover what the job needs, allowing for differently-worded but equivalent skills.",
      false: "The candidate is missing the core capability the job is built around, or their background is in an unrelated field.",
    },
  },
};

/** Weight given to Jev's opinion when blending with the deterministic score. */
const AI_BLEND_WEIGHT = 0.35;

/**
 * The most Jev may move a score, in points, in either direction.
 *
 * Without it the blend alone is not the safety property it reads as. At 35% a
 * confident "yes" adds up to 35 points, so a 70 becomes an 80 and ships; a
 * confident "no" takes 33 off a 95 and buries a job the arithmetic liked. Both
 * are the model deciding, not advising.
 *
 * Clamped to ±10 it stays what it was meant to be: a tie-breaker that reorders
 * the shortlist and can nudge a borderline job across a threshold it was
 * already within reach of. Crossing an 80 bar now requires the deterministic
 * score to have reached 70 on its own.
 */
const AI_MAX_ADJUSTMENT = 10;

async function rerankWithAi(
  seeker: SeekerProfile,
  shortlist: RecommendedJob[],
): Promise<boolean> {
  let consulted = false;
  await Promise.all(
    shortlist.map(async (entry) => {
      const result = await decide(
        {
          job: {
            title: entry.title,
            required_skills: entry.profile.skills,
            preferred_skills: entry.profile.preferredSkills,
            experience_min_years: entry.profile.minExp,
            experience_max_years: entry.profile.maxExp,
            country: entry.profile.location,
          },
          candidate: {
            skills: seeker.skills,
            preferred_roles: seeker.preferredRoles,
            total_experience_years: seeker.experienceKnown === false ? null : seeker.experienceYears,
            recent_roles: (seeker.roleHistory ?? []).slice(0, 5).map((r) => r.title),
          },
        },
        JEV_QUESTIONS,
        `jev:recommend:${entry.id}`,
      );

      const fit = noulValue(result?.answers.genuine_fit);
      if (fit === null) return;
      consulted = true;
      entry.aiConfidence = fit;
      // Blend, then clamp. Blending alone still let a confident answer move a
      // score by up to 35 points; the clamp is what keeps Jev advisory.
      const blended =
        entry.breakdown.overall * (1 - AI_BLEND_WEIGHT) + fit * 100 * AI_BLEND_WEIGHT;
      const floor = entry.breakdown.overall - AI_MAX_ADJUSTMENT;
      const ceiling = entry.breakdown.overall + AI_MAX_ADJUSTMENT;
      entry.score = Math.round(Math.min(ceiling, Math.max(floor, blended)));
    }),
  );
  return consulted;
}

/**
 * Rank a seeker's candidate jobs and return only those worth showing.
 *
 * Never throws: a failure anywhere in the AI layer degrades to the
 * deterministic result, because this runs inside a cron batch where an
 * exception costs every remaining seeker their digest.
 */
export async function recommendJobsFor(
  seekerDoc: Parameters<typeof seekerProfileFromDoc>[0] | SeekerProfile,
  candidates: readonly CandidateJob[],
  options: RecommendOptions = {},
): Promise<RecommendationResult> {
  const seeker: SeekerProfile =
    "experienceYears" in seekerDoc && "skills" in seekerDoc && Array.isArray(seekerDoc.skills)
      ? (seekerDoc as SeekerProfile)
      : seekerProfileFromDoc(seekerDoc as Parameters<typeof seekerProfileFromDoc>[0]);

  const threshold = options.threshold ?? DEFAULT_MIN_RELEVANCE;
  const limit = options.limit ?? MAX_RECOMMENDATIONS;
  const vectors = options.vectors;
  const rejected: Partial<Record<IneligibleReason, number>> = {};

  // ── stages 1 + 2 ───────────────────────────────────────────────────────
  const scored: RecommendedJob[] = [];
  for (const job of candidates) {
    const gate = checkEligibility(seeker, job.profile);
    if (!gate.eligible) {
      if (gate.reason) rejected[gate.reason] = (rejected[gate.reason] ?? 0) + 1;
      continue;
    }
    const breakdown = calculateRelevance(seeker, job.profile, vectors);
    scored.push({ ...job, score: breakdown.overall, breakdown });
  }

  scored.sort((a, b) => b.score - a.score);
  const bestDeterministic = scored[0]?.score ?? 0;

  // ── stage 3 ────────────────────────────────────────────────────────────
  // Only the shortlist is sent to Jev, and only jobs already close to the bar.
  // Paying to re-rank a job scoring 12 changes nothing about whether it ships.
  let aiUsed = false;
  if (options.useAi && hasJev() && scored.length > 0) {
    const shortlistSize = options.aiShortlistSize ?? limit * 2;
    const shortlist = scored
      .slice(0, shortlistSize)
      .filter((j) => j.score >= threshold * 0.6);
    if (shortlist.length > 0) {
      try {
        aiUsed = await rerankWithAi(seeker, shortlist);
        scored.sort((a, b) => b.score - a.score);
      } catch (err) {
        logger.warn({ err }, "[recommend] AI re-rank failed; using deterministic scores");
      }
    }
  }

  // ── stage 4 ────────────────────────────────────────────────────────────
  const bestScore = Math.max(bestDeterministic, scored[0]?.score ?? 0);
  const jobs = scored.filter((j) => j.score >= threshold).slice(0, limit);

  return {
    jobs,
    considered: scored.length,
    rejected,
    bestScore,
    threshold,
    aiUsed,
    ...(jobs.length === 0
      ? { limitingFactor: diagnoseLimitingFactor(seeker, rejected, scored.length) }
      : {}),
  };
}
