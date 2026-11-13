/**
 * One seeker against one job's requirements — education, experience "in what",
 * licences / certificates, languages — judged once, read by everything:
 * the seeker score (relevance.ts), the employer score (applicantScore.ts), the
 * requirement report both sides see (requirementReport.ts) and the email rule.
 * One place decides, so the four cannot disagree about "does this person have
 * the degree".
 *
 * Status, never colour alone downstream:
 *   met       the profile, CV or an answer shows it ("equivalent" when not word-for-word)
 *   partial   close: one level, one year, part of the languages, a different field
 *   not_met   the candidate's own information falls short
 *   unknown   nothing either way — "needs verification", never a failure
 *
 * Pure, no I/O. Marks and rules: docs/superpowers/plans/2026-11-12-requirement-
 * aware-match-scoring.md, section 2.4.
 */

import type { SeekerProfile, JobProfile } from "@/lib/matchScore";
import type { EducationLevel } from "@/lib/matching/educationLevel";
import { hasSpecificFamily } from "@/lib/matching/fieldOfStudy";
import { sharesRole } from "@/lib/matching/roleMatch";
import type {
  CredentialRequirement,
  EducationRequirement,
  ExperienceRequirement,
  Importance,
  JobRequirements,
} from "@/lib/matching/jobRequirements";
import { spannedYears, type EducationEntry, type RoleEvidence, type SeekerEvidence } from "@/lib/matching/seekerEvidence";

export type PartStatus = "met" | "partial" | "not_met" | "unknown";
export type FieldRelation = "none" | "same" | "related" | "not_stated" | "different";
export type MustHaveStatus = "met" | "unverified" | "not_met";

export interface EducationEval {
  asked: EducationRequirement;
  status: PartStatus;
  mark: number;
  relation: FieldRelation;
  held: EducationLevel;
  /** The entry that earned the mark, as the seeker wrote it. */
  entry?: string;
  /** Met, but not word-for-word: a higher degree, or a related field. */
  equivalent: boolean;
}

export interface ExperienceEval {
  asked: ExperienceRequirement;
  status: PartStatus;
  /** 0-100, seeker-side curve. */
  mark: number;
  known: boolean;
  totalYears: number;
  /** Years in roles like this one; null when no role could be weighed. */
  relevantYears: number | null;
  /** Roles counted as relevant, longest first. */
  relevantRoles: RoleEvidence[];
  /** Some relevant roles have no dates, so their years could not be counted. */
  undatedRoles: boolean;
  /**
   * Set when the requirement is met only by counting a role whose end date is
   * a guess: the titles of those roles. The status is then "unknown" and the
   * mark is earned on `confirmedYears` alone (owner, 2026-11-13).
   */
  needsEndDate?: string[];
  /** The deciding years without the guessed spans; set with `needsEndDate`. */
  confirmedYears?: number;
}

export type CredentialFound = "listed" | "cv" | "none" | "no_text";

export interface CredentialEval {
  asked: CredentialRequirement;
  status: PartStatus;
  mark: number;
  found: CredentialFound;
  /** Where it was found, quoted. */
  quote?: string;
}

export interface LanguageEval {
  importance: Importance;
  status: PartStatus;
  mark: number;
  have: string[];
  missing: string[];
}

export interface RequirementEvaluation {
  education: EducationEval | null;
  /** Always present; `asked.minYears` 0 means the job states no minimum. */
  experience: ExperienceEval;
  credentials: CredentialEval[];
  /** Average credential mark, null when the job asks for none. */
  credentialsMark: number | null;
  languages: LanguageEval | null;
  /** Roll-up of the must-haves among these four (the email rule, D16). */
  mustHaveStatus: MustHaveStatus;
  /**
   * The candidate's highest qualification as written, null when they list
   * none. Shown when the job sets no education (display only, no points).
   */
  heldEducation?: string | null;
}

const FIELD_MARK: Record<FieldRelation, number> = { none: 100, same: 100, related: 85, not_stated: 85, different: 70 };
const RELATION_RANK: Record<FieldRelation, number> = { none: 4, same: 4, related: 3, not_stated: 2, different: 1 };
/** Licence marks (D13): nothing found reads as "needs verification", not as a failure. */
const CREDENTIAL_MARK: Record<CredentialFound, number> = { listed: 100, cv: 70, none: 25, no_text: 25 };

// ── fallbacks, for callers that built a profile by hand ─────────────────────

function evidenceOf(seeker: SeekerProfile): SeekerEvidence {
  if (seeker.evidence) return seeker.evidence;
  return {
    level: (seeker.educationLevel ?? 0) as EducationLevel,
    entries: [],
    languages: [],
    listed: seeker.skills ?? [],
    cv: (seeker.cvText ?? "").toLowerCase(),
    roles: (seeker.roleHistory ?? []).map((r) => ({ title: r.title, company: "", text: r.title.toLowerCase(), years: r.years, dated: true })),
  };
}

export function requirementsOf(job: JobProfile): JobRequirements {
  if (job.requirements) return job.requirements;
  const level = (job.requiredEducationLevel ?? 0) as EducationLevel;
  return {
    education: { level, importance: "must", source: level > 0 ? "education_box" : "none", text: "", fields: [], families: [], relatedAllowed: false, fieldEssential: false },
    experience: { minYears: job.minExp, maxYears: job.maxExp, subject: job.title ?? "", subjectSource: "title", importance: "must" },
    credentials: [],
    languages: { names: [], importance: "nice", source: "none", unconfirmed: [] },
    visaLines: [],
  };
}

// ── education ───────────────────────────────────────────────────────────────

function entryRelation(asked: EducationRequirement, entry: EducationEntry): FieldRelation {
  const same = asked.fields.some((field) => {
    const significant = field.split(" ").filter((w) => w.length >= 4);
    return significant.length > 0 && significant.every((w) => entry.text.includes(w));
  });
  if (same) return "same";
  if (asked.families.some((family) => entry.families.has(family))) return "related";
  if (!entry.fieldStated || !hasSpecificFamily(entry.families)) return "not_stated";
  return "different";
}

export function evaluateEducation(asked: EducationRequirement, evidence: SeekerEvidence): EducationEval | null {
  if (asked.level <= 0) return null;
  const held = evidence.level;
  const base = { asked, held, relation: "none" as FieldRelation, equivalent: false };
  if (held <= 0) return { ...base, status: "unknown", mark: 25 };
  const gap = asked.level - held;
  const top = evidence.entries.filter((e) => e.level === held)[0]?.label;
  if (gap >= 2) return { ...base, status: "not_met", mark: 0, ...(top ? { entry: top } : {}) };
  if (gap === 1) return { ...base, status: "partial", mark: 50, ...(top ? { entry: top } : {}) };

  // Every degree at or above the level counts; the best field match wins. A
  // B.Tech in Computer Science still counts for a "Bachelor's in CS" job when
  // the seeker's highest degree is an MBA.
  const qualifying = evidence.entries.filter((e) => e.level >= asked.level);
  const hasField = asked.fields.length > 0 || asked.families.length > 0;
  let relation: FieldRelation = hasField ? "not_stated" : "none";
  let best = qualifying[0];
  if (hasField) {
    let rank = 0;
    for (const entry of qualifying) {
      const r = entryRelation(asked, entry);
      if (RELATION_RANK[r] > rank) [relation, rank, best] = [r, RELATION_RANK[r], entry];
    }
  }
  const above = (best?.level ?? held) > asked.level;
  const entry = best?.label ? { entry: best.label } : {};
  if (asked.fieldEssential && relation === "different") return { ...base, ...entry, relation, status: "not_met", mark: 0 };
  if (asked.fieldEssential && relation === "not_stated") return { ...base, ...entry, relation, status: "unknown", mark: 85 };
  const mark = relation === "related" && asked.relatedAllowed ? 100 : FIELD_MARK[relation];
  return {
    ...base,
    ...entry,
    relation,
    status: relation === "different" ? "partial" : "met",
    mark,
    equivalent: above || relation === "related",
  };
}

// ── experience ──────────────────────────────────────────────────────────────

const SUBJECT_NOISE = new Set(
  ("experience years year field industry role roles similar relevant related professional work working the and with for any " +
    "engineer developer manager executive specialist officer staff pipeline senior junior lead assistant associate trainee")
    .split(" "),
);

function subjectWords(subject: string): string[] {
  return subject
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map((w) => w.replace(/^[.]+|[.]+$/g, ""))
    .filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !SUBJECT_NOISE.has(w));
}

const hasWord = (text: string, word: string) =>
  new RegExp(`(?<![a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(text);

/** The seeker-side years curve; past the maximum costs far less than short of the minimum. */
export function yearsMark(years: number, min: number, max: number): number {
  if (years >= min && years <= max) return 100;
  if (years < min) {
    const short = min - years;
    return short <= 1 ? 80 : short <= 3 ? 50 : 25;
  }
  const over = years - max;
  return over <= 5 ? 85 : over <= 10 ? 70 : 55;
}

export function evaluateExperience(
  asked: ExperienceRequirement,
  seeker: SeekerProfile,
  evidence: SeekerEvidence,
  jobTitle: string,
  jobSkills: readonly string[],
): ExperienceEval {
  const known = seeker.experienceKnown !== false;
  const totalYears = seeker.experienceYears;
  // Only the job title to go on: a role is relevant when its title shares the
  // job's role, or it names one of the job's skills. Single title words are
  // not enough — "E2E Pipeline QA Engineer" made a "Full Stack Intern" whose
  // description said "pipeline" count as QA years (live check 2026-11-12).
  const fromTitle = asked.subjectSource === "title";
  const words = fromTitle ? [] : subjectWords(asked.subject);
  const skills = jobSkills.map((s) => s.toLowerCase().trim()).filter((s) => s.length >= 3);
  const relevant = evidence.roles.filter(
    (role) =>
      sharesRole(jobTitle, [role.title]) ||
      (!fromTitle && asked.subject && sharesRole(asked.subject, [role.title])) ||
      words.some((w) => hasWord(role.text, w)) ||
      skills.some((s) => hasWord(role.text, s)),
  );
  const dated = relevant.filter((r) => r.dated);
  const relevantYears = evidence.roles.length === 0 ? null : Math.round(spannedYears(dated) * 10) / 10;
  const undatedRoles = relevant.some((r) => !r.dated);
  const base = {
    asked,
    known,
    totalYears,
    relevantYears,
    relevantRoles: [...relevant].sort((a, b) => b.years - a.years),
    undatedRoles,
  };

  const asksYears = asked.minYears > 0;
  if (!known) return { ...base, status: asksYears ? "unknown" : "met", mark: asksYears ? 25 : 50 };

  const counted = relevantYears !== null && !(undatedRoles && dated.length === 0) ? relevantYears : null;
  // The employer named the subject ("5 years in MERN stack"): relevant years
  // decide, never below half of what the career length earns. Only the title
  // to go on: a "Software Engineer" applying to "MERN Stack Developer" must not
  // lose half the mark over wording, so career length carries most of it.
  const stated = asked.subjectSource !== "title";
  const markFor = (total: number, relevantCounted: number | null): number => {
    const totalMark = yearsMark(total, asked.minYears, asked.maxYears);
    const floor = Math.round(totalMark * (stated ? 0.5 : 0.8));
    return relevantCounted === null ? totalMark : Math.max(yearsMark(relevantCounted, asked.minYears, asked.maxYears), floor);
  };
  const mark = markFor(totalYears, counted);
  if (!asksYears) return { ...base, status: "met", mark };

  const decidingYears = stated && counted !== null ? counted : totalYears;
  // Partly: the deciding years are within a year of the minimum, or some of
  // the career is in the subject and the career is long enough. Eight years in
  // sales against "5 years in MERN stack" is not Partly — none of it is MERN.
  const someRelevant = stated && counted !== null && counted > 0 && totalYears >= asked.minYears;
  const status: PartStatus =
    decidingYears >= asked.minYears
      ? "met"
      : decidingYears >= asked.minYears - 1 || someRelevant
        ? "partial"
        : "not_met";

  // A role with no end date is taken to end where the next one starts — a
  // guess. When the requirement is met only with that guess counted, it is
  // not met yet: "needs checking", marked on the years that are certain, and
  // the seeker is told which role to date (owner, 2026-11-13: a six-month
  // guess for an internship met a "2–5 years" must-have).
  const guessed = (status === "met" ? (stated && counted !== null ? relevant : evidence.roles) : []).filter((r) => r.estimated);
  if (guessed.length > 0) {
    const round = (n: number) => Math.round(n * 10) / 10;
    const certain = (roles: readonly RoleEvidence[]) => roles.filter((r) => !r.estimated);
    const guessedTotal = spannedYears(evidence.roles) - spannedYears(certain(evidence.roles));
    const confirmedTotal = round(Math.max(0, totalYears - guessedTotal));
    const confirmedCounted = counted === null ? null : round(spannedYears(certain(dated)));
    const confirmedYears = stated && confirmedCounted !== null ? confirmedCounted : confirmedTotal;
    if (confirmedYears < asked.minYears) {
      return {
        ...base,
        status: "unknown",
        mark: markFor(confirmedTotal, confirmedCounted),
        confirmedYears,
        needsEndDate: guessed.map((r) => r.title).filter(Boolean),
      };
    }
  }
  return { ...base, status, mark };
}

// ── licences / certificates ─────────────────────────────────────────────────

const DRIVING_EVIDENCE = /driving|licen[cs]e|(?<![a-z])(?:lmv|hmv|lcv)(?![a-z])/;

function foundIn(asked: CredentialRequirement, text: string): number {
  if (asked.driving) return text.search(DRIVING_EVIDENCE);
  if (asked.terms.length === 0) return text.search(/licen[cs]e|certif/);
  const hits = asked.terms.map((term) => text.search(new RegExp(`(?<![a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`)));
  const found = hits.filter((at) => at >= 0);
  const enough = asked.anyOf ? found.length > 0 : found.length * 2 >= asked.terms.length;
  return enough ? Math.min(...found) : -1;
}

function quoteAround(text: string, at: number): string {
  const start = Math.max(0, text.lastIndexOf(" ", Math.max(0, at - 30)) + 1);
  const endSpace = text.indexOf(" ", Math.min(text.length, at + 50));
  const end = endSpace < 0 ? text.length : endSpace;
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${end < text.length ? "…" : ""}`;
}

export function evaluateCredential(asked: CredentialRequirement, evidence: SeekerEvidence): CredentialEval {
  const listed = evidence.listed.find((item) => foundIn(asked, item.toLowerCase()) >= 0);
  if (listed) return { asked, status: "met", mark: CREDENTIAL_MARK.listed, found: "listed", quote: listed };
  const at = evidence.cv ? foundIn(asked, evidence.cv) : -1;
  if (at >= 0) return { asked, status: "met", mark: CREDENTIAL_MARK.cv, found: "cv", quote: quoteAround(evidence.cv, at) };
  const found: CredentialFound = evidence.listed.length > 0 || evidence.cv ? "none" : "no_text";
  return { asked, status: "unknown", mark: CREDENTIAL_MARK[found], found };
}

// ── languages ───────────────────────────────────────────────────────────────

export function evaluateLanguages(names: readonly string[], importance: Importance, evidence: SeekerEvidence): LanguageEval | null {
  if (names.length === 0) return null;
  const have = names.filter((n) => evidence.languages.includes(n));
  const missing = names.filter((n) => !have.includes(n));
  if (evidence.languages.length === 0) return { importance, status: "unknown", mark: 25, have, missing };
  const status: PartStatus = missing.length === 0 ? "met" : have.length > 0 ? "partial" : "not_met";
  return { importance, status, mark: Math.round((have.length / names.length) * 100), have, missing };
}

// ── roll-up ─────────────────────────────────────────────────────────────────

function rollUp(statuses: readonly PartStatus[]): MustHaveStatus {
  if (statuses.includes("not_met")) return "not_met";
  if (statuses.includes("unknown")) return "unverified";
  return "met";
}

export function evaluateRequirements(seeker: SeekerProfile, job: JobProfile): RequirementEvaluation {
  const evidence = evidenceOf(seeker);
  const req = requirementsOf(job);
  const education = evaluateEducation(req.education, evidence);
  const experience = evaluateExperience(req.experience, seeker, evidence, job.title ?? "", job.skills ?? []);
  const credentials = req.credentials.map((c) => evaluateCredential(c, evidence));
  const languages = evaluateLanguages(req.languages.names, req.languages.importance, evidence);

  const must: PartStatus[] = [];
  if (education && education.asked.importance === "must") must.push(education.status);
  if (experience.asked.minYears > 0 && experience.asked.importance === "must") must.push(experience.status);
  for (const c of credentials) if (c.asked.importance === "must") must.push(c.status);
  if (languages && languages.importance === "must") must.push(languages.status);

  return {
    education,
    experience,
    credentials,
    credentialsMark: credentials.length ? Math.round(credentials.reduce((s, c) => s + c.mark, 0) / credentials.length) : null,
    languages,
    mustHaveStatus: rollUp(must),
    heldEducation: highestEntry(evidence),
  };
}

function highestEntry(evidence: SeekerEvidence): string | null {
  const top = [...evidence.entries].sort((a, b) => b.level - a.level)[0];
  return top?.label || null;
}
