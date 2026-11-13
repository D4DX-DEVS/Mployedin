/**
 * Education level from free text, by whole words.
 *
 *   5 doctorate · 4 master / postgraduate · 3 bachelor / degree · 2 diploma · 1 school
 *
 * Replaces a substring match that read "iti" inside "utilities", missed the
 * school names most seekers here actually write ("SSLC" — 383 profile entries,
 * "Plus Two" — 196) and read the onboarding choice "Graduation/Diploma" as a
 * diploma only by accident. Measured on live data 2026-11-12: unreadable
 * degree entries fell from 2,412 to 878 of 11,727.
 *
 * Pure, no I/O.
 */

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
/** "M.A.", "B.E." written with dots. */
const DOTTED4 = /(?<![a-z0-9])m\.\s?(?:a|s|e|ed)\.?(?![a-z0-9])/;
const DOTTED3 = /(?<![a-z0-9])b\.\s?(?:a|s|e|ed)\.?(?![a-z0-9])/;
/** Capital abbreviations — only safe on a degree field, never on a job line ("MS Office"). */
const BARE4 = /(?<![A-Za-z0-9])(?:MA|MS|ME)(?![A-Za-z0-9])/;
const BARE3 = /(?<![A-Za-z0-9])(?:BA|BE|BS)(?![A-Za-z0-9])/;
/** "CA Intermediate", "CMA Intermediate" are professional exams, not school. */
const PROFESSIONAL_INTERMEDIATE = /(?<![a-z])(?:ca|cma|cs|icwa)\s+inter(?:mediate)?/;

export type EducationLevel = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * Level 1-5 named in `text`, 0 when none is. `bare` also reads BA / MA / BE
 * written in capitals: use it on a seeker's degree, not on a job's prose.
 */
export function educationLevel(text: string | undefined | null, bare = false): EducationLevel {
  if (!text) return 0;
  // "B-E" and "M_Tech" read as "b.e" and "m.tech".
  const lower = text.toLowerCase().replace(/[’`]/g, "'").replace(/(?<![a-z])([bm])[-_]([a-z])/g, "$1.$2");
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

/**
 * One education entry's level. A degree written as two levels ("Graduation/Diploma",
 * the old onboarding choice) is read as the lower one, unless the course or field
 * says more ("B.Tech/B.E.").
 */
export function seekerEntryLevel(entry: { degree?: string; field?: string; course?: string }): EducationLevel {
  const alternatives = (entry.degree ?? "")
    .split("/")
    .map((part) => educationLevel(part, true))
    .filter((n) => n > 0);
  const degree = alternatives.length > 1 ? (Math.min(...alternatives) as EducationLevel) : educationLevel(entry.degree, true);
  return Math.max(degree, educationLevel(entry.field, true), educationLevel(entry.course, true)) as EducationLevel;
}
