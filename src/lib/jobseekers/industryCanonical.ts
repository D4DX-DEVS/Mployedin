/**
 * Folds the industry text stored on seekers onto the admin Industries master.
 *
 * JobSeeker.industry holds whatever CV reading wrote — "Accounting/Taxation",
 * "Construction/Cement/Metals", "Accounting / Data Entry", even job titles —
 * about 200 spellings for 58 master names (2026-11-13). Rewriting the data is
 * the owner's call (backfill dry-run only), so counts and the filter read it
 * through this map instead: a master name in any case or spacing stays itself,
 * other wording goes to the master name its keywords point to, and anything
 * that cannot be placed stays unclassified rather than guessed.
 *
 * Pure: callers pass the master names (industryCanonical.server.ts loads them).
 */

import { detectIndustries } from "@/lib/matching/industry";
import { INDUSTRY_KEY_TO_INDUSTRIES } from "@/lib/jobseekers/industryClassifier";

export interface IndustryCount {
  industry: string;
  count: number;
}

/** Lowercase, no spaces or punctuation: "Arts / Entertainment" = "arts/entertainment". */
const squash = (text: string): string => text.toLowerCase().replace(/[^a-z0-9&]+/g, "");

/** The master name a stored value means, or null when it cannot be placed. */
export function canonicalIndustry(raw: string | null | undefined, masterNames: readonly string[]): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  const key = squash(text);
  const exact = masterNames.find((name) => squash(name) === key);
  if (exact) return exact;
  // The first industry its keywords name, when that maps to a master name.
  for (const detected of detectIndustries(text)) {
    const name = INDUSTRY_KEY_TO_INDUSTRIES[detected];
    if (masterNames.includes(name)) return name;
  }
  return null;
}

/** Raw `$group` rows → one row per master name, largest first; unplaceable values dropped. */
export function canonicalIndustryCounts(
  rows: ReadonlyArray<{ industry: string | null | undefined; count: number }>,
  masterNames: readonly string[],
): IndustryCount[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const name = canonicalIndustry(row.industry, masterNames);
    if (name) totals.set(name, (totals.get(name) ?? 0) + row.count);
  }
  return [...totals.entries()]
    .map(([industry, count]) => ({ industry, count }))
    .sort((a, b) => b.count - a.count || a.industry.localeCompare(b.industry));
}

/** Every stored spelling that means `industry`, so a filter on it finds them all. */
export function rawIndustryValuesFor(
  industry: string,
  storedValues: readonly string[],
  masterNames: readonly string[],
): string[] {
  const wanted = canonicalIndustry(industry, masterNames) ?? industry;
  const matches = storedValues.filter((value) => canonicalIndustry(value, masterNames) === wanted);
  return [...new Set([wanted, ...matches])];
}
