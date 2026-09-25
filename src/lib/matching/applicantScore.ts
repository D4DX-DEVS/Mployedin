/**
 * One applicant, scored for the employer — the ATS ranking.
 *
 * Built from the engine's pair score (`scorePair`) but measured the way a
 * recruiter reads a CV, not the way a seeker's job feed is ranked:
 *
 *   - every required skill the job lists counts, not the first six;
 *   - experience past the job's band is marked down gently — the best
 *     candidate is often a little over it — while too little stays strict;
 *   - role and industry experience: past titles like this one, and years in
 *     the job's industry (industry.ts);
 *   - preferred screening answers add to "preferred qualifications";
 *   - for an on-site job, a candidate near it ranks a little higher
 *     (locality.ts).
 *
 * The parts are combined with the employer's saved matching weights, or the
 * standard weights when there are none. The seeker keeps the engine score
 * (`seekerMatchScore`): a recruiter's ranking is not a number to show the
 * candidate. The requirements checklist and its roll-up (qualifications.ts)
 * ride along; Shortlist Top filters on them.
 *
 * Pure: the caller loads documents (see scoreApplication.ts).
 */

import { DEFAULT_WEIGHTS, type MatchingWeights } from "@/lib/ai/matchingWeights";
import { flattenText, type JobProfile, type SeekerProfile } from "@/lib/matchScore";
import { applyJev, type PairScore } from "@/lib/matching/recommend";
import { evaluateKnockout } from "@/lib/matching/knockouts";
import { LOCALITY_POINTS } from "@/lib/matching/locality";
import {
  evaluateQualifications,
  type QualificationCheck,
  type QualificationInput,
  type RequirementsStatus,
} from "@/lib/matching/qualifications";

/** Application.matchBreakdown as the employer side stores it. 0–100 each. */
export interface ApplicantBreakdown {
  skills: number;
  role: number;
  experience: number;
  /** Present when the job names a qualification. */
  education?: number;
  /** Present when the job's industry could be read. */
  industry?: number;
  /** The final ranking score — always equal to aiMatchScore. */
  overall: number;
}

export interface ApplicantMatch {
  /** The employer's ranking score. */
  aiMatchScore: number;
  /** The engine score — what the seeker is shown for this pair. */
  seekerMatchScore: number;
  matchBreakdown: ApplicantBreakdown;
  /** Required skills with evidence (all of them, not the engine's core six). */
  matchedSkills: string[];
  missingSkills: string[];
  qualifications: QualificationCheck[];
  requirementsStatus: RequirementsStatus;
  /** True when the employer's own saved weights produced `aiMatchScore`. */
  weightsApplied: boolean;
}

const ROLE_STOPWORDS = new Set([
  "senior", "junior", "lead", "principal", "staff", "chief", "head", "assistant",
  "associate", "executive", "officer", "specialist", "trainee", "intern", "the", "and", "for", "with",
]);

function roleWords(title: string): Set<string> {
  return new Set(flattenText(title).split(" ").filter((w) => w.length >= 3 && !ROLE_STOPWORDS.has(w)));
}

/**
 * Role experience for the employer: the better of "wants this role" (the
 * engine's role part) and "has done this role" — a past job title sharing a
 * significant word with this one. The engine only reads the former, which
 * scores a career QA engineer with no stated preferences as neutral for a QA
 * job.
 */
function roleFit(seeker: SeekerProfile, job: JobProfile, engineRole: number): number {
  const target = roleWords(job.title ?? "");
  if (target.size === 0) return engineRole;
  const didIt = (seeker.roleHistory ?? []).some((role) => [...roleWords(role.title)].some((w) => target.has(w)));
  return didIt ? Math.max(engineRole, 90) : engineRole;
}

/** Share of "role / industry experience" that is industry, when the job names one. */
const INDUSTRY_SHARE = 0.4;

/**
 * Career length against the job's band, as a recruiter reads it. Short of
 * the minimum is scored as the engine scores it; past the maximum costs far
 * less, because an employer's "8–20 years" is a guide, not a ceiling —
 * the engine's curve halved a candidate 2.7 years over it.
 */
export function employerExperienceFit(years: number, known: boolean, minExp: number, maxExp: number): number {
  if (!known) return 50;
  if (years >= minExp && years <= maxExp) return 100;
  if (years < minExp) {
    const short = minExp - years;
    return short <= 1 ? 80 : short <= 3 ? 50 : 25;
  }
  const over = years - maxExp;
  return over <= 5 ? 85 : over <= 10 ? 70 : 55;
}

const EDUCATION_PART: Record<QualificationCheck["status"], number> = {
  met: 100,
  partial: 50,
  not_met: 0,
  unknown: 50,
};

/**
 * Weighted mean of the parts that apply to this job. A part the job gives no
 * basis for (no preferred skills, no required qualification) drops out and the
 * other weights are renormalised, so an employer's 15% on education neither
 * inflates nor deflates a job that asks for none.
 */
export function weightedApplicantScore(
  parts: { skills: number; preferred: number | null; experience: number; role: number; education: number | null },
  weights: MatchingWeights,
): number {
  const terms: Array<[number, number]> = [
    [weights.skills, parts.skills],
    [weights.experience, parts.experience],
    [weights.industryExperience, parts.role],
  ];
  if (parts.education !== null) terms.push([weights.education, parts.education]);
  if (parts.preferred !== null) terms.push([weights.preferredQualifications, parts.preferred]);
  const total = terms.reduce((sum, [w]) => sum + Math.max(0, w), 0);
  if (total <= 0) return 0;
  return Math.round(terms.reduce((sum, [w, v]) => sum + Math.max(0, w) * v, 0) / total);
}

export interface ApplicantMatchInput extends Omit<QualificationInput, "relevance"> {
  pair: PairScore;
  /** The employer's saved weights (customMatchingWeights), or null for the standard ones. */
  weights: MatchingWeights | null;
}

/** 0–100 share of the preferred screening answers given, null when the job sets none. */
function preferredAnswersPart(input: ApplicantMatchInput): number | null {
  const asked = new Set((input.questions ?? []).map((q) => q.id));
  const rules = (input.knockouts ?? []).filter((rule) => rule.preferred && asked.has(rule.questionId));
  if (rules.length === 0) return null;
  const answers = new Map((input.answers ?? []).map((a) => [a.questionId, a.answer]));
  const met = rules.filter((rule) => evaluateKnockout(rule, answers.get(rule.questionId)) === "met").length;
  return Math.round((met / rules.length) * 100);
}

const mean = (values: Array<number | null>): number | null => {
  const present = values.filter((v): v is number => v !== null);
  return present.length ? Math.round(present.reduce((a, b) => a + b, 0) / present.length) : null;
};

export function buildApplicantMatch(input: ApplicantMatchInput): ApplicantMatch {
  const { pair, seeker, job } = input;
  const relevance = pair.breakdown;
  const { checks, status } = evaluateQualifications({ ...input, relevance });

  const allRequired = relevance.requiredCoverage !== null;
  const education = checks.find((check) => check.key === "education");
  const role = roleFit(seeker, job, relevance.role);
  const industry = input.industry ? input.industry.score : null;
  const parts = {
    skills: relevance.requiredCoverage ?? relevance.skills,
    preferred: mean([relevance.preferredCoverage, preferredAnswersPart(input)]),
    experience: employerExperienceFit(seeker.experienceYears, seeker.experienceKnown !== false, job.minExp, job.maxExp),
    role: industry === null ? role : Math.round((1 - INDUSTRY_SHARE) * role + INDUSTRY_SHARE * industry),
    education: education ? EDUCATION_PART[education.status] : null,
  };

  const weighted = weightedApplicantScore(parts, input.weights ?? DEFAULT_WEIGHTS);
  // Jev's verdict, when the engine asked for one, nudges this number within
  // the same ±10 it may move the engine score; nearness then breaks ties.
  const judged = pair.aiConfidence !== undefined ? applyJev(weighted, pair.aiConfidence) : weighted;
  const score = Math.max(0, Math.min(100, judged + LOCALITY_POINTS[input.locality?.level ?? "unknown"]));

  return {
    aiMatchScore: score,
    seekerMatchScore: pair.score,
    matchBreakdown: {
      skills: parts.skills,
      role,
      experience: parts.experience,
      ...(parts.education !== null ? { education: parts.education } : {}),
      ...(industry !== null ? { industry } : {}),
      overall: score,
    },
    matchedSkills: allRequired ? relevance.requiredMatched : relevance.matchedSkills,
    missingSkills: allRequired ? relevance.requiredMissing : relevance.missingSkills,
    qualifications: checks,
    requirementsStatus: status,
    weightsApplied: input.weights !== null,
  };
}
