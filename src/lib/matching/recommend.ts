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
 *   stage 3  AI adjust   Jev, per pair within 10 of the bar   -> ai/jev.ts
 *   stage 4  threshold   SystemConfig.matching.minScore
 *
 * Stage 3 is the only one that costs money, which is why it runs last and only
 * on survivors. On the live corpus the gate removes ~75% of pairs before any
 * of this, taking a full run from roughly $0.38 to $0.09.
 *
 * `scorePair` is the same pipeline for one pair, and every surface that shows
 * a match percentage — email, app, employer view, auto-apply — goes through one
 * of the two. Jev verdicts are remembered per exact input (JevVerdictStore), so
 * a pair reads the same number wherever it appears and is only paid for once.
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
import { OPENROUTER_MODELS } from "@/lib/ai/openRouter";

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
  /** No preferred country and no recognisable current location. */
  | "no_location"
  | "no_skills"
  | "no_roles"
  | IneligibleReason
  | "score";

/**
 * Whether the engine knows what country this seeker wants to work in — a
 * preferred country, or the one their current location names.
 *
 * Without one the country gate has nothing to check, so every job on the board
 * passes it: a seeker in Kochi who skipped the preference could be mailed jobs
 * in Oman. LinkedIn (country is a required profile field) and Naukri (current
 * and preferred location asked at sign-up) never recommend without a place;
 * we recommend nothing and ask for the country instead.
 */
export function hasKnownLocation(seeker: SeekerProfile): boolean {
  if (seeker.locationSource === "none") return false;
  return (seeker.locations?.length ? seeker.locations : [seeker.location]).some(Boolean);
}

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
export function diagnoseLimitingFactor(
  seeker: SeekerProfile,
  rejected: Partial<Record<IneligibleReason, number>>,
  scoredCount: number,
): LimitingFactor {
  // A precondition, not a ranking problem: with no country nothing is
  // recommended at all, whatever else the profile says.
  if (!hasKnownLocation(seeker)) return "no_location";

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

/**
 * Jev verdicts already paid for, keyed on the exact input Jev saw.
 *
 * Jev is called fresh on every request, so without this the same seeker/job
 * pair could read 92% in the morning email and 90% on the next page view, and
 * a page load would pay for a decision the cron already bought. Keying on the
 * input rather than on seeker + job means a verdict goes stale the moment
 * either side's profile changes, and two identical inputs share one answer.
 *
 * An interface, not a Mongo model, so this module stays free of Mongoose — the
 * implementation lives in jevVerdictStore.ts and callers pass it in.
 */
export interface JevVerdictStore {
  /** Jev's genuine-fit probability for this exact input, or null if never asked. */
  get(input: unknown): Promise<number | null>;
  set(input: unknown, fit: number): Promise<void>;
}

export interface RecommendOptions {
  /** Relevance floor. Callers pass the resolved SystemConfig value. */
  threshold?: number;
  limit?: number;
  /** Let Jev adjust scores in the band where it can matter. Ignored without an OpenRouter key. */
  useAi?: boolean;
  /** Pre-loaded skill vectors, shared across a whole cron batch. */
  vectors?: SkillVectorMap;
  /**
   * Where Jev verdicts are remembered. Pass it everywhere a score is shown —
   * it is what makes the email, the app and the employer view agree.
   */
  verdicts?: JevVerdictStore;
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

/**
 * Whether Jev is consulted for a pair.
 *
 * A property of the pair's own score, never of the list it sits in. The old
 * rule — "the top ten of this list, if within 60% of the bar" — made a job's
 * number depend on which surface it appeared on: the same job could be re-ranked
 * in the email and not on the home page. The band is exactly the scores Jev can
 * move across the bar; below it even a full +10 cannot reach the threshold, so
 * a verdict there would change nothing that ships.
 */
function inJevBand(deterministic: number, threshold: number): boolean {
  return deterministic >= threshold - AI_MAX_ADJUSTMENT;
}

/** The facts Jev is shown about one pair. One builder, so request and cache key cannot drift. */
function jevState(seeker: SeekerProfile, job: CandidateJob) {
  return {
    job: {
      title: job.title,
      required_skills: job.profile.skills,
      preferred_skills: job.profile.preferredSkills,
      experience_min_years: job.profile.minExp,
      experience_max_years: job.profile.maxExp,
      country: job.profile.location,
    },
    candidate: {
      skills: seeker.skills,
      preferred_roles: seeker.preferredRoles,
      total_experience_years: seeker.experienceKnown === false ? null : seeker.experienceYears,
      recent_roles: (seeker.roleHistory ?? []).slice(0, 5).map((r) => r.title),
    },
  };
}

/**
 * Jev's genuine-fit probability for one pair — from the store when this exact
 * input has been decided before, otherwise asked fresh and remembered.
 *
 * The cache key carries the model and the questions as well as the state, so
 * changing either invalidates every stored verdict rather than serving answers
 * to a question nobody is asking any more. Store failures are logged and
 * ignored: a verdict we cannot cache is still a verdict.
 */
async function jevFit(
  seeker: SeekerProfile,
  job: CandidateJob,
  verdicts?: JevVerdictStore,
): Promise<number | null> {
  const state = jevState(seeker, job);
  const key = { model: OPENROUTER_MODELS.decision, questions: JEV_QUESTIONS, state };

  if (verdicts) {
    try {
      const cached = await verdicts.get(key);
      if (cached !== null) return cached;
    } catch (err) {
      logger.warn({ err }, "[recommend] Jev verdict cache read failed");
    }
  }

  const result = await decide(state, JEV_QUESTIONS, `jev:recommend:${job.id}`);
  const fit = noulValue(result?.answers.genuine_fit);

  if (fit !== null && verdicts) {
    try {
      await verdicts.set(key, fit);
    } catch (err) {
      logger.warn({ err }, "[recommend] Jev verdict cache write failed");
    }
  }
  return fit;
}

/**
 * Blend Jev's probability into a deterministic score, then clamp. Blending
 * alone still let a confident answer move a score by up to 35 points; the
 * clamp is what keeps Jev advisory.
 */
function applyJev(deterministic: number, fit: number): number {
  const blended = deterministic * (1 - AI_BLEND_WEIGHT) + fit * 100 * AI_BLEND_WEIGHT;
  const floor = deterministic - AI_MAX_ADJUSTMENT;
  const ceiling = deterministic + AI_MAX_ADJUSTMENT;
  return Math.round(Math.min(ceiling, Math.max(floor, blended)));
}

type SeekerInput = Parameters<typeof seekerProfileFromDoc>[0] | SeekerProfile;

function toSeekerProfile(seekerDoc: SeekerInput): SeekerProfile {
  return "experienceYears" in seekerDoc && "skills" in seekerDoc && Array.isArray(seekerDoc.skills)
    ? (seekerDoc as SeekerProfile)
    : seekerProfileFromDoc(seekerDoc as Parameters<typeof seekerProfileFromDoc>[0]);
}

export interface PairScore {
  /** Whether the pair clears every hard gate. Recommendation surfaces require it. */
  eligible: boolean;
  /** The gate that failed. Absent when eligible. */
  reason?: IneligibleReason;
  /** Final 0–100 — the one number every surface shows for this pair. */
  score: number;
  breakdown: RelevanceBreakdown;
  /** Jev's probability that this is a real fit, when it was consulted. */
  aiConfidence?: number;
}

/**
 * How well one job fits one person — the single definition, used by the
 * digests, the in-app recommendations, the employer's applicant score and
 * auto-apply alike. Before this, the app and the employer view ran an older
 * scorer with different weights and no gates, so one pair could read 92% in an
 * email and 67% on the home page.
 *
 * Ineligible pairs are still scored: an employer looking at someone who applied
 * anyway wants to know how close they came, and the gate result travels with
 * the number. Recommendation surfaces drop them; this function does not decide
 * that for its callers.
 *
 * Never throws. An AI failure leaves the deterministic score.
 */
export async function scorePair(
  seekerDoc: SeekerInput,
  job: CandidateJob,
  options: Pick<RecommendOptions, "threshold" | "useAi" | "vectors" | "verdicts"> = {},
): Promise<PairScore> {
  const seeker = toSeekerProfile(seekerDoc);
  const threshold = options.threshold ?? DEFAULT_MIN_RELEVANCE;
  const gate = checkEligibility(seeker, job.profile);
  const breakdown = calculateRelevance(seeker, job.profile, options.vectors);

  let score = breakdown.overall;
  let aiConfidence: number | undefined;
  if (options.useAi && hasJev() && inJevBand(score, threshold)) {
    try {
      const fit = await jevFit(seeker, job, options.verdicts);
      if (fit !== null) {
        aiConfidence = fit;
        score = applyJev(breakdown.overall, fit);
      }
    } catch (err) {
      logger.warn({ err }, "[recommend] Jev scoring failed; using deterministic score");
    }
  }

  return {
    eligible: gate.eligible,
    ...(gate.eligible ? {} : { reason: gate.reason }),
    score,
    breakdown,
    ...(aiConfidence !== undefined ? { aiConfidence } : {}),
  };
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
  const seeker = toSeekerProfile(seekerDoc);

  const threshold = options.threshold ?? DEFAULT_MIN_RELEVANCE;
  const limit = options.limit ?? MAX_RECOMMENDATIONS;
  const vectors = options.vectors;
  const rejected: Partial<Record<IneligibleReason, number>> = {};

  // No country means no recommendation — before any scoring, so nothing is
  // spent on Jev for a list that will not be sent.
  if (!hasKnownLocation(seeker)) {
    return { jobs: [], considered: 0, rejected, bestScore: 0, threshold, aiUsed: false, limitingFactor: "no_location" };
  }

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
  // Jev adjusts every eligible job in the band where it can change what ships
  // — the same per-pair rule scorePair applies, so a job reads the same here as
  // on any other surface. Verdicts come from the store when already paid for.
  let aiUsed = false;
  if (options.useAi && hasJev()) {
    const band = scored.filter((j) => inJevBand(j.score, threshold));
    await Promise.all(
      band.map(async (entry) => {
        try {
          const fit = await jevFit(seeker, entry, options.verdicts);
          if (fit === null) return;
          aiUsed = true;
          entry.aiConfidence = fit;
          entry.score = applyJev(entry.breakdown.overall, fit);
        } catch (err) {
          logger.warn({ err, jobId: entry.id }, "[recommend] Jev scoring failed; using deterministic score");
        }
      }),
    );
    scored.sort((a, b) => b.score - a.score);
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
