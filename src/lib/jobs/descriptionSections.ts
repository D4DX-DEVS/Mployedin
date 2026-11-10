/**
 * Moves labelled lists ("Key Responsibilities:", "Qualifications:", "Skills:",
 * "Benefits:") out of a job description into their own fields.
 *
 * The AI models that read posters and edit jobs keep folding those lists into
 * the description (2026-11-09: a poster's qualifications landed in the
 * Description box, and the job form's assistant did the same with a pasted
 * list). The prompts ask for separate fields too, but the cheap text model does
 * not follow that reliably, so this runs on every answer.
 *
 * Deliberately conservative — a missed list is a cosmetic problem, a wrong
 * split deletes or reorders prose:
 * - "Label: …" starts a list only when the label is a known heading.
 * - A heading without a colon must start its own paragraph and be followed by
 *   a bullet; "Experience" / "Education" never count without a colon, they are
 *   ordinary words in prose.
 * - A heading that collects no items stays in the description.
 * - Callers move nothing unless every item fits its field (see placeItems).
 */

export type DescriptionSectionKey = "responsibilities" | "qualifications" | "skills" | "benefits";

export interface DescriptionSections {
  /** The description with the labelled lists taken out (the original text when none was found). */
  overview: string;
  responsibilities: string[];
  qualifications: string[];
  skills: string[];
  benefits: string[];
  /** True when at least one labelled list item was found. */
  found: boolean;
}

/** Per-field limits the job form and POST /api/jobs enforce: [items, characters per item]. */
export const SECTION_LIMITS: Record<DescriptionSectionKey, readonly [number, number]> = {
  responsibilities: [20, 500],
  qualifications: [20, 500],
  benefits: [20, 500],
  skills: [50, 100],
};

const HEADING_LABELS: Record<DescriptionSectionKey, readonly string[]> = {
  responsibilities: [
    "responsibilities", "key responsibilities", "main responsibilities", "job responsibilities",
    "your responsibilities", "roles and responsibilities", "duties", "key duties", "job duties",
    "duties and responsibilities", "what you will do", "what you'll do",
    "المسؤوليات", "المهام", "المهام والمسؤوليات", "مسؤوليات الوظيفة",
  ],
  qualifications: [
    "qualifications", "qualification", "required qualifications", "preferred qualifications",
    "requirements", "job requirements", "key requirements", "minimum requirements",
    "requirements and qualifications", "qualifications and requirements", "qualifications and experience",
    "eligibility", "eligibility criteria", "who we are looking for", "what we are looking for",
    "what we're looking for", "who you are", "education", "education and experience", "experience",
    "المؤهلات", "المؤهلات المطلوبة", "المتطلبات", "الشروط",
  ],
  skills: [
    "skills", "required skills", "key skills", "skills required", "technical skills",
    "skills and competencies", "المهارات", "المهارات المطلوبة",
  ],
  benefits: [
    "benefits", "perks", "perks and benefits", "benefits and perks", "what we offer", "we offer",
    "compensation and benefits", "salary and benefits", "المزايا", "مزايا", "ما نقدمه",
  ],
};

function normalizeLabel(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/&/g, " and ")
    .replace(/[*_#>]/g, "")
    .replace(/[:：]\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

const LABEL_TO_KEY = new Map<string, DescriptionSectionKey>(
  (Object.entries(HEADING_LABELS) as [DescriptionSectionKey, readonly string[]][]).flatMap(([key, labels]) =>
    labels.map((label) => [normalizeLabel(label), key] as const),
  ),
);

/** Ordinary words in prose; a heading only with a colon. */
const COLONLESS_EXCLUDED = new Set(["experience", "education"]);
/** "Experience: 3-5 years" keeps its label as the qualification ("3-5 years" alone says nothing). */
const KEEP_LABEL = new Set(["experience", "education", "education and experience", "qualifications and experience"]);

const BULLET = /^(?:[-*•–·▪●◦]|[0-9٠-٩]{1,2}[.)])\s+(.*)$/;
/** "Location: Dubai" — some other label, which ends a list written without bullets. */
const OTHER_LABEL = /^[^:：]{2,40}[:：]\s*\S/;
/** Shorter than this, what is left is not a description worth keeping on its own. */
const MIN_OVERVIEW = 20;

interface Heading {
  key: DescriptionSectionKey;
  /** Text after "Label:" on the same line. */
  rest: string;
  /** The label as written, for KEEP_LABEL headings. */
  label: string;
  keepLabel: boolean;
}

const nextNonBlank = (lines: string[], i: number): string | undefined => {
  for (let j = i + 1; j < lines.length; j++) if (lines[j].trim()) return lines[j].trim();
  return undefined;
};

function headingAt(lines: string[], i: number): Heading | null {
  const line = lines[i].trim();
  if (!line || BULLET.test(line)) return null;
  const colon = line.search(/[:：]/);
  if (colon > 0) {
    const label = line.slice(0, colon).replace(/[*_#>]/g, "").trim();
    const norm = normalizeLabel(label);
    const key = LABEL_TO_KEY.get(norm);
    if (key) return { key, label, keepLabel: KEEP_LABEL.has(norm), rest: line.slice(colon + 1).replace(/^[\s*_]+/, "").trim() };
  }
  if (line.length > 60) return null;
  const norm = normalizeLabel(line);
  const key = LABEL_TO_KEY.get(norm);
  if (!key || COLONLESS_EXCLUDED.has(norm)) return null;
  // Without a colon it must open its own paragraph and introduce a bulleted list.
  const startsParagraph = i === 0 || !lines[i - 1].trim();
  const next = nextNonBlank(lines, i);
  if (!startsParagraph || next === undefined || !BULLET.test(next)) return null;
  return { key, label: line, keepLabel: false, rest: "" };
}

/** Splits on commas/semicolons outside brackets: "Office (Word, Excel), SAP" → 2 items. */
function splitOutsideBrackets(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if (ch === "(" || ch === "[") depth++;
    if ((ch === ")" || ch === "]") && depth > 0) depth--;
    if (depth === 0 && (ch === "," || ch === ";" || ch === "،" || ch === "؛")) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

function cleanItem(text: string): string {
  return text.replace(/^\*\*|\*\*$/g, "").replace(/[;؛]\s*$/, "").trim();
}

export function splitDescriptionSections(text: string): DescriptionSections {
  const sections: Record<DescriptionSectionKey, string[]> = { responsibilities: [], qualifications: [], skills: [], benefits: [] };
  const kept: string[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let current: Heading | null = null;
  let pendingHeadingLine: string | null = null;
  let currentUsesBullets = false;

  const add = (heading: Heading, raw: string, inline: boolean) => {
    // Only an inline "Skills: Excel, SAP" lists several skills; a bullet is one item.
    const parts = heading.key === "skills" && inline ? splitOutsideBrackets(raw) : [raw];
    for (const part of parts) {
      const item = cleanItem(part);
      if (!item) continue;
      // A "skill" too long for the skills field is a qualification sentence.
      const key = heading.key === "skills" && item.length > SECTION_LIMITS.skills[1] ? "qualifications" : heading.key;
      sections[key].push(inline && heading.keepLabel ? `${heading.label}: ${item}` : item);
    }
    pendingHeadingLine = null;
  };

  /** A heading that collected nothing stays where it was. */
  const closeSection = () => {
    if (pendingHeadingLine !== null) kept.push(pendingHeadingLine);
    pendingHeadingLine = null;
    current = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const heading = headingAt(lines, i);
    if (heading) {
      closeSection();
      current = heading;
      currentUsesBullets = false;
      pendingHeadingLine = line;
      if (heading.rest) add(heading, heading.rest, true);
      continue;
    }
    if (current) {
      if (!trimmed) {
        // A blank line ends the list unless a bullet carries it on below.
        const next = nextNonBlank(lines, i);
        if (next !== undefined && BULLET.test(next)) continue;
        closeSection();
        kept.push(line);
        continue;
      }
      const bullet = BULLET.exec(trimmed);
      if (bullet) {
        currentUsesBullets = true;
        add(current, bullet[1], false);
        continue;
      }
      if (!currentUsesBullets && !OTHER_LABEL.test(trimmed)) {
        add(current, trimmed, false);
        continue;
      }
      // Prose after a bulleted list, or another "Label: value" line, belongs to the description again.
      closeSection();
    }
    kept.push(line);
  }
  closeSection();

  const found = Object.values(sections).some((items) => items.length > 0);
  return {
    overview: found ? kept.join("\n").replace(/\n{3,}/g, "\n\n").trim() : text,
    ...sections,
    found,
  };
}

const itemKey = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** `existing` plus each new item it does not already hold (ignoring case and spacing), capped at `max`. */
export function mergeUniqueItems(existing: readonly string[], add: readonly string[], max: number): string[] {
  const seen = new Set(existing.map(itemKey));
  const out = [...existing];
  for (const item of add) {
    const key = itemKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.slice(0, max);
}

/**
 * A list for display without repeats: drops items already said by a longer
 * item ("BCA / MCA" next to "BCA / MCA degree (Computer Science)") and exact
 * repeats. Order of what is kept is unchanged.
 */
export function dedupeListItems(items: readonly string[]): string[] {
  const keys = items.map(itemKey);
  return items.filter((_, i) => {
    const k = keys[i];
    if (!k) return false;
    return !keys.some((other, j) => j !== i && (other === k ? j < i : other.length > k.length && other.includes(k)));
  });
}

/**
 * `existing` plus the new items, or null when they don't all fit the field
 * (too many, or one too long) — then the caller leaves the description alone
 * rather than lose part of it.
 */
export function placeItems(existing: readonly string[], add: readonly string[], key: DescriptionSectionKey): string[] | null {
  const [count, length] = SECTION_LIMITS[key];
  if (add.some((item) => item.length > length)) return null;
  const merged = mergeUniqueItems(existing, add, Number.POSITIVE_INFINITY);
  return merged.length <= count ? merged : null;
}

const asStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

/** The loose shape the poster reader and the job creator chat return. */
interface LooseJob {
  description?: unknown;
  responsibilities?: unknown;
  qualifications?: unknown;
  benefits?: unknown;
  requirements?: unknown;
}

/**
 * An AI-drafted job with the lists in its description moved into its own
 * fields. A description that is nothing but lists is kept as it was, so the
 * draft still has one. Returns the same object when there is nothing to move,
 * or when the items would not all fit their fields.
 */
export function splitJobDescription<T extends LooseJob>(job: T): T {
  if (typeof job.description !== "string") return job;
  const sections = splitDescriptionSections(job.description);
  if (!sections.found) return job;

  const req = job.requirements;
  const reqObject = req && typeof req === "object" && !Array.isArray(req) ? (req as Record<string, unknown>) : {};
  const currentSkills = Array.isArray(req) ? asStrings(req) : asStrings(reqObject.skills);

  const placed: Partial<Record<DescriptionSectionKey, string[]>> = {};
  for (const key of ["responsibilities", "qualifications", "benefits", "skills"] as const) {
    if (!sections[key].length) continue;
    const existing = key === "skills" ? currentSkills : asStrings(job[key]);
    const list = placeItems(existing, sections[key], key);
    if (!list) return job;
    placed[key] = list;
  }

  const out = { ...job } as unknown as Record<string, unknown>;
  out.description = sections.overview.length >= MIN_OVERVIEW ? sections.overview : job.description;
  for (const key of ["responsibilities", "qualifications", "benefits"] as const) {
    if (placed[key]) out[key] = placed[key];
  }
  if (placed.skills) out.requirements = Array.isArray(req) ? placed.skills : { ...reqObject, skills: placed.skills };
  return out as T;
}
