/**
 * One place for every number the recommendation pipeline depends on.
 *
 * These lived in four different files with three different values — the daily
 * digest refused anything under 50, the weekly digest and the re-engagement
 * mail both used 40, and the similar-jobs mail had no floor at all. A seeker
 * could therefore be told a job was too weak to mention on Monday and be sent
 * the same job on Sunday. Anything that decides "is this good enough to show a
 * human" now reads from here.
 */

/**
 * Default minimum relevance for a job to be listed or emailed.
 *
 * Admin-overridable via `SystemConfig.matching.minScore`; see
 * `resolveMatchThreshold`. 80 is the product decision: a recommendation is a
 * claim, and we would rather make fewer of them.
 */
export const DEFAULT_MIN_RELEVANCE = 80;

/** Never show more than this many jobs in one email. */
export const MAX_RECOMMENDATIONS = 5;

/**
 * Relevance weights. Location and salary are deliberately absent: they are
 * decided by the eligibility gate, so a job that reaches scoring has already
 * satisfied them and must not also collect points for it. Under the old single
 * pass they did, which is how a wrong-country job could still be emailed on the
 * strength of a neutral salary and an unstated experience level.
 */
export const RELEVANCE_WEIGHTS = {
  skills: 0.6,
  role: 0.25,
  experience: 0.15,
} as const;

/**
 * Cosine thresholds for treating two differently-worded skills as the same.
 *
 * Calibrated against the live vocabulary, where jobs ask for "API Testing" and
 * candidates wrote "Manual Testing" + "Selenium". Below NEAR, no credit: we
 * would rather miss a match than invent one.
 */
export const SKILL_COSINE_EXACT = 0.82;
export const SKILL_COSINE_NEAR = 0.75;
/** Credit awarded at each tier. An exact string match is always 1. */
export const SKILL_CREDIT_EXACT = 0.8;
export const SKILL_CREDIT_NEAR = 0.5;
/** Credit when the skill is absent from the profile but present in the CV text. */
export const SKILL_CREDIT_CV = 0.7;

/**
 * Only the first N required skills count towards coverage.
 *
 * Employers front-load the skills they actually need and pad the tail. Scoring
 * against a 12-item wish list meant a strong candidate who met the six real
 * requirements scored 50%. Median job on the board lists 3 skills, so this
 * changes nothing for most postings and stops the long ones from being
 * unmatchable.
 */
export const CORE_SKILL_COUNT = 6;

/**
 * Floor for a job that lists no skills at all. There is no evidence of skill
 * fit, so it cannot clear a high threshold on skills alone — by design. 22 of
 * 62 live jobs are in this state; the fix is to make employers state skills
 * (or extract them, see `jobSkillExtraction`), not to award free points.
 */
export const NO_SKILL_EVIDENCE = 0.15;

/** A seeker's salary expectation may exceed the job's midpoint by this factor before the job is dropped. */
export const SALARY_TOLERANCE = 0.8;

/** Years a seeker may fall short of a job's stated minimum before being dropped. */
export const EXPERIENCE_SLACK_YEARS = 1;

/** Don't recommend the same job to the same seeker twice inside this window. */
export const RECOMMENDATION_COOLDOWN_DAYS = 30;

/**
 * The Job fields the matcher reads. Every projection that feeds
 * `recommendJobsFor` must select all of them.
 *
 * The weekly digest used to project `employerName skills salaryRange
 * experienceLevel` — four paths that do not exist on the Job schema. Mongo
 * returns nothing for a path that is not there, so the digest silently ranked
 * on title and country alone while printing a confident match percentage.
 * A projection that omits a field the reader needs never errors, which is why
 * this list is shared and pinned by a test rather than repeated per caller.
 */
export const JOB_MATCH_FIELDS =
  "title requirements salary location workMode employerId createdAt expiresAt status";
