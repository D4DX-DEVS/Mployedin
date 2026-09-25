/**
 * Stage 2 — relevance. What the percentage in the email actually means.
 *
 * Only job content is scored here: skills, target role, depth of experience.
 * Location, pay band and work mode were settled by the eligibility gate, so a
 * job that reaches this function already satisfies them and must not also
 * collect points for doing so.
 *
 * That is the substantive change from the old single-pass scorer, where a job
 * in the wrong country still earned partial credit on location and could be
 * emailed anyway. A number that mixes "you are qualified for this" with "this
 * is near you" cannot be read as either.
 *
 * Skills are matched three ways, best-of: the exact string, a cached embedding
 * (see `skillVectors.ts`), then the CV text. Measured on the live corpus the
 * lexical pass alone scored a mean of 6.6/100, which is why the other two
 * exist.
 */

import { flattenText, normalizeSkill, tokenizeSkill, type SeekerProfile, type JobProfile } from "@/lib/matchScore";
import {
  RELEVANCE_WEIGHTS,
  CORE_SKILL_COUNT,
  NO_SKILL_EVIDENCE,
  SKILL_COSINE_EXACT,
  SKILL_COSINE_NEAR,
  SKILL_CREDIT_EXACT,
  SKILL_CREDIT_NEAR,
  SKILL_CREDIT_CV,
} from "@/lib/matching/constants";
import { bestSimilarity, EMPTY_SKILL_VECTORS, type SkillVectorMap } from "@/lib/matching/skillSimilarity";

export interface RelevanceBreakdown {
  /** 0–100, the number shown to the seeker. */
  overall: number;
  skills: number;
  role: number;
  experience: number;
  /** Job skills the seeker demonstrably has — used verbatim in the email. */
  matchedSkills: string[];
  /** Core job skills with no evidence either way. */
  missingSkills: string[];
  /** True when the job listed no skills, so `skills` is the no-evidence floor. */
  skillsUnknown: boolean;
  /**
   * Employer side: 0–100 coverage of EVERY required skill the job lists, null
   * when it lists none. `skills` reads only the first CORE_SKILL_COUNT (and
   * pads with preferred ones) so a seeker is not buried by a padded list; an
   * employer who listed ten must-haves is asking about all ten.
   */
  requiredCoverage: number | null;
  /** Every required skill with evidence, in the job's order. */
  requiredMatched: string[];
  /** Every required skill without. */
  requiredMissing: string[];
  /** 0–100 coverage of every preferred skill, null when it lists none. */
  preferredCoverage: number | null;
}

/**
 * The skills an employer actually needs.
 *
 * Long lists are padded — the median live job names 3 skills, the longest 12 —
 * and scoring against the tail meant a candidate who met every real
 * requirement still read as a 50% match. Required skills come first; preferred
 * ("nice to have") ones only fill the remaining slots.
 */
function coreSkills(job: JobProfile): string[] {
  const required = job.skills ?? [];
  if (required.length >= CORE_SKILL_COUNT) return required.slice(0, CORE_SKILL_COUNT);
  const preferred = job.preferredSkills ?? [];
  return [...required, ...preferred].slice(0, CORE_SKILL_COUNT);
}

/**
 * The CV as whole words, each normalised the way skills are, wrapped in spaces
 * so a lookup is a whole-phrase test: "ReactJS" reads as "react" and "Node.js"
 * as "node js", while "JavaScript" never reads as "java", "WhatsApp" as "sap"
 * or "Excellent" as "excel". A raw substring test awarded all three.
 */
function cvWords(cvText: string): string {
  const words = flattenText(cvText).trim().split(" ").filter(Boolean).map(normalizeSkill);
  return words.length ? ` ${words.join(" ")} ` : "";
}

/** Whether one skill token appears in the CV as a whole word or phrase. */
function cvHasSkill(cv: string, token: string): boolean {
  const phrase = flattenText(token).trim().split(" ").filter(Boolean).map(normalizeSkill).join(" ");
  return phrase.length > 2 && cv.includes(` ${phrase} `);
}

/**
 * How much credit the seeker earns for one required skill, in [0, 1].
 *
 * Best of three kinds of evidence, in descending order of confidence. Below
 * SKILL_COSINE_NEAR nothing is awarded: a weak vector neighbour is a guess, and
 * inventing a match is worse than missing one.
 */
function creditFor(
  jobSkill: string,
  seekerSkills: readonly string[],
  seekerTokens: ReadonlySet<string>,
  cvHaystack: string,
  vectors: SkillVectorMap,
): number {
  for (const token of tokenizeSkill(jobSkill)) {
    if (seekerTokens.has(token)) return 1;
  }

  const sim = bestSimilarity(jobSkill, seekerSkills, vectors);
  if (sim !== null && sim >= SKILL_COSINE_EXACT) return SKILL_CREDIT_EXACT;

  if (cvHaystack) {
    for (const token of tokenizeSkill(jobSkill)) {
      if (cvHasSkill(cvHaystack, token)) return SKILL_CREDIT_CV;
    }
  }

  if (sim !== null && sim >= SKILL_COSINE_NEAR) return SKILL_CREDIT_NEAR;
  return 0;
}

/** Whether a job title matches anything the seeker said they are looking for. */
function roleScore(seeker: SeekerProfile, job: JobProfile): number {
  const roles = seeker.preferredRoles ?? [];
  const title = (job.title ?? "").toLowerCase().trim();
  // Neutral when either side is silent — an unstated target must not cost the
  // job points, the same rule the eligibility gate follows.
  if (!title || roles.length === 0) return 0.5;

  for (const role of roles) {
    const r = role.toLowerCase().trim();
    if (!r) continue;
    if (title === r) return 1;
    if (title.includes(r) || r.includes(title)) return 0.9;
  }

  // Partial overlap on the significant words: "Senior QA Engineer" against a
  // seeker targeting "Test Engineer" should not read the same as no relation.
  const stop = new Set(["senior", "junior", "lead", "the", "and", "of", "a", "an"]);
  const titleWords = new Set(title.split(/\W+/).filter((w) => w.length > 2 && !stop.has(w)));
  for (const role of roles) {
    const words = role.toLowerCase().split(/\W+/).filter((w) => w.length > 2 && !stop.has(w));
    if (words.some((w) => titleWords.has(w))) return 0.6;
  }
  return 0.15;
}

/** How well the seeker's career length sits inside the job's band. */
function experienceScore(seeker: SeekerProfile, job: JobProfile): number {
  if (seeker.experienceKnown === false) return 0.5;
  const years = seeker.experienceYears;
  if (years >= job.minExp && years <= job.maxExp) return 1;
  const gap = Math.min(Math.abs(years - job.minExp), Math.abs(years - job.maxExp));
  if (gap <= 1) return 0.8;
  if (gap <= 3) return 0.5;
  return 0.25;
}

/**
 * Score one eligible job for one seeker.
 *
 * `vectors` is optional: without it the skill match is lexical + CV only, which
 * is the behaviour when the embedding cache is cold or the AI key is missing.
 */
export function calculateRelevance(
  seeker: SeekerProfile,
  job: JobProfile,
  vectors: SkillVectorMap = EMPTY_SKILL_VECTORS,
): RelevanceBreakdown {
  const core = coreSkills(job);
  const seekerSkills = seeker.skills ?? [];
  const seekerTokens = new Set(seekerSkills.flatMap(tokenizeSkill));
  const cvHaystack = cvWords(seeker.cvText ?? "");

  // Cached so a skill that sits in `core` and in the required or preferred
  // list below is judged once.
  const credits = new Map<string, number>();
  const creditOf = (skill: string) => {
    let credit = credits.get(skill);
    if (credit === undefined) {
      credit = creditFor(skill, seekerSkills, seekerTokens, cvHaystack, vectors);
      credits.set(skill, credit);
    }
    return credit;
  };

  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];
  let skillsFraction: number;
  const skillsUnknown = core.length === 0;

  if (skillsUnknown) {
    skillsFraction = NO_SKILL_EVIDENCE;
  } else {
    let total = 0;
    for (const skill of core) {
      const credit = creditOf(skill);
      total += credit;
      if (credit >= SKILL_CREDIT_NEAR) matchedSkills.push(skill);
      else missingSkills.push(skill);
    }
    skillsFraction = total / core.length;
  }

  // Required and preferred coverage apart, over the whole lists, from the
  // same cached credits.
  const coverage = (list: readonly string[]) =>
    list.length === 0 ? null : Math.round((list.reduce((sum, s) => sum + creditOf(s), 0) / list.length) * 100);
  const required = job.skills ?? [];
  const requiredCoverage = coverage(required);
  const requiredMatched = required.filter((skill) => creditOf(skill) >= SKILL_CREDIT_NEAR);
  const requiredMissing = required.filter((skill) => creditOf(skill) < SKILL_CREDIT_NEAR);
  const preferredCoverage = coverage(job.preferredSkills ?? []);

  const role = roleScore(seeker, job);
  const experience = experienceScore(seeker, job);

  const overall =
    skillsFraction * RELEVANCE_WEIGHTS.skills +
    role * RELEVANCE_WEIGHTS.role +
    experience * RELEVANCE_WEIGHTS.experience;

  return {
    overall: Math.round(overall * 100),
    skills: Math.round(skillsFraction * 100),
    role: Math.round(role * 100),
    experience: Math.round(experience * 100),
    matchedSkills,
    missingSkills,
    skillsUnknown,
    requiredCoverage,
    requiredMatched,
    requiredMissing,
    preferredCoverage,
  };
}
