/**
 * Stage 1 — eligibility. Binary, never scored.
 *
 * Two different kinds of criterion live here, and they must not share a rule.
 *
 * **Seeker preferences** (pay, work mode, and which country they will work in)
 * only vote when both sides stated them. An unstated preference is not a preference. On the live corpus
 * only 21 of 239 seekers give a salary expectation and 27 of 62 jobs carry no
 * salary at all, so a gate that fired on silence would delete the feature
 * rather than sharpen it.
 *
 * **Employer requirements** (minimum experience, qualification) do not work
 * that way. Silence on the seeker's side is not permission — it is an unknown,
 * and the honest answer to "is this person eligible?" is "we cannot say". So
 * they resolve three ways, not two: pass, fail, or *unknown*, and unknown is
 * not a pass. 37 of 62 live jobs state a minimum experience; before this, a
 * seeker who had never entered any experience skipped that check entirely and
 * could still be emailed a "92% match" for a job asking five years.
 *
 * Unknown is reported with its own reason so the fallback email can ask for the
 * one missing field instead of guessing — which is the whole point: it turns a
 * false match into a useful prompt.
 *
 * Everything decided here is deliberately kept out of the relevance score. A
 * job that reaches stage 2 already matches on location, pay band, seniority and
 * work mode; scoring those again would let a job compensate for being in the
 * wrong country by being vague about salary, which is exactly what the previous
 * single-pass scorer did.
 */

import { countryKey } from "@/lib/i18n/locations";
import { workModePenalty, type SeekerProfile, type JobProfile } from "@/lib/matchScore";
import { SALARY_TOLERANCE, EXPERIENCE_SLACK_YEARS } from "@/lib/matching/constants";

export type IneligibleReason =
  | "country"
  | "work_mode"
  | "salary"
  | "experience"
  | "education"
  /** Job states a minimum experience; the seeker has never told us theirs. */
  | "experience_unknown"
  /** Job states a required qualification; the seeker lists none we can rank. */
  | "education_unknown";

export interface Eligibility {
  eligible: boolean;
  /** Why the job was dropped. Absent when eligible. Logged, so we can see which gate starves whom. */
  reason?: IneligibleReason;
}

const ELIGIBLE: Eligibility = { eligible: true };

/** Monthly-equivalent midpoint of a job's advertised pay, or 0 when not stated. */
export function monthlySalaryMidpoint(job: JobProfile): number {
  if (!(job.salaryMin > 0 || job.salaryMax > 0)) return 0;
  let mid = (job.salaryMin + job.salaryMax) / 2;
  // "lpa" amounts are stored as whole rupees (12 LPA = 1,200,000). Employers
  // occasionally type the figure in lakhs instead; no real annual salary in
  // rupees is under 1,000, so treat that as the unit error it is.
  if (job.salaryPeriod === "lpa" && mid > 0 && mid < 1000) mid *= 100_000;
  const perYear = job.salaryPeriod === "yearly" || job.salaryPeriod === "lpa";
  return perYear ? mid / 12 : mid;
}

/**
 * The countries this job can actually hire into, normalised.
 *
 * `null` means no country constraint exists — the one case where the check is
 * skipped rather than satisfied.
 *
 * The three remote cases are deliberately distinct:
 *
 *   worldwide   the employer said so explicitly    -> null, no check
 *   countries   the employer listed them           -> that list
 *   unset       the employer was never asked       -> the job's own country
 *
 * The third is the important one. Unset is not a quiet "worldwide": every job
 * posted before this field existed lands there, and the only thing we actually
 * know about those is the country already on the record. Treating them as
 * worldwide would silently keep the old behaviour under a new name; treating
 * them as ineligible for everyone would decide something about them we have no
 * basis to decide. Falling back to their stated country does neither — it is
 * the conservative reading, and the employer can widen it in one click.
 */
function allowedCountryKeys(job: JobProfile): string[] | null {
  if (job.remote) {
    if (job.remoteScope === "worldwide") return null;
    if (job.remoteScope === "countries") {
      return (job.remoteCountries ?? []).map(countryKey).filter(Boolean);
    }
  }
  const jobKey = countryKey(job.location);
  return jobKey ? [jobKey] : null;
}

/**
 * Whether this job may be recommended to this seeker at all.
 *
 * Ordered cheapest-first: country rejects roughly 60% of pairs on the live
 * corpus, so running it before the arithmetic keeps the daily cron's cost down.
 */
export function checkEligibility(seeker: SeekerProfile, job: JobProfile): Eligibility {
  // ── Country ────────────────────────────────────────────────────────────
  // Both sides must have named a country, and they must agree once normalised
  // — preferences and job records carry city qualifiers ("Oman (Muscat)"),
  // padding and bare region codes.
  //
  // `isRemote` used to skip this check outright, which read "remote" as
  // "anyone, anywhere". It is not: a remote job can still be limited by work
  // authorisation, payroll entity or timezone. The employer now says which,
  // and only an explicit "worldwide" lifts the check.
  const stated = (seeker.locations?.length ? seeker.locations : [seeker.location]).filter(Boolean);
  const seekerKeys = stated.map(countryKey).filter(Boolean);

  if (seekerKeys.length > 0) {
    const allowed = allowedCountryKeys(job);
    // `null` = worldwide, the only case with no country to satisfy.
    if (allowed !== null && allowed.length > 0 && !allowed.some((k) => seekerKeys.includes(k))) {
      return { eligible: false, reason: "country" };
    }
  }

  // ── Work mode ──────────────────────────────────────────────────────────
  // Only opposite pairs (remote vs onsite) disqualify. workModePenalty already
  // returns 0 when either side is unknown or the seeker said "any", and the
  // smaller adjacent penalty for a hybrid step — which is a ranking concern,
  // not an eligibility one.
  if (workModePenalty(seeker.jobType, job.workMode) >= 15) {
    return { eligible: false, reason: "work_mode" };
  }

  // ── Experience ─────────────────────────────────────────────────────────
  // An employer requirement, so it resolves three ways. Unknown does not pass:
  // relevance would score the missing years at a neutral 0.5, leaving a ceiling
  // of 92 — comfortably over any sane threshold — for a candidate we cannot
  // confirm meets the stated minimum at all.
  if (job.minExp > 0) {
    if (seeker.experienceKnown === false) {
      return { eligible: false, reason: "experience_unknown" };
    }
    // Under-qualified by more than a year. Being *over*-qualified is not a
    // disqualification — that is a ranking signal, handled in relevance.
    if (seeker.experienceYears < job.minExp - EXPERIENCE_SLACK_YEARS) {
      return { eligible: false, reason: "experience" };
    }
  }

  // ── Salary ─────────────────────────────────────────────────────────────
  // Both sides stated a figure, in a currency we can actually compare, and the
  // job pays materially less than the seeker asked for.
  if (seeker.salaryExpectation > 0) {
    const mid = monthlySalaryMidpoint(job);
    const seekerCur = (seeker.salaryCurrency ?? "").toUpperCase().trim();
    const jobCur = (job.salaryCurrency ?? "").toUpperCase().trim();
    const comparable = !seekerCur || !jobCur || seekerCur === jobCur;
    if (mid > 0 && comparable && mid < seeker.salaryExpectation * SALARY_TOLERANCE) {
      return { eligible: false, reason: "salary" };
    }
  }

  // ── Education ──────────────────────────────────────────────────────────
  // The other employer requirement, so the same three-way rule. Education is
  // scored nowhere in stage 2, so an unknown qualification used to skip the
  // only check there was.
  const required = job.requiredEducationLevel ?? 0;
  const held = seeker.educationLevel ?? 0;
  if (required > 0) {
    if (held === 0) {
      return { eligible: false, reason: "education_unknown" };
    }
    // Two or more qualification ranks short. A one-rank gap stays a ranking
    // penalty, because employers routinely over-state the requirement.
    if (required - held >= 2) {
      return { eligible: false, reason: "education" };
    }
  }

  return ELIGIBLE;
}
