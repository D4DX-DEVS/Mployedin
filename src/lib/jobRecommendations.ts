/**
 * Candidate retrieval for the seeker's recommendation surfaces: which jobs are
 * even considered, and the shared pool and page sizes.
 *
 * Four surfaces used to answer "which jobs do we recommend" with four
 * different sets of rules — the seeker home page (SSR), /api/jobs/recommended,
 * /api/job-seeker/recommended-jobs and a leftover diagnostic route — which is
 * how the home page could server-render "no recommendations yet" and then
 * replace it a moment later with jobs the API was happy to return. They all
 * build their candidate query here; scoring and the recommend/don't verdict
 * belong to the matching engine (matching/seekerMatches.ts), the one the
 * emails use.
 *
 * No Mongoose in this module: the seeker home page's client component imports
 * HOME_RECOMMENDED_JOB_COUNT from it.
 */

import { COUNTRY_REGION_CODES, canonicalCountry } from "@/lib/i18n/locations";
import { escapeRegex } from "@/lib/security/sanitize";

/**
 * How far a job that fails a hard gate sinks in a browse list. It stays in the
 * list (the seeker still sees it, the way LinkedIn and Indeed keep showing
 * adjacent roles) but sits below the jobs that fit. The *displayed* match
 * score is never touched — the same job must read the same percentage on every
 * page.
 */
export const IRRELEVANT_SORT_PENALTY = 20;

/**
 * How many candidates every surface scores before cutting to its own page size.
 * Shared so the home page's top 4 are literally the first 4 of the feed's page
 * one, rather than the top of a differently-sized pool.
 */
export const RECOMMENDATION_POOL_SIZE = 200;

/**
 * How many recommended jobs the seeker home page shows.
 *
 * Lives here — a plain module with no "use client" — on purpose. It used to be
 * exported from the home page's client component, and a Server Component that
 * imports from a "use client" module receives a client-reference proxy for
 * EVERY export, not the value. `.slice(0, proxy)` coerces to NaN → 0, so the
 * server rendered `jobs: []` for every seeker no matter what the ranker found.
 */
export const HOME_RECOMMENDED_JOB_COUNT = 4;

/** Fields every scoring path needs. A missing one silently drops a signal. */
export const RECOMMENDED_JOB_SELECT =
  "title description requirements salary location workMode employmentType " +
  "employerId tags createdAt expiresAt views uniqueViews";

/**
 * Every spelling in COUNTRY_REGION_CODES that shares a region code, keyed by
 * that code — the one alias table the app already maintains, reversed.
 */
const NAMES_BY_REGION_CODE: Map<string, string[]> = (() => {
  const map = new Map<string, string[]>();
  for (const [name, code] of Object.entries(COUNTRY_REGION_CODES)) {
    map.set(code, [...(map.get(code) ?? []), name]);
  }
  return map;
})();

const REGION_CODES = new Set(Object.values(COUNTRY_REGION_CODES));

/** "Remote / Global" is a work-mode wish, not a country; the query's remote clause already covers it. */
function isRemotePreference(value: string): boolean {
  return value.startsWith("remote") && (value === "remote" || value.includes("global"));
}

/**
 * Every spelling of the seeker's preferred countries as anchored /i patterns:
 * the canonical name, its region code (jobs are filed as "IN" as well as
 * "India"), and every alias sharing that code. Each pattern also tolerates a
 * trailing qualifier on the JOB side, so "Oman (Muscat)" still matches "Oman".
 */
export function countryPatterns(preferredCountries: string[]): RegExp[] {
  const names = new Set<string>();
  for (const raw of preferredCountries) {
    const base = canonicalCountry(raw ?? "");
    if (!base || isRemotePreference(base)) continue;
    names.add(base);
    const code =
      COUNTRY_REGION_CODES[base] ?? (REGION_CODES.has(base.toUpperCase()) ? base.toUpperCase() : null);
    if (code) {
      names.add(code.toLowerCase());
      for (const alias of NAMES_BY_REGION_CODE.get(code) ?? []) names.add(alias);
    }
  }
  return [...names].map((name) => new RegExp("^[ ]*" + escapeRegex(name) + "[ ]*([(].*)?$", "i"));
}

/**
 * The Mongo filter for a seeker's candidate pool: live jobs, not expired, not
 * already applied to, and — when the seeker stated countries — in one of them
 * or remote.
 */
export function buildRecommendedJobQuery(opts: {
  preferredCountries?: string[] | null;
  excludeJobIds?: unknown[];
  now?: Date;
}): Record<string, unknown> {
  const now = opts.now ?? new Date();
  const query: Record<string, unknown> = { status: "active" };

  if (opts.excludeJobIds?.length) {
    query._id = { $nin: opts.excludeJobIds };
  }

  const and: Record<string, unknown>[] = [
    { $or: [{ expiresAt: null }, { expiresAt: { $gte: now } }] },
  ];

  const patterns = countryPatterns(opts.preferredCountries ?? []);
  if (patterns.length > 0) {
    and.push({
      $or: [
        { "location.country": { $in: patterns } },
        // A remote job is workable from anywhere, so it survives the country
        // filter regardless of where it is filed.
        { "location.isRemote": true },
      ],
    });
  }

  query.$and = and;
  return query;
}
