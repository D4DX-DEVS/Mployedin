/**
 * The employer's free-text qualification lines ("Bachelor's degree in …",
 * "3–5 years of …", "Fluency in Malayalam and English", "Working knowledge of
 * GST returns") checked one by one against what a candidate's profile says.
 *
 * The match score cannot say "does this person have what I wrote"; the
 * structured checks in qualifications.ts cover only the fields the employer
 * filled in as data. A job whose requirements sit in prose got no checklist at
 * all. This reads the prose.
 *
 * It is evidence matching, not judgement, and says so: education level, years
 * and languages are compared as numbers and names; everything else is looked
 * for in the candidate's skills, roles, education, projects and CV text.
 * Personal qualities ("problem-solving", "willingness to learn") and profiles
 * with too little text are reported as "unknown", never as a miss — inventing
 * a failure is worse than admitting a line cannot be checked. Pure, no I/O.
 */
import { educationRank, seekerProfileFromDoc } from "@/lib/matchScore";

export type LineVerdict = "has" | "partial" | "missing" | "unknown";
export type LineKind = "education" | "experience" | "language" | "terms" | "personal" | "thin";

export interface QualificationLineCheck {
  line: string;
  verdict: LineVerdict;
  kind: LineKind;
  /** Words, languages or skills the profile evidences. */
  found: string[];
  /** Words, languages or skills nothing on the profile mentions. */
  missing: string[];
  /** Up to two short quotes from the profile where the evidence was found. */
  quotes?: string[];
  /** education: level 1-5; experience: years. */
  required?: number;
  actual?: number;
}

/** What the profile offers as evidence, built once per candidate. */
export interface LineEvidence {
  educationLevel: number;
  years: number;
  yearsKnown: boolean;
  languages: string[];
  /** Lower-cased profile text: skills, roles, education, projects, CV. */
  text: string;
}

/** The JobSeeker fields evidence is read from (a lean document). */
export interface EvidenceDoc {
  headline?: string;
  summary?: string;
  skills?: string[];
  certifications?: string[];
  languages?: Array<{ language?: string }>;
  experience?: Array<{ jobTitle?: string; company?: string; description?: string; startDate?: Date | string; endDate?: Date | string; isCurrent?: boolean }>;
  education?: Array<{ degree?: string; field?: string; course?: string; institution?: string }>;
  projects?: Array<{ title?: string; description?: string; techStack?: string[] }>;
  cv?: { rawText?: string };
  totalExperienceYears?: number;
  workStatus?: "experienced" | "fresher" | null;
}

/** Below this much profile text a missing word proves nothing. */
const THIN_TEXT_CHARS = 150;
const MAX_LINES = 20;

export function evidenceFromSeeker(doc: EvidenceDoc): LineEvidence {
  const profile = seekerProfileFromDoc(doc as Parameters<typeof seekerProfileFromDoc>[0]);
  const parts: string[] = [
    doc.headline ?? "",
    doc.summary ?? "",
    ...(doc.skills ?? []),
    ...(doc.certifications ?? []),
    ...(doc.experience ?? []).flatMap((e) => [e.jobTitle ?? "", e.company ?? "", e.description ?? ""]),
    ...(doc.education ?? []).flatMap((e) => [e.degree ?? "", e.field ?? "", e.course ?? "", e.institution ?? ""]),
    ...(doc.projects ?? []).flatMap((p) => [p.title ?? "", p.description ?? "", ...(p.techStack ?? [])]),
    doc.cv?.rawText ?? "",
  ];
  return {
    educationLevel: profile.educationLevel ?? 0,
    years: profile.experienceYears,
    yearsKnown: profile.experienceKnown !== false,
    languages: (doc.languages ?? []).map((l) => (l.language ?? "").trim().toLowerCase()).filter(Boolean),
    text: parts.join(" \n ").toLowerCase(),
  };
}

const LANGUAGES = [
  "english", "arabic", "hindi", "urdu", "malayalam", "tamil", "telugu", "kannada", "bengali", "marathi", "gujarati",
  "punjabi", "nepali", "sinhala", "tagalog", "filipino", "spanish", "french", "german", "italian", "portuguese",
  "russian", "turkish", "persian", "farsi", "chinese", "mandarin", "cantonese", "japanese", "korean", "swahili", "pashto",
];
const LANGUAGE_CUE = /fluen|proficien|speak|spoken|written|verbal|bilingual|native|language/i;

/** Personal qualities a profile cannot evidence. */
const SOFT_PHRASES = new RegExp(
  [
    "problem[- ]?solving", "communication", "interpersonal", "team ?player", "teamwork", "collaborat\\w*",
    "willing(?:ness)? to learn", "(?:fast|quick) learner", "attention to detail", "detail[- ]oriented",
    "self[- ]?motivated", "motivated", "proactive", "adaptab\\w*", "flexib\\w*", "leadership", "organi[sz]ational",
    "time management", "work ethic", "analytical", "critical thinking", "positive attitude", "multitask\\w*",
    "customer[- ]focused", "results[- ]driven", "passion\\w*", "initiative", "reliab\\w*",
  ].join("|"),
  "gi",
);

/** Words that say how much, not what. */
const GENERIC = new Set(
  (
    "a an the and or of in on at to for with from by as is are be able ability abilities strong excellent good great basic advanced " +
    "working knowledge understanding familiarity familiar proficiency proficient skill skills experience experienced hands solid deep " +
    "related relevant similar field fields preferred plus including include such like etc years year minimum least demonstrated proven " +
    "tool tools principles concepts fundamentals comfortable comfort capable willingness required requirement requirements " +
    "qualified qualification qualifications degree ability manage managing maintain maintaining high volume level levels"
  ).split(" "),
);

/** Terms a job writes in general words that a profile writes as specific tools. */
const RELATED: Record<string, string[]> = {
  containerization: ["docker", "kubernetes", "k8s", "container", "podman", "openshift"],
  containerisation: ["docker", "kubernetes", "k8s", "container", "podman", "openshift"],
  orchestration: ["kubernetes", "k8s", "swarm", "openshift", "airflow"],
  cloud: ["aws", "azure", "gcp", "google cloud", "digitalocean"],
  "ci/cd": ["jenkins", "gitlab", "github actions", "circleci", "pipeline"],
  databases: ["sql", "mysql", "postgres", "postgresql", "mongodb", "oracle"],
  database: ["sql", "mysql", "postgres", "postgresql", "mongodb", "oracle"],
  accounting: ["tally", "quickbooks", "sap", "ledger", "bookkeeping", "accounts"],
  spreadsheet: ["excel", "sheets"],
  spreadsheets: ["excel", "sheets"],
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Where a term is mentioned (whole word, tolerating plurals and long-word endings), or -1. */
function mentionAt(text: string, term: string): number {
  const re =
    term.length >= 7
      ? new RegExp(`(?<![a-z0-9])${escapeRe(term.slice(0, term.length - 3))}`)
      : new RegExp(`(?<![a-z0-9])${escapeRe(term)}s?(?![a-z0-9])`);
  return text.search(re);
}

/** A short single-line quote around a position, so the reader can judge the evidence. */
function quoteAround(text: string, at: number): string {
  // Cut on word boundaries, never mid-word.
  let start = Math.max(0, at - 35);
  if (start > 0) {
    const space = text.indexOf(" ", start);
    start = space >= 0 && space < at ? space + 1 : start;
  }
  let end = Math.min(text.length, at + 55);
  if (end < text.length) {
    const space = text.lastIndexOf(" ", end);
    end = space > at ? space : end;
  }
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${end < text.length ? "…" : ""}`;
}

function significantTerms(line: string): string[] {
  const stripped = line.replace(SOFT_PHRASES, " ");
  const out: string[] = [];
  for (const raw of stripped.split(/[^A-Za-z0-9+#./-]+/)) {
    const word = raw.replace(/^[./-]+|[./-]+$/g, "");
    if (!word) continue;
    const lower = word.toLowerCase();
    // Two-letter terms only as written in capitals: "CA", "HR", "QA".
    const keep = lower.length >= 3 ? !GENERIC.has(lower) : /^[A-Z]{2}$/.test(word);
    if (keep && !out.includes(lower)) out.push(lower);
  }
  return out.slice(0, 6);
}

const num = (n: number) => Math.round(n * 10) / 10;

function languageCheck(line: string, evidence: LineEvidence): QualificationLineCheck | null {
  if (!LANGUAGE_CUE.test(line)) return null;
  const lower = line.toLowerCase();
  const asked = LANGUAGES.filter((name) => new RegExp(`\\b${name}\\b`).test(lower));
  if (asked.length === 0) return null;
  if (evidence.languages.length === 0 && evidence.text.length < THIN_TEXT_CHARS) {
    return { line, verdict: "unknown", kind: "thin", found: [], missing: [] };
  }
  const found = asked.filter((name) => evidence.languages.includes(name));
  const missing = asked.filter((name) => !found.includes(name));
  const verdict: LineVerdict = missing.length === 0 ? "has" : found.length === 0 ? "missing" : "partial";
  return { line, verdict, kind: "language", found, missing };
}

function yearsCheck(line: string, evidence: LineEvidence): QualificationLineCheck | null {
  const match = line.match(/(\d+(?:\.\d+)?)\s*(?:[-–—]\s*\d+|to\s+\d+)?\s*\+?\s*years?/i);
  if (!match) return null;
  const required = Number(match[1]);
  if (!(required > 0)) return null;
  if (!evidence.yearsKnown) return { line, verdict: "unknown", kind: "experience", found: [], missing: [], required };
  const years = evidence.years;
  const verdict: LineVerdict = years >= required ? "has" : years >= required - 1 ? "partial" : "missing";
  return { line, verdict, kind: "experience", found: [], missing: [], required, actual: num(years) };
}

/** educationRank is a substring match ("iti" is in "utilities"); a line must also read as a qualification. */
const EDUCATION_CUE = /degree|bachelor|master|diploma|graduate|phd|doctorate|b\.?\s?tech|m\.?\s?tech|b\.?\s?sc|m\.?\s?sc|\bmba\b|\bbca\b|\bmca\b|\bbba\b|b\.?\s?com|m\.?\s?com|certificate|high school|secondary|post[- ]?graduate|undergraduate/i;

function educationCheck(line: string, evidence: LineEvidence): QualificationLineCheck | null {
  if (!EDUCATION_CUE.test(line)) return null;
  const required = educationRank(line);
  if (required <= 0) return null;
  const held = evidence.educationLevel;
  if (held <= 0) return { line, verdict: "unknown", kind: "education", found: [], missing: [], required };
  const verdict: LineVerdict = held >= required ? "has" : required - held === 1 ? "partial" : "missing";
  return { line, verdict, kind: "education", found: [], missing: [], required, actual: held };
}

function termsCheck(line: string, evidence: LineEvidence): QualificationLineCheck {
  const terms = significantTerms(line);
  // Nothing left once the personal qualities are taken out.
  if (terms.length === 0) return { line, verdict: "unknown", kind: "personal", found: [], missing: [] };

  const found: string[] = [];
  const missing: string[] = [];
  const quotes: string[] = [];
  for (const term of terms) {
    let at = mentionAt(evidence.text, term);
    for (const alt of RELATED[term] ?? []) {
      if (at >= 0) break;
      at = mentionAt(evidence.text, alt);
    }
    if (at >= 0) {
      found.push(term);
      if (quotes.length < 2) quotes.push(quoteAround(evidence.text, at));
    } else missing.push(term);
  }
  if (found.length === 0 && evidence.text.length < THIN_TEXT_CHARS) {
    return { line, verdict: "unknown", kind: "thin", found, missing };
  }
  const verdict: LineVerdict = missing.length === 0 ? "has" : found.length === 0 ? "missing" : found.length >= missing.length ? "partial" : "missing";
  return { line, verdict, kind: "terms", found, missing, ...(quotes.length > 0 ? { quotes } : {}) };
}

/** One qualification line against one candidate's evidence. */
export function checkQualificationLine(line: string, evidence: LineEvidence): QualificationLineCheck {
  return languageCheck(line, evidence) ?? yearsCheck(line, evidence) ?? educationCheck(line, evidence) ?? termsCheck(line, evidence);
}

/** Every line the job lists (up to MAX_LINES), in the employer's order. */
export function checkQualificationLines(lines: readonly string[] | undefined, evidence: LineEvidence): QualificationLineCheck[] {
  return (lines ?? [])
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_LINES)
    .map((line) => checkQualificationLine(line, evidence));
}
