import Application from "@/models/Application";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import User from "@/models/User";
import { Employer } from "@/models/Employer";
import { seekerProfileFromDoc } from "@/lib/matchScore";
import { loadConfirmedSkills, withConfirmedSkills } from "@/lib/effectiveSeekerProfile";
import { scorePair, toCandidateJob } from "@/lib/matching/recommend";
import { collectSkillVocabulary, loadSkillVectors } from "@/lib/matching/skillVectors";
import { resolveEngineOptions, type EngineOptions } from "@/lib/matching/seekerMatches";
import { APPLICANT_JOB_FIELDS, APPLICANT_SEEKER_FIELDS, computeApplicantMatch } from "@/lib/matching/scoreApplication";
import type { ApplicantBreakdown } from "@/lib/matching/applicantScore";
import type { IneligibleReason } from "@/lib/matching/eligibility";
import type { RequirementsStatus } from "@/lib/matching/qualifications";
import {
  TALENT_POOL_SHORTLIST,
  preferenceMismatchOf,
  rankPoolCandidates,
  shortlistByPairScore,
  type UnmetRequirement,
} from "@/lib/matching/talentPoolRanking";

type Lean = Record<string, unknown>;

/** The pool is everyone who chose to be found — the same consent talent search honours. */
export const TALENT_POOL_FILTER = { profileVisibility: "visible", roleArchivedAt: null } as const;

/** Upper bound on the pool read per request; the live pool is a few hundred. */
const MAX_POOL = 3000;
/** Full applicant scores computed side by side. */
const SCORE_CONCURRENCY = 5;
/** A ranking is reused while paging through it, until the job changes. */
const CACHE_TTL_MS = 2 * 60 * 1000;

export interface PoolCandidate {
  jobSeekerId: string;
  name: string;
  avatar?: string;
  headline?: string;
  currentLocation?: string;
  totalExperienceYears?: number;
  availabilityStatus?: string;
  /** Employer-side applicant score — what the employer sees once they apply. */
  score: number;
  breakdown: ApplicantBreakdown;
  matchedSkills: string[];
  missingSkills: string[];
  requirementsStatus: RequirementsStatus;
  unmetRequirements: UnmetRequirement[];
  /** The candidate's own preference that rules this job out, if any. */
  preferenceMismatch: IneligibleReason | null;
  /** Most recent role, for the card. */
  latestRole?: { title?: string; company?: string };
}

export interface TalentPoolMatchResult {
  candidates: PoolCandidate[];
  /** Discoverable candidates considered (excludes those who already applied). */
  poolSize: number;
  /** Candidates who already applied — they are on the job's applicants list instead. */
  alreadyApplied: number;
  scoredAt: string;
}

/** In-flight and finished rankings, so concurrent first views share one computation. */
const cache = new Map<string, { at: number; promise: Promise<TalentPoolMatchResult> }>();

async function mapInBatches<T, R>(items: readonly T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

function latestRoleOf(seeker: Lean): PoolCandidate["latestRole"] {
  const experience = (seeker.experience as Array<{ jobTitle?: string; company?: string; isCurrent?: boolean; startDate?: Date }> | undefined) ?? [];
  if (experience.length === 0) return undefined;
  const current = experience.find((e) => e.isCurrent) ?? experience[0];
  return current.jobTitle ? { title: current.jobTitle, company: current.company } : undefined;
}

/**
 * Rank the discoverable talent pool for one job.
 *
 * Two passes, because the full applicant score reads per-candidate data
 * (confirmed skills, locality) and scoring a few hundred people that way on
 * every page view is too slow: the engine's in-memory pair score picks the
 * best `TALENT_POOL_SHORTLIST`, then only those get the employer-side score
 * that is shown. The AI reviewer (Jev) is never consulted, and the
 * whole-pool pass uses cached skill vectors only; the shortlist scores like
 * an application does, which may embed a skill not yet cached.
 *
 * A ranking is reused for two minutes while paging, but who is still
 * discoverable is re-checked on every call: someone who hides their profile
 * drops out of the list at once.
 *
 * Returns null when the job does not exist.
 */
export async function matchTalentPoolForJob(jobId: string): Promise<TalentPoolMatchResult | null> {
  const job = (await Job.findById(jobId).select(`${APPLICANT_JOB_FIELDS} employerId updatedAt`).lean()) as Lean | null;
  if (!job) return null;

  const cacheKey = `${jobId}:${new Date((job.updatedAt as Date | string | undefined) ?? 0).getTime()}`;
  let entry = cache.get(cacheKey);
  if (!entry || Date.now() - entry.at >= CACHE_TTL_MS) {
    const promise = rankPoolForJob(jobId, job);
    entry = { at: Date.now(), promise };
    cache.set(cacheKey, entry);
    if (cache.size > 200) cache.delete(cache.keys().next().value as string);
    // A failed ranking is not reused.
    promise.catch(() => cache.delete(cacheKey));
  }
  const result = await entry.promise;

  const ids = result.candidates.map((c) => c.jobSeekerId);
  const stillVisible = new Set(
    ((await JobSeeker.find({ _id: { $in: ids }, ...TALENT_POOL_FILTER }).distinct("_id")) as unknown[]).map(String),
  );
  return { ...result, candidates: result.candidates.filter((c) => stillVisible.has(c.jobSeekerId)) };
}

async function rankPoolForJob(jobId: string, job: Lean): Promise<TalentPoolMatchResult> {
  const [employer, appliedIds, engineDefaults] = await Promise.all([
    job.employerId ? Employer.findById(job.employerId).select("matchingWeights industry").lean() : null,
    Application.distinct("jobSeekerId", { jobId }),
    resolveEngineOptions(),
  ]);
  const engine: EngineOptions = { ...engineDefaults, useAi: false };

  // Registers the model the populate below reads.
  void User;
  const seekers = ((await JobSeeker.find({ ...TALENT_POOL_FILTER, _id: { $nin: appliedIds } })
    .select(`${APPLICANT_SEEKER_FIELDS} fullName headline availabilityStatus`)
    .populate({ path: "userId", select: "name avatar isActive" })
    // Most recently active first, so a cap (never reached today) drops the stalest.
    .sort({ updatedAt: -1 })
    .limit(MAX_POOL)
    .lean()) as Lean[]).filter((s) => {
    const user = s.userId as { isActive?: boolean } | null;
    return user !== null && user.isActive !== false;
  });

  const userIdOf = (s: Lean) => String((s.userId as { _id?: unknown } | null)?._id ?? "");
  const confirmed = await loadConfirmedSkills(seekers.map(userIdOf));
  const profiles = seekers.map((s) =>
    withConfirmedSkills(seekerProfileFromDoc(s as Parameters<typeof seekerProfileFromDoc>[0]), confirmed.get(userIdOf(s)) ?? []),
  );

  // Pass 1 — the engine's pair score for the whole pool, in memory.
  const candidateJob = toCandidateJob(job);
  const vectors = await loadSkillVectors(collectSkillVocabulary([candidateJob], profiles), { allowEmbedding: false });
  const firstPass = await Promise.all(
    seekers.map(async (seeker, i) => {
      const pair = await scorePair(profiles[i], candidateJob, { threshold: engine.threshold, useAi: false, vectors });
      return { seeker, eligible: pair.eligible, reason: pair.reason, score: pair.score };
    }),
  );
  const shortlist = shortlistByPairScore(firstPass, TALENT_POOL_SHORTLIST);

  // Pass 2 — the employer-side score for the shortlist.
  const employerWeights = (employer as { matchingWeights?: unknown } | null)?.matchingWeights;
  const employerIndustry = (employer as { industry?: string } | null)?.industry;
  const rows = await mapInBatches(shortlist, SCORE_CONCURRENCY, async ({ seeker, eligible, reason }) => {
    const seekerForScore = { ...seeker, userId: userIdOf(seeker) };
    const match = await computeApplicantMatch({ job, seeker: seekerForScore, employerWeights, employerIndustry, engine });
    const user = seeker.userId as { name?: string; avatar?: string } | null;
    const candidate: PoolCandidate = {
      jobSeekerId: String(seeker._id),
      name: (seeker.fullName as string | undefined) || user?.name || "",
      avatar: user?.avatar,
      headline: seeker.headline as string | undefined,
      currentLocation: seeker.currentLocation as string | undefined,
      totalExperienceYears: seeker.totalExperienceYears as number | undefined,
      availabilityStatus: seeker.availabilityStatus as string | undefined,
      score: match.aiMatchScore,
      breakdown: match.matchBreakdown,
      matchedSkills: match.matchedSkills,
      missingSkills: match.missingSkills,
      requirementsStatus: match.requirementsStatus,
      unmetRequirements: match.qualifications
        .filter((check) => check.hard && check.status === "not_met")
        .map(({ key, required, actual, label }) => ({ key, required, actual, label })),
      preferenceMismatch: preferenceMismatchOf(eligible, reason),
      latestRole: latestRoleOf(seeker),
    };
    return candidate;
  });

  return {
    candidates: rankPoolCandidates(rows),
    poolSize: seekers.length,
    alreadyApplied: appliedIds.length,
    scoredAt: new Date().toISOString(),
  };
}
