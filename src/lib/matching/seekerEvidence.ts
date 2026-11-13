/**
 * What a seeker's profile and CV show, in the terms the job requirements are
 * read in (jobRequirements.ts): education entries with level and field, the
 * languages they list, licences they typed or their CV names, and every role
 * with its dates.
 *
 * Built once per seeker, inside seekerProfileFromDoc. Pure, no I/O.
 */

import { educationLevel, seekerEntryLevel, type EducationLevel } from "@/lib/matching/educationLevel";
import { familiesOf, hasSpecificFamily } from "@/lib/matching/fieldOfStudy";
import { languageNames } from "@/lib/matching/jobRequirements";

export interface EducationEntry {
  level: EducationLevel;
  /** Degree, field and course, as written. */
  label: string;
  /** Lower-cased, for matching. */
  text: string;
  families: Set<string>;
  /** A subject is named: a field or course, or a degree name that carries one ("B.Com"). */
  fieldStated: boolean;
}

export interface RoleEvidence {
  title: string;
  company: string;
  /** Lower-cased title + description, for subject matching. */
  text: string;
  years: number;
  /** Dated: years can be counted. */
  dated: boolean;
  start?: number;
  end?: number;
  /**
   * The end is a guess (no end date, not current: taken to end where the next
   * role starts). Its years count towards the total, but must not by
   * themselves meet a years requirement (requirementParts.ts).
   */
  estimated?: boolean;
}

export interface SeekerEvidence {
  /** Highest level held (degrees still being studied do not count). */
  level: EducationLevel;
  entries: EducationEntry[];
  languages: string[];
  /** Typed certifications and skills, as written. */
  listed: string[];
  /** CV text, lower-cased. */
  cv: string;
  roles: RoleEvidence[];
}

export interface SeekerEvidenceDoc {
  skills?: string[];
  certifications?: string[];
  languages?: Array<{ language?: string }>;
  education?: Array<{ degree?: string; field?: string; course?: string; graduationDate?: Date | string }>;
  experience?: Array<{
    jobTitle?: string;
    company?: string;
    description?: string;
    startDate?: Date | string;
    endDate?: Date | string;
    isCurrent?: boolean;
  }>;
  cv?: { rawText?: string };
}

/**
 * "pursuing BBA", "B.Tech (ongoing)", "BSc Computer Science (Incomplete)": not
 * held. The last one read as Has on a live check (2026-11-12).
 */
const IN_PROGRESS =
  /pursuing|ongoing|currently (?:studying|enrolled)|in progress|expected|appearing|incomplete|not completed|discontinued|dropped out|unfinished/i;
const YEAR_MS = 1000 * 60 * 60 * 24 * 365.25;

function entryOf(entry: NonNullable<SeekerEvidenceDoc["education"]>[number], now: number): EducationEntry {
  const label = [entry.degree, entry.field, entry.course].filter((s) => s?.trim()).join(" · ");
  const text = label.toLowerCase();
  const graduates = entry.graduationDate ? new Date(entry.graduationDate).getTime() : NaN;
  // A CV parse often packs several degrees into one entry; drop the parts that
  // say they are still being studied, keep the rest.
  const heldText = [entry.degree, entry.field, entry.course]
    .filter(Boolean)
    .join(" ; ")
    .split(/[;|]/)
    .filter((part) => !IN_PROGRESS.test(part))
    .join(" ; ");
  const stillStudying = Number.isFinite(graduates) && graduates > now;
  const level = stillStudying
    ? 0
    : heldText === [entry.degree, entry.field, entry.course].filter(Boolean).join(" ; ")
      ? seekerEntryLevel(entry)
      : educationLevel(heldText, true);
  const families = familiesOf(text);
  return {
    level: level as EducationLevel,
    label,
    text,
    families,
    fieldStated: hasSpecificFamily(families) || Boolean(entry.field?.trim() || entry.course?.trim()),
  };
}

type ExperienceEntry = NonNullable<SeekerEvidenceDoc["experience"]>[number];

/**
 * When each role ran, or null when that cannot be told. A role that is not
 * current and has no end date ended when the next role began; with no later
 * role it is undated. Counting it to today inflated careers: an internship
 * from 2024-07 with no end, then a job from 2025-01, read as 4.2 years for a
 * 2.4-year career (live check 2026-11-12).
 */
export function roleSpans(
  experience: readonly ExperienceEntry[],
  now = Date.now(),
): Array<{ start: number; end: number; estimated?: true } | null> {
  const starts = experience.map((exp) => (exp.startDate ? new Date(exp.startDate).getTime() : NaN));
  return experience.map((exp, i) => {
    const start = starts[i];
    if (!Number.isFinite(start)) return null;
    let end: number;
    let estimated = false;
    if (exp.isCurrent) end = now;
    else if (exp.endDate) end = new Date(exp.endDate).getTime();
    else {
      const later = starts.filter((s, j) => j !== i && Number.isFinite(s) && s > start);
      if (later.length === 0) return null;
      end = Math.min(...later);
      estimated = true;
    }
    if (!Number.isFinite(end) || end < start) return null;
    return estimated ? { start, end, estimated: true } : { start, end };
  });
}

/** Union of the dated roles' time spans, in years — two overlapping jobs count once. */
export function spannedYears(roles: readonly RoleEvidence[]): number {
  const spans = roles
    .filter((r) => r.dated && r.start !== undefined && r.end !== undefined)
    .map((r) => [r.start as number, r.end as number] as const)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [curStart, curEnd] = [Number.NaN, Number.NaN];
  for (const [s, e] of spans) {
    if (Number.isNaN(curStart) || s > curEnd) {
      if (!Number.isNaN(curStart)) total += curEnd - curStart;
      [curStart, curEnd] = [s, e];
    } else curEnd = Math.max(curEnd, e);
  }
  if (!Number.isNaN(curStart)) total += curEnd - curStart;
  // Roles carrying years without exact dates (hand-built profiles).
  const loose = roles.filter((r) => r.dated && r.start === undefined).reduce((sum, r) => sum + r.years, 0);
  return total / YEAR_MS + loose;
}

export function seekerEvidenceFromDoc(doc: SeekerEvidenceDoc, now = Date.now()): SeekerEvidence {
  const entries = (doc.education ?? []).map((e) => entryOf(e, now)).filter((e) => e.label);
  const experience = doc.experience ?? [];
  const spans = roleSpans(experience, now);
  const roles: RoleEvidence[] = experience.map((exp, i) => {
    const span = spans[i];
    return {
      title: exp.jobTitle?.trim() ?? "",
      company: exp.company?.trim() ?? "",
      text: `${exp.jobTitle ?? ""} ${exp.description ?? ""}`.toLowerCase(),
      years: span ? (span.end - span.start) / YEAR_MS : 0,
      dated: span !== null,
      ...(span ?? {}),
    };
  });
  return {
    level: entries.reduce<number>((max, e) => Math.max(max, e.level), 0) as EducationLevel,
    entries,
    languages: languageNames((doc.languages ?? []).map((l) => l.language ?? "")),
    listed: [...(doc.certifications ?? []), ...(doc.skills ?? [])].filter((s) => s?.trim()),
    cv: (doc.cv?.rawText ?? "").toLowerCase(),
    roles,
  };
}
