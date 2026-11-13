/**
 * Prototype of the requirement reader and the points table in
 * docs/superpowers/plans/2026-11-12-requirement-aware-match-scoring.md
 * (sections 2.2 – 2.4). Used only by scripts/match-requirements-dryrun.ts to
 * measure the plan against live data before any app code is written.
 *
 * Pure: no I/O, no database, no AI call. Nothing in src/ imports this.
 */

export type Importance = "must" | "nice";
export type FieldRelation = "none" | "same" | "related" | "not_stated" | "different";

const words = (list: string[]) => new RegExp(`(?<![a-z0-9])(?:${list.join("|")})(?![a-z0-9])`);

const L5 = words(["phd", "doctorate", "doctoral", "dphil"]);
const L4 = words([
  "master'?s?", "m ?tech", "m ?sc", "m ?com", "mba", "mca", "llm", "m ?pharm", "pgdm", "pgdca", "pg", "m ?phil",
  "pharm ?d", "doctor of pharmacy", "post ?graduate", "post ?graduation", "postgraduation", "ماجستير",
]);
const L3 = words([
  "bachelor'?s?", "b ?tech", "b ?sc", "b ?com", "bca", "bba", "bbm", "llb", "mbbs", "bds", "b ?pharm", "b ?arch", "bhm",
  "b ?ed", "undergraduate", "graduate", "graduation", "graduated", "degree", "ug", "بكالوريوس",
]);
const L2 = words(["diploma", "associate", "iti", "vocational", "polytechnic", "gnm", "anm", "دبلوم"]);
const L1 = words([
  "high school", "higher secondary", "secondary", "sslc", "s s l c", "ssc", "hssc", "hsc", "hse", "vhse", "hs",
  "10th", "12th", "tenth", "class (?:x|xii|10|12)", "xii", "plus two", "plustwo", "plus 2", "predegree", "puc",
  "pre university", "intermediate", "matriculation", "matric", "cbse", "icse", "f ?sc", "madhyamik", "schooling",
]);
/** "CA Intermediate", "CMA Intermediate" are professional exams, not school. */
const PROFESSIONAL_INTERMEDIATE = /(?<![a-z])(?:ca|cma|cs|icwa)\s+inter(?:mediate)?/;
const DOTTED4 = /(?<![a-z0-9])m\.\s?(?:a|s|e|ed)\.?(?![a-z0-9])/;
const DOTTED3 = /(?<![a-z0-9])b\.\s?(?:a|s|e|ed)\.?(?![a-z0-9])/;
const BARE4 = /(?<![A-Za-z0-9])(?:MA|MS|ME)(?![A-Za-z0-9])/;
const BARE3 = /(?<![A-Za-z0-9])(?:BA|BE|BS)(?![A-Za-z0-9])/;

/**
 * Education level 1-5 (0 = unreadable), by whole words. `bare` also reads the
 * capital abbreviations BA / MA / BE — safe on a seeker's degree text, not on
 * a job line, where "MS Office" would read as a master's.
 */
export function educationLevel(text: string | undefined | null, bare = false): number {
  if (!text) return 0;
  const lower = text.toLowerCase().replace(/[’`]/g, "'");
  const flat = lower
    .replace(/\./g, "")
    .replace(/[-_]/g, " ")
    .replace(/pre ?degree/g, "predegree")
    .replace(PROFESSIONAL_INTERMEDIATE, " ")
    .replace(/\s+/g, " ");
  if (L5.test(flat)) return 5;
  if (L4.test(flat) || DOTTED4.test(lower) || (bare && BARE4.test(text))) return 4;
  if (L3.test(flat) || DOTTED3.test(lower) || (bare && BARE3.test(text))) return 3;
  if (L2.test(flat)) return 2;
  if (L1.test(flat) || /\+\s?2(?![0-9])/.test(lower)) return 1;
  if (/(?<![a-z])certificate(?![a-z])/.test(flat)) return 2;
  return 0;
}

const PREFER_CUE = /prefer|desirable|desired|advantage|a plus|nice to have|bonus|optional|would be an asset/i;
const EDUCATION_CUE =
  /degree|bachelor|master|diploma|graduate|graduation|phd|doctorate|b\.?\s?tech|m\.?\s?tech|b\.?\s?sc|m\.?\s?sc|\bmba\b|\bbca\b|\bmca\b|\bbba\b|b\.?\s?com|m\.?\s?com|high school|secondary|post[- ]?graduate|undergraduate|\bsslc\b|\biti\b|12th|10th|plus two/i;
const RELATED_CUE = /related|relevant|equivalent|similar|allied|any (?:discipline|stream|field)/i;

interface FamilyRule { name: string; re: RegExp }
const FAMILIES: FamilyRule[] = [
  { name: "computing", re: /computer|computing|software|information technology|(?<![a-z])it(?![a-z])|(?<![a-z])bca(?![a-z])|(?<![a-z])mca(?![a-z])|cyber|information security|data science|(?<![a-z])cse(?![a-z])|informatics|artificial intelligence/ },
  { name: "business", re: /commerce|business|management|(?<![a-z])bba(?![a-z])|(?<![a-z])mba(?![a-z])|finance|accounting|accountancy|(?<![a-z])b ?com(?![a-z])|(?<![a-z])m ?com(?![a-z])|economics|marketing|human resource|(?<![a-z])hr(?![a-z])|logistics|supply chain|banking/ },
  { name: "civil", re: /civil|construction|structural|architecture|(?<![a-z])b ?arch(?![a-z])/ },
  { name: "mechanical", re: /mechanical|automobile|automotive|mechatronics/ },
  { name: "electrical", re: /electrical|electronics|(?<![a-z])ece(?![a-z])|(?<![a-z])eee(?![a-z])|instrumentation|telecommunication/ },
  { name: "health", re: /nursing|(?<![a-z])gnm(?![a-z])|(?<![a-z])anm(?![a-z])|pharmacy|pharm|medical|medicine|physiotherapy|lab technolog|(?<![a-z])mbbs(?![a-z])|(?<![a-z])bds(?![a-z])|dental|paramedical|radiology/ },
  { name: "media", re: /mass communication|journalism|media|film|broadcast|public relations|visual communication/ },
  { name: "design", re: /design|fine arts|visual arts|animation|multimedia|graphic|fashion/ },
  { name: "teaching", re: /(?<![a-z])b ?ed(?![a-z])|(?<![a-z])m ?ed(?![a-z])|(?:bachelor|master|diploma|degree) (?:of|in) education|teaching|teacher|(?<![a-z])ttc(?![a-z])/ },
  { name: "hospitality", re: /hotel|hospitality|tourism|culinary|catering/ },
  { name: "law", re: /(?<![a-z])law(?![a-z])|(?<![a-z])llb(?![a-z])|(?<![a-z])llm(?![a-z])|legal/ },
  { name: "science", re: /physics|chemistry|mathematics|maths|biology|biotechnology|zoology|botany|microbiology|statistics|(?<![a-z])science(?![a-z])|(?<![a-z])b ?sc(?![a-z])|(?<![a-z])m ?sc(?![a-z])/ },
  { name: "arts", re: /(?<![a-z])arts(?![a-z])|english|literature|history|sociology|psychology|political/ },
  { name: "engineering", re: /engineering|(?<![a-z])b ?tech(?![a-z])|(?<![a-z])m ?tech(?![a-z])/ },
];
/** Families that say "what kind of degree", not "what subject". */
const GENERIC_FAMILIES = new Set(["engineering", "science", "arts"]);

export function familiesOf(text: string): Set<string> {
  const flat = text
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/computer science|data science|political science|library science|social science/g, (m) => m.replace(" science", ""))
    .replace(/fine arts|visual arts/g, (m) => m.replace(" arts", " art"));
  const out = new Set<string>();
  for (const { name, re } of FAMILIES) if (re.test(flat)) out.add(name);
  return out;
}

export interface JobEducation {
  level: number;
  importance: Importance;
  /** Where it was read: the Education box or a Qualifications line. */
  source: "education_field" | "qualification_line" | "none";
  text: string;
  /** Fields of study the job names, lower-cased. */
  fields: string[];
  families: string[];
  relatedAllowed: boolean;
}

const NO_EDUCATION: JobEducation = { level: 0, importance: "nice", source: "none", text: "", fields: [], families: [], relatedAllowed: false };

const FIELD_NOISE = /related|relevant|equivalent|similar|allied|field|discipline|stream|recogni[sz]ed|university|institution|accredited|reputed|^any$|^other$/;

function fieldsOf(clause: string): string[] {
  // The last "in"/"of": "Bachelor of Science in Nursing" names Nursing, not Science.
  const match = clause.match(/.*(?<![a-z])(?:in|of)\s+(.+)$/i);
  if (!match) return [];
  const rest = match[1].split(/(?<![a-z])(?:from|with|having)(?![a-z])|\(/i)[0];
  return rest
    .split(/,|(?<![a-z])or(?![a-z])|(?<![a-z])and(?![a-z])|\/|&/i)
    .map((part) => part.toLowerCase().replace(/^\s*(?:a|an|any|the|other)\s+/, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim())
    .filter((part) => part.length >= 2 && !FIELD_NOISE.test(part));
}

/** One requirement text → the level it requires. "X or Y" takes the lower; a "preferred" clause is nice-to-have. */
function readEducationText(text: string): Omit<JobEducation, "source"> | null {
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
    const levels = clause.split(/\s+or\s+|\//i).map((part) => educationLevel(part)).filter((n) => n > 0);
    if (levels.length === 0) continue;
    const level = Math.min(...levels);
    if (PREFER_CUE.test(clause)) {
      if (level > nice) [nice, niceClause] = [level, clause];
    } else if (level > must) [must, mustClause] = [level, clause];
  }
  if (must === 0 && nice === 0) return null;
  const clause = must > 0 ? mustClause : niceClause;
  const fields = fieldsOf(clause);
  // No "in …" field: only the degree's own name can carry one ("BCA / MCA"),
  // not what follows it ("Bachelor's degree with strong computer skills").
  const degreeOnly = clause.split(/(?<![a-z])(?:with|having|and|plus)(?![a-z])/i)[0];
  const families = [...familiesOf(fields.length > 0 ? fields.join(" , ") : degreeOnly)].filter((f) => fields.length > 0 || !GENERIC_FAMILIES.has(f));
  // "Degree in education" is teaching; on a seeker's side "Higher Secondary Education" is not, so this is job-side only.
  if (fields.includes("education") && !families.includes("teaching")) families.push("teaching");
  return {
    level: must > 0 ? must : nice,
    importance: must > 0 ? "must" : "nice",
    text: clause,
    fields,
    families,
    relatedAllowed: RELATED_CUE.test(clause),
  };
}

export function readJobEducation(educationField: string | undefined, qualifications: readonly string[]): JobEducation {
  const fromField = educationField?.trim() ? readEducationText(educationField) : null;
  if (fromField) return { ...fromField, source: "education_field" };
  for (const line of qualifications) {
    if (!EDUCATION_CUE.test(line)) continue;
    const read = readEducationText(line);
    if (read) return { ...read, source: "qualification_line" };
  }
  return NO_EDUCATION;
}

export const LANGUAGES = [
  "english", "arabic", "hindi", "urdu", "malayalam", "tamil", "telugu", "kannada", "bengali", "marathi", "gujarati",
  "punjabi", "nepali", "sinhala", "tagalog", "filipino", "spanish", "french", "german", "italian", "portuguese",
  "russian", "turkish", "persian", "farsi", "chinese", "mandarin", "cantonese", "japanese", "korean", "swahili", "pashto",
];
const LANGUAGE_CUE = /fluen|proficien|speak|spoken|written|verbal|bilingual|native|language/i;

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

export function readJobLanguages(stated: readonly string[] | undefined, qualifications: readonly string[]): { names: string[]; source: string } {
  const fromField = languageNames(stated ?? []);
  if (fromField.length > 0) return { names: fromField, source: "languages_field" };
  const fromLines = languageNames(qualifications.filter((line) => LANGUAGE_CUE.test(line))).filter((name) => LANGUAGES.includes(name));
  return { names: fromLines, source: fromLines.length > 0 ? "qualification_line" : "none" };
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

export interface JobCredential {
  line: string;
  importance: Importance;
  driving: boolean;
  terms: string[];
  /** "CEH, CompTIA Security+, or GIAC": any one of them will do. */
  anyOf: boolean;
}

export function readJobCredentials(qualifications: readonly string[]): { credentials: JobCredential[]; visaLines: string[] } {
  const credentials: JobCredential[] = [];
  const visaLines: string[] = [];
  for (const line of qualifications) {
    if (VISA_CUE.test(line)) {
      visaLines.push(line);
      continue;
    }
    if (!CREDENTIAL_CUE.test(line)) continue;
    const terms = line
      .toLowerCase()
      .split(/[^a-z0-9+#]+/)
      .filter((word) => word.length >= 3 && !CREDENTIAL_GENERIC.has(word))
      .slice(0, 4);
    credentials.push({
      line,
      importance: PREFER_CUE.test(line) ? "nice" : "must",
      driving: DRIVING.test(line),
      terms,
      anyOf: /(?<![a-z])or(?![a-z])|\//i.test(line),
    });
  }
  return { credentials, visaLines };
}

export interface EducationEntry {
  level: number;
  /** Degree, field and course, lower-cased. */
  text: string;
  families: Set<string>;
  /** A subject is named: a field or course filled in, or a degree name that carries one ("B.Com"). */
  fieldStated: boolean;
}

export interface SeekerEvidence {
  /** Highest level held. */
  level: number;
  /** Every education entry the seeker lists. A field is matched against any entry at or above the job's level. */
  entries: EducationEntry[];
  /** Text of all entries, for the evidence samples. */
  fieldText: string;
  fieldStated: boolean;
  languages: string[];
  /** Typed certifications and skills, lower-cased. */
  listed: string;
  /** CV text, lower-cased. */
  cv: string;
}

interface SeekerDocLike {
  skills?: string[];
  certifications?: string[];
  languages?: Array<{ language?: string }>;
  education?: Array<{ degree?: string; field?: string; course?: string }>;
  cv?: { rawText?: string };
}

/**
 * One education entry's level. A degree written as two levels ("Graduation/Diploma",
 * the onboarding choice) is read as the lower one, unless the course or field
 * says more ("B.Tech/B.E.").
 */
export function seekerEntryLevel(e: { degree?: string; field?: string; course?: string }): number {
  const alternatives = (e.degree ?? "").split("/").map((part) => educationLevel(part, true)).filter((n) => n > 0);
  const degree = alternatives.length > 1 ? Math.min(...alternatives) : educationLevel(e.degree, true);
  return Math.max(degree, educationLevel(e.field, true), educationLevel(e.course, true));
}

export function seekerEvidence(doc: SeekerDocLike): SeekerEvidence {
  const entries: EducationEntry[] = (doc.education ?? []).map((e) => {
    const text = [e.degree, e.field, e.course].filter(Boolean).join(" ").toLowerCase();
    const families = familiesOf(text);
    const specific = [...families].some((f) => !GENERIC_FAMILIES.has(f));
    return { text, level: seekerEntryLevel(e), families, fieldStated: specific || Boolean(e.field?.trim() || e.course?.trim()) };
  });
  return {
    level: entries.reduce((max, e) => Math.max(max, e.level), 0),
    entries,
    fieldText: entries.map((e) => e.text).join(" | "),
    fieldStated: entries.some((e) => e.fieldStated),
    languages: languageNames((doc.languages ?? []).map((l) => l.language ?? "")),
    listed: [...(doc.certifications ?? []), ...(doc.skills ?? [])].join(" | ").toLowerCase(),
    cv: (doc.cv?.rawText ?? "").toLowerCase(),
  };
}

const RELATION_RANK: Record<FieldRelation, number> = { none: 4, same: 4, related: 3, not_stated: 2, different: 1 };

function entryRelation(job: JobEducation, entry: EducationEntry): FieldRelation {
  const same = job.fields.some((field) => {
    const significant = field.split(" ").filter((w) => w.length >= 4);
    return significant.length > 0 && significant.every((w) => entry.text.includes(w));
  });
  if (same) return "same";
  if (job.families.some((family) => entry.families.has(family))) return "related";
  const specific = [...entry.families].some((f) => !GENERIC_FAMILIES.has(f));
  if (!entry.fieldStated || !specific) return "not_stated";
  return "different";
}

/**
 * The best field match among the degrees that meet the job's level. A B.Tech
 * in Computer Science still counts for a "Bachelor's in Computer Science" job
 * when the seeker's highest degree is an MBA.
 */
export function fieldRelation(job: JobEducation, seeker: SeekerEvidence): FieldRelation {
  if (job.fields.length === 0 && job.families.length === 0) return "none";
  const qualifying = seeker.entries.filter((e) => e.level >= job.level);
  let best: FieldRelation = "not_stated";
  let bestRank = 0;
  for (const entry of qualifying) {
    const relation = entryRelation(job, entry);
    if (RELATION_RANK[relation] > bestRank) [best, bestRank] = [relation, RELATION_RANK[relation]];
  }
  return best;
}

const FIELD_MARK: Record<FieldRelation, number> = { none: 100, same: 100, related: 85, not_stated: 85, different: 70 };

/** 0-100 education part, or null when the job states no qualification. */
export function educationPart(job: JobEducation, seeker: SeekerEvidence): { mark: number; relation: FieldRelation } | null {
  if (job.level <= 0) return null;
  if (seeker.level <= 0) return { mark: 25, relation: "none" };
  const gap = job.level - seeker.level;
  if (gap >= 2) return { mark: 0, relation: "none" };
  if (gap === 1) return { mark: 50, relation: "none" };
  const relation = fieldRelation(job, seeker);
  return { mark: relation === "related" && job.relatedAllowed ? 100 : FIELD_MARK[relation], relation };
}

export function languagesPart(asked: readonly string[], seeker: SeekerEvidence): number | null {
  if (asked.length === 0) return null;
  if (seeker.languages.length === 0) return 25;
  return Math.round((asked.filter((name) => seeker.languages.includes(name)).length / asked.length) * 100);
}

export type CredentialEvidence = "listed" | "cv" | "none" | "unknown";

const hasWord = (text: string, word: string) => new RegExp(`(?<![a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`).test(text);

function credentialEvidence(credential: JobCredential, seeker: SeekerEvidence): CredentialEvidence {
  const found = (text: string): boolean => {
    if (credential.driving) return /driving|licen[cs]e|(?<![a-z])(?:lmv|hmv|lcv)(?![a-z])/.test(text);
    if (credential.terms.length === 0) return /licen[cs]e|certif/.test(text);
    const hits = credential.terms.filter((term) => hasWord(text, term)).length;
    return credential.anyOf ? hits > 0 : hits * 2 >= credential.terms.length;
  };
  if (found(seeker.listed)) return "listed";
  if (seeker.cv && found(seeker.cv)) return "cv";
  return seeker.listed || seeker.cv ? "none" : "unknown";
}

const CREDENTIAL_MARK: Record<CredentialEvidence, number> = { listed: 100, cv: 70, none: 0, unknown: 25 };
/** Variant: nothing found reads as "needs verification", like an empty profile, not as a failure. */
export const CREDENTIAL_MARK_LENIENT: Record<CredentialEvidence, number> = { listed: 100, cv: 70, none: 25, unknown: 25 };

export function credentialsPart(
  credentials: readonly JobCredential[],
  seeker: SeekerEvidence,
  marks: Record<CredentialEvidence, number> = CREDENTIAL_MARK,
): { mark: number; evidence: CredentialEvidence[] } | null {
  if (credentials.length === 0) return null;
  const evidence = credentials.map((credential) => credentialEvidence(credential, seeker));
  return { mark: Math.round(evidence.reduce((sum, e) => sum + marks[e], 0) / evidence.length), evidence };
}

export interface PointsTable { skills: number; role: number; experience: number; education: number; credentials: number; languages: number }

export const TABLES: Record<"today" | "recommended" | "cautious", PointsTable> = {
  today: { skills: 60, role: 25, experience: 15, education: 0, credentials: 0, languages: 0 },
  recommended: { skills: 40, role: 25, experience: 15, education: 20, credentials: 20, languages: 10 },
  cautious: { skills: 60, role: 25, experience: 15, education: 10, credentials: 10, languages: 5 },
};

export interface Parts { skills: number | null; role: number; experience: number; education: number | null; credentials: number | null; languages: number | null }

/** Points earned over points available: a part the job does not ask for (null) is left out. */
export function weightedScore(parts: Parts, table: PointsTable): number {
  let earned = 0;
  let available = 0;
  for (const key of Object.keys(table) as Array<keyof PointsTable>) {
    const value = parts[key];
    if (value === null || table[key] <= 0) continue;
    earned += table[key] * value;
    available += table[key];
  }
  return available > 0 ? Math.round(earned / available) : 0;
}
