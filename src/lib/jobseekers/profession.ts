/**
 * A job seeker's profession, for the agent report's "by profession" summary.
 *
 * The role they say they want (preferredRoles) first: it is short and chosen.
 * Then the career-profile category and role, then their latest job title. The
 * last two are often pasted CV lines ("Accountant – Imutsa, Kochi (2019–
 * present)"), so every candidate is cut at the first dash / bracket / comma /
 * " at ", and non-answers ("Currently seeking", "fresher") are skipped.
 */
export interface JobSeekerWithProfession {
  careerProfile?: { jobRole?: string; roleCategory?: string } | null;
  preferredRoles?: string[];
  experience?: Array<{ jobTitle?: string; isCurrent?: boolean }>;
}

/** Sentinel for seekers with nothing to go on; the page translates it. */
export const PROFESSION_NOT_SPECIFIED = "__not_specified__";
/** Sentinel for everything past the top professions; the page translates it. */
export const PROFESSION_OTHER = "__other__";

export function extractProfession(seeker: JobSeekerWithProfession): string {
  const candidates = [
    ...(seeker.preferredRoles ?? []),
    seeker.careerProfile?.roleCategory,
    seeker.careerProfile?.jobRole,
    seeker.experience?.find((e) => e.isCurrent)?.jobTitle ?? seeker.experience?.[0]?.jobTitle,
  ];
  for (const raw of candidates) {
    const cleaned = cleanRole(raw);
    if (cleaned) return normalizeLabel(cleaned);
  }
  return PROFESSION_NOT_SPECIFIED;
}

/** Not a profession: what people type when they have none yet. */
const NON_ANSWER = /^(currently|seeking|looking|no prior|no experience|fresher|fresh graduate|job ?seeker|open to|any|none|n\/a|not applicable)\b/i;

function cleanRole(value?: string | null): string | undefined {
  if (!value) return undefined;
  const cut = value.split(/,|\(|\s[|–—-]\s|\sat\s/i)[0]?.replace(/[.;:]+$/, "").trim();
  if (!cut || cut.length < 2 || cut.length > 50 || NON_ANSWER.test(cut) || !/\p{L}/u.test(cut)) return undefined;
  return cut;
}

/** Trim, collapse whitespace, Title Case — "SALES  executive" and "Sales Executive" group together. */
function normalizeLabel(label: string): string {
  return label
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/(^|[\s/-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** Top `limit` professions by count, the rest folded into PROFESSION_OTHER. */
export function professionBreakdown(seekers: JobSeekerWithProfession[], limit = 10): Array<{ profession: string; count: number }> {
  const counts = new Map<string, number>();
  for (const s of seekers) {
    const p = extractProfession(s);
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  // "Not specified" is listed, but never takes a top slot from a real profession.
  const notSpecified = counts.get(PROFESSION_NOT_SPECIFIED) ?? 0;
  counts.delete(PROFESSION_NOT_SPECIFIED);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const rows = sorted.slice(0, limit).map(([profession, count]) => ({ profession, count }));
  const other = sorted.slice(limit).reduce((sum, [, c]) => sum + c, 0);
  if (other > 0) rows.push({ profession: PROFESSION_OTHER, count: other });
  if (notSpecified > 0) rows.push({ profession: PROFESSION_NOT_SPECIFIED, count: notSpecified });
  return rows;
}
