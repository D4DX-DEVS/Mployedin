/**
 * What a job requires, beyond skills: education, experience "in what",
 * licences / certificates and languages, each must-have or nice-to-have.
 *
 * The employer's own form entry always wins. Old jobs, and jobs posted before
 * these fields existed, are read from the Education box and the Qualifications
 * lines — on 2026-11-12, 14 of the 18 live jobs with an education requirement
 * stated it only there, where no score read it.
 *
 * Pure, no I/O. Rules and the live-data check: docs/superpowers/plans/
 * 2026-11-12-requirement-aware-match-scoring.md, sections 2.2 – 2.4.
 */

import { educationLevel, type EducationLevel } from "@/lib/matching/educationLevel";
import { familiesOf, GENERIC_FAMILIES } from "@/lib/matching/fieldOfStudy";

export type Importance = "must" | "nice";
export type HireType = "experienced" | "skills" | "qualification" | "entry";
export const HIRE_TYPES: readonly HireType[] = ["experienced", "skills", "qualification", "entry"];

export interface EducationRequirement {
  /** 1-5; 0 = the job asks for none. */
  level: EducationLevel;
  importance: Importance;
  source: "form" | "education_box" | "qualification_line" | "none";
  /** The words the job used, for the report. */
  text: string;
  /** Fields of study the job names, lower-cased. */
  fields: string[];
  families: string[];
  /** "… or related field": a related degree counts in full. */
  relatedAllowed: boolean;
  /** The employer ticked "this field is essential": a different field is a miss. */
  fieldEssential: boolean;
}

export interface ExperienceRequirement {
  minYears: number;
  maxYears: number;
  /** "In what" — "MERN stack". Falls back to the job title. */
  subject: string;
  subjectSource: "form" | "qualification_line" | "title";
  importance: Importance;
}

export interface CredentialRequirement {
  /** The job's words: "Valid LMV/Commercial Driving License". */
  name: string;
  importance: Importance;
  driving: boolean;
  /** Words looked for on the profile and CV. */
  terms: string[];
  /** "CEH, CompTIA Security+, or GIAC": any one will do. */
  anyOf: boolean;
  source: "form" | "qualification_line";
}

export interface LanguageRequirement {
  /** Lower-cased language names that count. */
  names: string[];
  importance: Importance;
  source: "form" | "qualification_line" | "none";
  /** Stored on the job but never confirmed by the employer (D14): shown, not scored. */
  unconfirmed: string[];
}

export interface JobRequirements {
  education: EducationRequirement;
  experience: ExperienceRequirement;
  credentials: CredentialRequirement[];
  languages: LanguageRequirement;
  /** Visa / residence lines ("Transferable Iqama"): shown on the report, never scored. */
  visaLines: string[];
  hireType?: HireType;
}

/** The Job document fields this reader uses. */
export interface JobRequirementsDoc {
  title?: string;
  qualifications?: string[];
  hireType?: string;
  requirements?: {
    experienceMin?: number;
    experienceMax?: number;
    experienceIn?: string;
    education?: string;
    educationLevel?: number | null;
    educationField?: string;
    educationFieldEssential?: boolean;
    educationImportance?: string;
    languages?: string[];
    languagesImportance?: string;
    languagesConfirmedAt?: Date | string | null;
    credentials?: Array<{ name?: string; importance?: string }>;
  };
}

const PREFER_CUE = /prefer|desirable|desired|advantage|a plus|nice to have|bonus|optional|would be an asset/i;
const EDUCATION_CUE =
  /degree|bachelor|master|diploma|graduate|graduation|phd|doctorate|b\.?\s?tech|m\.?\s?tech|b\.?\s?sc|m\.?\s?sc|\bmba\b|\bbca\b|\bmca\b|\bbba\b|b\.?\s?com|m\.?\s?com|high school|secondary|post[- ]?graduate|undergraduate|\bsslc\b|\biti\b|12th|10th|plus two/i;
const RELATED_CUE = /related|relevant|equivalent|similar|allied|any (?:discipline|stream|field)/i;
const FIELD_NOISE = /related|relevant|equivalent|similar|allied|field|discipline|stream|recogni[sz]ed|university|institution|accredited|reputed|^any$|^other$/;

const importanceOf = (raw: string | undefined, fallback: Importance): Importance =>
  raw === "must" || raw === "nice" ? raw : fallback;

/** "Bachelor's degree in Graphic Design, Visual Arts, or related field" → graphic design, visual arts. */
function fieldsOf(clause: string): string[] {
  // The last "in"/"of": "Bachelor of Science in Nursing" names Nursing, not Science.
  const match = clause.match(/.*(?<![a-z])(?:in|of)\s+(.+)$/i);
  if (!match) return [];
  const rest = match[1].split(/(?<![a-z])(?:from|with|having)(?![a-z])|\(/i)[0];
  return rest
    .split(/,|(?<![a-z])or(?![a-z])|(?<![a-z])and(?![a-z])|\/|&/i)
    .map((part) =>
      part
        .toLowerCase()
        .replace(/^\s*(?:a|an|any|the|other)\s+/, "")
        .replace(/[^a-z0-9 ]/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((part) => part.length >= 2 && !FIELD_NOISE.test(part));
}

function familiesForFields(fields: string[], clause: string): string[] {
  // No "in …" field: only the degree's own name can carry one ("BCA / MCA"),
  // not what follows it ("Bachelor's degree with strong computer skills").
  const degreeOnly = clause.split(/(?<![a-z])(?:with|having|and|plus)(?![a-z])/i)[0];
  const families = [...familiesOf(fields.length > 0 ? fields.join(" , ") : degreeOnly)].filter(
    (f) => fields.length > 0 || !GENERIC_FAMILIES.has(f),
  );
  // "Degree in education" is teaching; a seeker's "Higher Secondary Education" is not, so job side only.
  if (fields.includes("education") && !families.includes("teaching")) families.push("teaching");
  return families;
}

/** One requirement text → the level it requires. "X or Y" takes the lower; a "preferred" clause is nice-to-have. */
function readEducationText(text: string): Omit<EducationRequirement, "source" | "fieldEssential"> | null {
  const clauses = text
    .split(/[;()]|\.\s/)
    .flatMap((part) => part.split(/,(?=[^,]*(?:prefer|desirable|advantage|a plus))/i))
    .map((c) => c.trim())
    .filter(Boolean);
  let must = 0;
  let nice = 0;
  let mustClause = "";
  let niceClause = "";
  for (const clause of clauses) {
    const levels = clause
      .split(/\s+or\s+|\//i)
      .map((part) => educationLevel(part))
      .filter((n) => n > 0);
    if (levels.length === 0) continue;
    const level = Math.min(...levels);
    if (PREFER_CUE.test(clause)) {
      if (level > nice) [nice, niceClause] = [level, clause];
    } else if (level > must) [must, mustClause] = [level, clause];
  }
  if (must === 0 && nice === 0) return null;
  const clause = must > 0 ? mustClause : niceClause;
  const fields = fieldsOf(clause);
  return {
    level: (must > 0 ? must : nice) as EducationLevel,
    importance: must > 0 ? "must" : "nice",
    text: clause,
    fields,
    families: familiesForFields(fields, clause),
    relatedAllowed: RELATED_CUE.test(clause),
  };
}

const NO_EDUCATION: EducationRequirement = {
  level: 0,
  importance: "nice",
  source: "none",
  text: "",
  fields: [],
  families: [],
  relatedAllowed: false,
  fieldEssential: false,
};

export function readJobEducation(doc: JobRequirementsDoc, qualifications: readonly string[]): EducationRequirement {
  const req = doc.requirements ?? {};
  // The form's level picker, including an explicit "No minimum" (0).
  if (typeof req.educationLevel === "number" && req.educationLevel >= 0 && req.educationLevel <= 5) {
    if (req.educationLevel === 0) return { ...NO_EDUCATION, source: "form" };
    const field = (req.educationField ?? "").trim();
    const fields = field ? fieldsOf(`in ${field}`) : [];
    return {
      level: req.educationLevel as EducationLevel,
      importance: importanceOf(req.educationImportance, "must"),
      source: "form",
      text: req.education?.trim() || field,
      fields,
      families: fields.length > 0 ? familiesForFields(fields, field) : [],
      relatedAllowed: RELATED_CUE.test(field),
      fieldEssential: Boolean(req.educationFieldEssential) && fields.length > 0,
    };
  }
  const fromBox = req.education?.trim() ? readEducationText(req.education) : null;
  if (fromBox) return { ...fromBox, source: "education_box", fieldEssential: false };
  for (const line of qualifications) {
    if (!EDUCATION_CUE.test(line)) continue;
    const read = readEducationText(line);
    if (read) return { ...read, source: "qualification_line", fieldEssential: false };
  }
  return NO_EDUCATION;
}

const YEARS_LINE = /(\d+(?:\.\d+)?)\s*(?:[-–—]\s*\d+|to\s+\d+)?\s*\+?\s*years?/i;

export function readJobExperience(doc: JobRequirementsDoc, qualifications: readonly string[]): ExperienceRequirement {
  const req = doc.requirements ?? {};
  const minYears = req.experienceMin ?? 0;
  const base = {
    minYears,
    maxYears: req.experienceMax ?? 30,
    importance: "must" as Importance,
  };
  const formSubject = req.experienceIn?.trim();
  if (formSubject) return { ...base, subject: formSubject, subjectSource: "form" };
  // "5+ years of experience in MERN stack", "in Shipping, Freight Forwarding, or Logistics".
  for (const line of qualifications) {
    if (!YEARS_LINE.test(line)) continue;
    const subject = line.match(/(?<![a-z])(?:in|with|as)\s+(?:a\s+|an\s+|the\s+)?([^.;(]+)/i)?.[1]?.trim();
    if (subject && subject.length >= 3) return { ...base, subject: subject.replace(/\s+/g, " "), subjectSource: "qualification_line" };
  }
  return { ...base, subject: doc.title?.trim() ?? "", subjectSource: "title" };
}

export const LANGUAGES = [
  "english", "arabic", "hindi", "urdu", "malayalam", "tamil", "telugu", "kannada", "bengali", "marathi", "gujarati",
  "punjabi", "nepali", "sinhala", "tagalog", "filipino", "spanish", "french", "german", "italian", "portuguese",
  "russian", "turkish", "persian", "farsi", "chinese", "mandarin", "cantonese", "japanese", "korean", "swahili", "pashto",
];
const LANGUAGE_CUE = /fluen|proficien|speak|spoken|written|verbal|bilingual|native|language/i;

/** Language names from free text ("Malayalam (native)", "English – fluent"), lower-cased. */
export function languageNames(raw: readonly string[]): string[] {
  const out = new Set<string>();
  for (const item of raw) {
    const lower = item.toLowerCase();
    const known = LANGUAGES.filter((name) => new RegExp(`(?<![a-z])${name}(?![a-z])`).test(lower));
    if (known.length > 0) for (const name of known) out.add(name);
    else if (lower.trim()) out.add(lower.trim());
  }
  return [...out];
}

export function readJobLanguages(doc: JobRequirementsDoc, qualifications: readonly string[]): LanguageRequirement {
  const req = doc.requirements ?? {};
  const stored = languageNames(req.languages ?? []);
  const importance = importanceOf(req.languagesImportance, "nice");
  // Only a language the employer confirmed on the form counts (D14): 12 live
  // jobs carried "English, Malayalam" no form ever set.
  if (stored.length > 0 && req.languagesConfirmedAt) return { names: stored, importance, source: "form", unconfirmed: [] };
  const lines = qualifications.filter((line) => LANGUAGE_CUE.test(line));
  const fromLines = languageNames(lines).filter((name) => LANGUAGES.includes(name));
  const lineImportance: Importance = lines.some((l) => PREFER_CUE.test(l)) ? "nice" : importance;
  return {
    names: fromLines,
    importance: fromLines.length > 0 ? lineImportance : importance,
    source: fromLines.length > 0 ? "qualification_line" : "none",
    unconfirmed: stored.filter((name) => !fromLines.includes(name)),
  };
}

const CREDENTIAL_CUE =
  /licen[cs]e|certified|certification|registration|registered|(?<![a-z])permit(?![a-z])|(?<![a-z])(?:dha|moh|haad|prometric|pmp|ccna|ccnp|cissp|ceh|cisa|cism|acca|cpa|cma|nebosh|iosh|osha|itil|scfhs|bls|acls)(?![a-z])/i;
const VISA_CUE = /iqama|visa|work permit|residen|passport|sponsorship/i;
const CREDENTIAL_GENERIC = new Set(
  (
    "valid license licence licenses licences certified certification certifications certificate registration registered permit " +
    "relevant professional preferred required must have holder holding with and or the a an of in for is are any such as like " +
    "etc plus advantage added will be equivalent similar recognized recognised current active clean should possess candidate " +
    "candidates mandatory experience years knowledge saudi uae gcc india indian kuwait qatar oman bahrain commercial light heavy " +
    "vehicle class category level from body council authority exam exams passed pass test cleared qualified holding"
  ).split(" "),
);
const DRIVING = /driving|driver|(?<![a-z])(?:lmv|hmv|lcv)(?![a-z])/i;

function credentialFrom(line: string, importance: Importance, source: CredentialRequirement["source"]): CredentialRequirement {
  return {
    name: line.trim(),
    importance,
    driving: DRIVING.test(line),
    terms: line
      .toLowerCase()
      .split(/[^a-z0-9+#]+/)
      .filter((word) => word.length >= 3 && !CREDENTIAL_GENERIC.has(word))
      .slice(0, 4),
    anyOf: /(?<![a-z])or(?![a-z])|\//i.test(line),
    source,
  };
}

export function readJobCredentials(
  doc: JobRequirementsDoc,
  qualifications: readonly string[],
): { credentials: CredentialRequirement[]; visaLines: string[] } {
  const visaLines = qualifications.filter((line) => VISA_CUE.test(line));
  const fromForm = (doc.requirements?.credentials ?? [])
    .filter((c) => c.name?.trim())
    .map((c) => credentialFrom(c.name as string, importanceOf(c.importance, "must"), "form"));
  if (fromForm.length > 0) return { credentials: fromForm, visaLines };
  const credentials = qualifications
    .filter((line) => !VISA_CUE.test(line) && CREDENTIAL_CUE.test(line))
    .map((line) => credentialFrom(line, PREFER_CUE.test(line) ? "nice" : "must", "qualification_line"));
  return { credentials, visaLines };
}

/** Everything the job requires beyond skills, read once per job. */
export function readJobRequirements(doc: JobRequirementsDoc): JobRequirements {
  const qualifications = (doc.qualifications ?? []).map(String).filter((line) => line.trim());
  const hireType = HIRE_TYPES.find((t) => t === doc.hireType);
  return {
    education: readJobEducation(doc, qualifications),
    experience: readJobExperience(doc, qualifications),
    ...readJobCredentials(doc, qualifications),
    languages: readJobLanguages(doc, qualifications),
    ...(hireType ? { hireType } : {}),
  };
}
