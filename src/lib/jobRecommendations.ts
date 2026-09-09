/**
 * The single source of truth for "which jobs do we recommend to this seeker,
 * and in what order".
 *
 * Four surfaces used to answer that question with four different sets of rules
 * — the seeker home page (SSR), /api/jobs/recommended,
 * /api/job-seeker/recommended-jobs and a leftover diagnostic route — which is
 * how the home page could server-render "no recommendations yet" and then
 * replace it a moment later with jobs the API was happy to return. Every
 * surface now builds its candidate query, its relevance verdict and its
 * ranking here, so they can only ever disagree about page size.
 */

import { COUNTRY_REGION_CODES } from "@/lib/i18n/locations";
import {
  calculateMatchScore,
  educationRank,
  getMatchedJobSkills,
  jobProfileFromDoc,
  skillsOverlap,
  type SeekerProfile,
} from "@/lib/matchScore";

/**
 * How far an off-profile job sinks in the ranking. It stays in the list (the
 * seeker still sees it, the way LinkedIn and Indeed keep showing adjacent
 * roles) but cannot outrank a job that genuinely fits. The *displayed* match
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

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Reduce a stored preference to the country it names. Real data carries
 * trailing spaces and qualifiers — "Oman ", "Oman (Muscat)", "Saudi Arabia
 * (Transferable Iqama)" — none of which is a different country.
 */
function canonicalCountry(value: string): string {
  return value.split("(")[0].replace(/ +/g, " ").trim().toLowerCase();
}

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

/** The shape every caller's lean job document already satisfies. */
export interface RecommendableJob {
  title?: string | null;
  requirements?: { skills?: string[]; education?: string } | null;
  [key: string]: unknown;
}

export interface RankedJob<T> {
  matchScore: number;
  matchedSkills: string[];
  /** matchScore minus the off-profile penalty. Ordering only — never shown. */
  sortScore: number;
  job: T;
}

/**
 * Is this job on-profile for the seeker?
 *
 * One signal is enough: a skill overlap OR a preferred-role title match. A job
 * demanding a qualification two or more levels above the seeker's is off-
 * profile whatever else matches — no amount of skill overlap makes a PhD role
 * reachable for a bachelor's holder.
 */
export function isRelevantJob(job: RecommendableJob, seeker: SeekerProfile): boolean {
  const requiredLevel = educationRank(job.requirements?.education);
  const seekerLevel = seeker.educationLevel ?? 0;
  if (requiredLevel > 0 && seekerLevel > 0 && requiredLevel - seekerLevel >= 2) return false;

  const roles = (seeker.preferredRoles ?? []).map((role) => role.toLowerCase());
  const hasSkillSignal = seeker.skills.length > 0;
  const hasRoleSignal = roles.length > 0;
  // Nothing to compare against — everything is fair game rather than nothing.
  if (!hasSkillSignal && !hasRoleSignal) return true;

  if (hasSkillSignal && skillsOverlap(seeker.skills, job.requirements?.skills ?? [])) return true;

  const title = (job.title ?? "").toLowerCase();
  return (
    hasRoleSignal &&
    title.length > 0 &&
    roles.some((role) => title.includes(role) || role.includes(title))
  );
}

/** Score one job without ordering it. */
export function scoreRecommendedJob<T extends RecommendableJob>(
  job: T,
  seeker: SeekerProfile,
): RankedJob<T> {
  const matchScore = calculateMatchScore(
    seeker,
    jobProfileFromDoc(job as Parameters<typeof jobProfileFromDoc>[0]),
  );
  return {
    matchScore,
    matchedSkills: getMatchedJobSkills(seeker.skills, job.requirements?.skills ?? []),
    sortScore: isRelevantJob(job, seeker)
      ? matchScore
      : Math.max(0, matchScore - IRRELEVANT_SORT_PENALTY),
    job,
  };
}

/**
 * Score a candidate pool and order it best-first. Returns the job documents
 * with matchScore/matchedSkills/sortScore merged in, so callers can serialize
 * whichever fields their page needs.
 */
export function rankRecommendedJobs<T extends RecommendableJob>(
  jobs: T[],
  seeker: SeekerProfile,
): Array<T & { matchScore: number; matchedSkills: string[]; sortScore: number }> {
  return jobs
    .map((job) => {
      const { matchScore, matchedSkills, sortScore } = scoreRecommendedJob(job, seeker);
      return { ...job, matchScore, matchedSkills, sortScore };
    })
    .sort((a, b) => b.sortScore - a.sortScore);
}
