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
  RELEVANCE_POINTS,
  type RelevancePart,
  CORE_SKILL_COUNT,
  NO_SKILL_EVIDENCE,
  SKILL_COSINE_EXACT,
  SKILL_COSINE_NEAR,
  SKILL_CREDIT_EXACT,
  SKILL_CREDIT_NEAR,
  SKILL_CREDIT_CV,
} from "@/lib/matching/constants";
import { bestSimilarity, EMPTY_SKILL_VECTORS, type SkillVectorMap } from "@/lib/matching/skillSimilarity";
import { evaluateRequirements, requirementsOf, type MustHaveStatus, type RequirementEvaluation } from "@/lib/matching/requirementParts";
import { LANGUAGES, languageNames } from "@/lib/matching/jobRequirements";
import { sharesRole } from "@/lib/matching/roleMatch";

export interface RelevanceBreakdown {
  /** 0–100, the number shown to the seeker. */
  overall: number;
  skills: number;
  role: number;
  experience: number;
  /** 0–100; null when the job sets no education requirement (not scored). */
  education: number | null;
  /** 0–100 average licence mark, null when the job asks for none. */
  credentials: number | null;
  /** 0–100 share of asked languages held, null when the job asks for none. */
  languages: number | null;
  /** Each part's share of this job's score, in percent (parts in play only). */
  shares: Partial<Record<RelevancePart, number>>;
  /** Per-requirement verdicts behind education / experience / licences / languages. */
  evaluation: RequirementEvaluation;
  /** Must-haves roll-up: a job is emailed only when "met" (D16). */
  mustHaveStatus: MustHaveStatus;
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
  preferredMatched: string[];
  preferredMissing: string[];
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
 * Whether the job asks for anything a match can be judged on beyond its title
 * (owner decision D20, 2026-11-12): a skill (stated or extracted), a stated
 * minimum of years, a minimum education ("No minimum" does not count), a
 * licence or certificate, or a language the employer confirmed (D14). A job
 * with none stays visible and scored in the app, but cannot trigger matching
 * emails or auto-apply — a title alone is too little to mail someone about.
 */
export function hasIdentifiableRequirement(job: JobProfile): boolean {
  if (coreSkills(job).length > 0) return true;
  const req = requirementsOf(job);
  return (
    req.experience.minYears > 0 ||
    req.education.level > 0 ||
    req.credentials.length > 0 ||
    req.languages.names.length > 0
  );
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

/** Words around a language name that still leave it a language: "English proficiency", "fluent in Malayalam". */
const LANGUAGE_FILLER = new Set(
  "bilingual multilingual trilingual proficiency proficient fluent fluency in and or speaking spoken written writing reading communication skills skill language languages native good excellent strong business working knowledge of".split(" "),
);
/** Words around "driving" that still leave it a driving licence: "Driving", "valid UAE driving licence". */
const DRIVING_SKILL = /(?<![a-z])driv(?:ing|er'?s?)(?![a-z])/;
const DRIVING_FILLER = new Set(
  "driving driver driver's drivers licence license valid uae gcc indian lmv hmv lcv light heavy vehicle vehicles motor two four wheeler with a".split(" "),
);
/** The seeker side: a driving licence named in their skills, certifications or CV. Stricter than any "licence". */
const DRIVING_HELD = /driving|driver'?s licen|(?<![a-z])(?:lmv|hmv|lcv)(?![a-z])/;

/**
 * A required "skill" that is really a language or a driving licence, judged
 * from the seeker's languages / licence evidence: 1 when held, 0 when not,
 * null when the skill is neither. Employers type "English proficiency" or
 * "Driving" as skills; read as skills they showed as Missing beside a
 * Languages row saying "You speak all of them" (owner, 2026-11-12).
 */
function languagesNamed(lower: string, words: readonly string[]): string[] | null {
  const named = LANGUAGES.filter((name) => words.includes(name));
  return named.length > 0 && words.every((w) => named.includes(w) || LANGUAGE_FILLER.has(w)) ? named : null;
}

function isDrivingSkill(lower: string, words: readonly string[]): boolean {
  return DRIVING_SKILL.test(lower) && words.every((w) => DRIVING_FILLER.has(w));
}

/**
 * A "skill" that is only a language or a driving licence. Many people hold
 * one, whatever their trade, so it alone does not make someone a candidate for
 * a job: "Bilingual (English/Arabic)" listed Safety Officers for a Science
 * Teacher (rollout row 33, 2026-11-13).
 */
export function isLanguageOrDrivingSkill(skill: string): boolean {
  const lower = skill.toLowerCase().trim();
  const words = lower.split(/[^a-z']+/).filter(Boolean);
  return languagesNamed(lower, words) !== null || isDrivingSkill(lower, words);
}

function evidenceCredit(jobSkill: string, seeker: SeekerProfile): number | null {
  const lower = jobSkill.toLowerCase().trim();
  const words = lower.split(/[^a-z']+/).filter(Boolean);
  const named = languagesNamed(lower, words);
  if (named) {
    const spoken = new Set(seeker.evidence?.languages ?? []);
    return named.every((name) => spoken.has(name)) ? 1 : null;
  }
  if (isDrivingSkill(lower, words)) {
    const evidence = seeker.evidence;
    const text = [...(evidence?.listed ?? seeker.skills ?? []), evidence?.cv ?? seeker.cvText ?? ""].join(" ").toLowerCase();
    return DRIVING_HELD.test(text) ? 1 : null;
  }
  return null;
}

/**
 * The job's skill lists without the "skills" it also asks for as a language or
 * a driving licence (owner, 2026-11-13). Employers type "English proficiency"
 * or "Driving" as skills and again under Languages or as a licence line;
 * counted in both, one missing licence cost the seeker twice and the job page
 * listed it twice. Each now counts once, in its own part. A language typed only
 * as a skill (the job has no Languages list) stays a skill — evidenceCredit
 * judges it.
 */
function ownSkillLists(job: JobProfile): { required: string[]; preferred: string[] } {
  const required = job.skills ?? [];
  const preferred = job.preferredSkills ?? [];
  const req = requirementsOf(job);
  const askedLanguages = new Set(languageNames(req.languages.names));
  const askedDriving = req.credentials.some((c) => c.driving);
  if (askedLanguages.size === 0 && !askedDriving) return { required, preferred };
  const elsewhere = (skill: string) => {
    const lower = skill.toLowerCase().trim();
    const words = lower.split(/[^a-z']+/).filter(Boolean);
    const named = languagesNamed(lower, words);
    if (named) return named.every((name) => askedLanguages.has(name));
    return askedDriving && isDrivingSkill(lower, words);
  };
  return { required: required.filter((s) => !elsewhere(s)), preferred: preferred.filter((s) => !elsewhere(s)) };
}

/**
 * Role fit for a past job of the same kind of work. The employer score has
 * given it since 2026-10 (applicantScore.roleFit, 90); the seeker score now
 * does too. Below an exact match on a role the seeker says they WANT, because
 * what they want next outranks what they did.
 */
const ROLE_DONE_BEFORE = 0.9;

/**
 * Whether a job title matches what the seeker wants (preferred roles) or has
 * done (past job titles), whichever fits better.
 *
 * Past titles count since 2026-11-13 (owner). Before, a seeker with no
 * preferred roles sat at a neutral 50 for every job, so any job listing no
 * skills read 69% for anyone — a VLSI engineer's top three were MERN Stack
 * Developer, Medical Executive and PGT Accountancy — and 1.9 years as a "MERN
 * Stack Developer" counted for nothing on a MERN Stack Developer job.
 * Past titles use `sharesRole`, so a shared generic noun ("engineer",
 * "developer") is not a match.
 */
function roleScore(seeker: SeekerProfile, job: JobProfile): number {
  const title = (job.title ?? "").toLowerCase().trim();
  if (!title) return 0.5;
  const pastTitles = (seeker.roleHistory ?? []).map((r) => r.title).filter((t) => t?.trim());
  const didIt = pastTitles.length > 0 && sharesRole(title, pastTitles) ? ROLE_DONE_BEFORE : 0;
  const wanted = preferredRoleScore(seeker.preferredRoles ?? [], title);
  // Neutral only when the seeker told us nothing at all: no wanted role, no
  // past job. A work history that is unrelated to the job is an answer.
  if (wanted === null) return pastTitles.length === 0 ? 0.5 : Math.max(didIt, ROLE_NO_RELATION);
  return Math.max(wanted, didIt);
}

/** Nothing in common between the job title and the seeker's roles. */
const ROLE_NO_RELATION = 0.15;

/** The preferred-role match alone; `null` when the seeker named no role. */
function preferredRoleScore(roles: readonly string[], title: string): number | null {
  if (roles.length === 0) return null;

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
  return ROLE_NO_RELATION;
}

/**
 * Each part's share in whole percent, adding to exactly 100: largest-remainder
 * rounding, so 25 + 15 of 40 reads 63 / 37, not 63 / 38.
 */
function sharesOf(parts: readonly RelevancePart[], inPlay: number): Partial<Record<RelevancePart, number>> {
  const exact = parts.map((part) => ({ part, value: (RELEVANCE_POINTS[part] / inPlay) * 100 }));
  const out = exact.map(({ part, value }) => ({ part, value: Math.floor(value), rest: value - Math.floor(value) }));
  let left = 100 - out.reduce((sum, p) => sum + p.value, 0);
  for (const p of [...out].sort((a, b) => b.rest - a.rest)) {
    if (left <= 0) break;
    p.value += 1;
    left -= 1;
  }
  return Object.fromEntries(out.map(({ part, value }) => [part, value])) as Partial<Record<RelevancePart, number>>;
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
  // Languages and a driving licence the job also asks for in their own parts
  // are scored there only (ownSkillLists).
  const own = ownSkillLists(job);
  const core = coreSkills({ ...job, skills: own.required, preferredSkills: own.preferred });
  const seekerSkills = seeker.skills ?? [];
  const seekerTokens = new Set(seekerSkills.flatMap(tokenizeSkill));
  const cvHaystack = cvWords(seeker.cvText ?? "");

  // Cached so a skill that sits in `core` and in the required or preferred
  // list below is judged once.
  const credits = new Map<string, number>();
  const creditOf = (skill: string) => {
    let credit = credits.get(skill);
    if (credit === undefined) {
      credit = evidenceCredit(skill, seeker) ?? creditFor(skill, seekerSkills, seekerTokens, cvHaystack, vectors);
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
  const required = own.required;
  const requiredCoverage = coverage(required);
  const requiredMatched = required.filter((skill) => creditOf(skill) >= SKILL_CREDIT_NEAR);
  const requiredMissing = required.filter((skill) => creditOf(skill) < SKILL_CREDIT_NEAR);
  const preferredCoverage = coverage(own.preferred);
  const preferredMatched = own.preferred.filter((skill) => creditOf(skill) >= SKILL_CREDIT_NEAR);
  const preferredMissing = own.preferred.filter((skill) => creditOf(skill) < SKILL_CREDIT_NEAR);

  const role = roleScore(seeker, job);
  // Education, experience "in what", licences, languages — read against the
  // job's own requirements (requirementParts.ts). Experience uses its mark,
  // which counts relevant years when the employer named the subject.
  const evaluation = evaluateRequirements(seeker, job);
  const experience = evaluation.experience.mark / 100;
  // Only what the job asks for is scored (owner, 2026-11-12: "No free points
  // for unspecified requirements"). No education requirement: education is
  // left out, neither awarded nor penalised. Asked and the profile is silent:
  // that is scored (25, needs verification), never treated as not asked.
  const education = evaluation.education ? evaluation.education.mark / 100 : null;

  // Points earned over points in play (D7/D8/D12): skills drop out when the job
  // lists none; licences and languages join only when the job states them.
  const parts: Array<[RelevancePart, number]> = [
    ["role", role],
    ["experience", experience],
  ];
  if (education !== null) parts.push(["education", education]);
  if (!skillsUnknown) parts.push(["skills", skillsFraction]);
  if (evaluation.credentialsMark !== null) parts.push(["credentials", evaluation.credentialsMark / 100]);
  if (evaluation.languages) parts.push(["languages", evaluation.languages.mark / 100]);
  const inPlay = parts.reduce((sum, [part]) => sum + RELEVANCE_POINTS[part], 0);
  const earned = parts.reduce((sum, [part, value]) => sum + RELEVANCE_POINTS[part] * value, 0);
  const shares = sharesOf(parts.map(([part]) => part), inPlay);

  return {
    overall: Math.round((earned / inPlay) * 100),
    skills: Math.round(skillsFraction * 100),
    role: Math.round(role * 100),
    experience: Math.round(experience * 100),
    education: education === null ? null : Math.round(education * 100),
    credentials: evaluation.credentialsMark,
    languages: evaluation.languages ? evaluation.languages.mark : null,
    shares,
    evaluation,
    mustHaveStatus: evaluation.mustHaveStatus,
    matchedSkills,
    missingSkills,
    skillsUnknown,
    requiredCoverage,
    requiredMatched,
    requiredMissing,
    preferredCoverage,
    preferredMatched,
    preferredMissing,
  };
}
