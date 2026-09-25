/**
 * The employer's requirements checklist for one applicant — LinkedIn's
 * "meets 4 of 5 qualifications", Indeed's qualification badges.
 *
 * The match score answers "how good a fit is this person"; it cannot answer
 * "does this person meet what I asked for". A candidate with every skill and
 * one year of experience scores 86 against a 5–8 year job, because skills
 * carry most of the weight — and the employer was never told the experience
 * requirement failed. This lists each requirement the job states, whether the
 * candidate meets it, and rolls the hard ones up into one status that the
 * shortlist filters on.
 *
 * Hard requirements are the employer's own asks: minimum experience, the
 * required qualification, a remote job's hiring countries and deal-breaker
 * screening answers. The rest — skills coverage, industry, location, salary,
 * work mode, languages, preferred answers — are shown, never filtered on: a
 * Gulf employer routinely hires a candidate who lives in India, and a skills
 * gap is already priced into the score.
 *
 * Unknown is not a pass and not a fail. A candidate who never stated their
 * experience is "unverified", still shortlistable, and the employer sees why.
 */

import type { SeekerProfile, JobProfile } from "@/lib/matchScore";
import { workModePenalty } from "@/lib/matchScore";
import { countryKey } from "@/lib/i18n/locations";
import { monthlySalaryMidpoint } from "@/lib/matching/eligibility";
import type { RelevanceBreakdown } from "@/lib/matching/relevance";
import { EXPERIENCE_SLACK_YEARS, SALARY_TOLERANCE } from "@/lib/matching/constants";
import { describeKnockout, evaluateKnockout, type KnockoutRule } from "@/lib/matching/knockouts";
import type { IndustryFit, IndustryKey } from "@/lib/matching/industry";
import type { Locality, LocalityLevel } from "@/lib/matching/locality";
import type { ApplicantCv, CvState } from "@/lib/cv/parsedCv";

export type QualificationKey =
  | "experience"
  | "education"
  | "skills"
  | "industry"
  | "location"
  | "salary"
  | "work_mode"
  | "languages"
  | "screening"
  | "cv";

/**
 * `partial` is close but short — within a year of the minimum, one education
 * level below. It counts as meeting a hard requirement (the recommendation
 * gate allows the same slack) but is shown amber.
 */
export type QualificationStatus = "met" | "partial" | "not_met" | "unknown";

export interface QualificationCheck {
  key: QualificationKey;
  status: QualificationStatus;
  /** Hard checks decide `RequirementsStatus`; soft ones are shown only. */
  hard: boolean;
  /** What the job asks, as data: "5" years, education level "3", "uae", "8 of 10". */
  required?: string;
  /** What the candidate has, in the same terms. */
  actual?: string;
  /** Screening checks: which question, and its text. */
  questionId?: string;
  label?: string;
}

/**
 * met        every hard requirement met (or close)
 * not_met    at least one hard requirement failed — excluded from Shortlist Top
 * unverified none failed, but at least one could not be checked
 */
export type RequirementsStatus = "met" | "not_met" | "unverified";

export interface QualificationInput {
  seeker: SeekerProfile;
  job: JobProfile;
  relevance: RelevanceBreakdown;
  /** Languages the seeker lists (names only). */
  seekerLanguages?: readonly string[];
  /** Job.requirements.languages. */
  jobLanguages?: readonly string[];
  /** Job.screeningKnockouts. */
  knockouts?: readonly KnockoutRule[];
  /** Job.screeningQuestions — for the label shown beside a knockout. */
  questions?: ReadonlyArray<{ id: string; label: string }>;
  /** Application.screeningAnswers. Absent for a talent-pool candidate who never applied. */
  answers?: ReadonlyArray<{ questionId: string; answer: unknown }>;
  /** The job's industries (industry.ts); shown as what the job asks. */
  jobIndustries?: readonly IndustryKey[];
  /** The candidate's industry fit; null or absent when the job names none. */
  industry?: IndustryFit | null;
  /** How near the candidate is (locality.server.ts); absent for remote jobs. */
  locality?: Locality | null;
  /** The CV behind the score (lib/cv/cvDocuments.ts); absent when the caller did not look. */
  cv?: ApplicantCv | null;
}

const fmtYears = (years: number) => String(Math.round(years * 10) / 10);

function experienceCheck(seeker: SeekerProfile, job: JobProfile): QualificationCheck | null {
  if (!(job.minExp > 0)) return null;
  const base = { key: "experience" as const, hard: true, required: fmtYears(job.minExp) };
  if (seeker.experienceKnown === false) return { ...base, status: "unknown" };
  const years = seeker.experienceYears;
  const status: QualificationStatus =
    years >= job.minExp ? "met" : years >= job.minExp - EXPERIENCE_SLACK_YEARS ? "partial" : "not_met";
  return { ...base, status, actual: fmtYears(years) };
}

function educationCheck(seeker: SeekerProfile, job: JobProfile): QualificationCheck | null {
  const required = job.requiredEducationLevel ?? 0;
  if (required <= 0) return null;
  const held = seeker.educationLevel ?? 0;
  const base = { key: "education" as const, hard: true, required: String(required) };
  if (held <= 0) return { ...base, status: "unknown" };
  const status: QualificationStatus = held >= required ? "met" : required - held === 1 ? "partial" : "not_met";
  return { ...base, status, actual: String(held) };
}

function skillsCheck(relevance: RelevanceBreakdown): QualificationCheck | null {
  if (relevance.skillsUnknown) return null;
  // Every required skill when the job lists them; else the engine's core set.
  const all = relevance.requiredCoverage !== null;
  const matched = (all ? relevance.requiredMatched : relevance.matchedSkills).length;
  const total = matched + (all ? relevance.requiredMissing : relevance.missingSkills).length;
  if (total === 0) return null;
  const status: QualificationStatus =
    matched === total ? "met" : matched * 2 >= total ? "partial" : "not_met";
  return { key: "skills", status, hard: false, required: String(total), actual: String(matched) };
}

/**
 * Where the job may be worked from against where the candidate will work.
 *
 * Hard only for a remote job the employer restricted to named countries — an
 * explicit hiring constraint. An onsite job in another country is soft: people
 * apply abroad on purpose, and relocation is the employer's call.
 */
const LOCALITY_STATUS: Record<LocalityLevel, QualificationStatus> = {
  same_city: "met",
  same_state: "met",
  same_country: "partial",
  abroad: "not_met",
  unknown: "unknown",
};

function locationCheck(seeker: SeekerProfile, job: JobProfile, locality?: Locality | null): QualificationCheck | null {
  if (job.remote && job.remoteScope === "worldwide") return null;
  const restricted = job.remote && job.remoteScope === "countries";
  // An on-site job with a city: how near, not only which country. Same city or
  // state is met; elsewhere in the country means relocating (partial).
  if (!restricted && locality) {
    return {
      key: "location",
      status: LOCALITY_STATUS[locality.level],
      hard: false,
      required: locality.jobPlace,
      ...(locality.seekerPlace ? { actual: locality.seekerPlace } : {}),
    };
  }
  const allowed = restricted ? job.remoteCountries ?? [] : job.location ? [job.location] : [];
  const allowedKeys = allowed.map(countryKey).filter(Boolean);
  if (allowedKeys.length === 0) return null;

  const stated = (seeker.locations?.length ? seeker.locations : [seeker.location]).filter(Boolean);
  const base = { key: "location" as const, hard: restricted, required: allowed.join(", ") };
  if (stated.length === 0) return { ...base, status: "unknown" };
  const met = stated.map(countryKey).some((key) => key && allowedKeys.includes(key));
  return { ...base, status: met ? "met" : "not_met", actual: stated.join(", ") };
}

function salaryCheck(seeker: SeekerProfile, job: JobProfile): QualificationCheck | null {
  if (!(seeker.salaryExpectation > 0)) return null;
  const mid = monthlySalaryMidpoint(job);
  if (!(mid > 0)) return null;
  const seekerCur = (seeker.salaryCurrency ?? "").toUpperCase().trim();
  const jobCur = (job.salaryCurrency ?? "").toUpperCase().trim();
  if (seekerCur && jobCur && seekerCur !== jobCur) return null;
  const expected = seeker.salaryExpectation;
  const status: QualificationStatus =
    expected <= mid ? "met" : mid >= expected * SALARY_TOLERANCE ? "partial" : "not_met";
  const cur = jobCur || seekerCur;
  const money = (n: number) => `${cur ? `${cur} ` : ""}${Math.round(n)}`;
  return { key: "salary", status, hard: false, required: money(mid), actual: money(expected) };
}

function workModeCheck(seeker: SeekerProfile, job: JobProfile): QualificationCheck | null {
  const pref = (seeker.jobType ?? "").toLowerCase().trim();
  const mode = (job.workMode ?? "").toLowerCase().trim();
  if (!pref || pref === "any" || !mode) return null;
  const penalty = workModePenalty(pref, mode);
  const status: QualificationStatus = penalty === 0 ? "met" : penalty >= 15 ? "not_met" : "partial";
  return { key: "work_mode", status, hard: false, required: mode, actual: pref };
}

function languagesCheck(seekerLanguages: readonly string[], jobLanguages: readonly string[]): QualificationCheck | null {
  const wanted = jobLanguages.map((l) => l.trim()).filter(Boolean);
  if (wanted.length === 0) return null;
  const base = { key: "languages" as const, hard: false, required: wanted.join(", ") };
  const spoken = seekerLanguages.map((l) => l.trim().toLowerCase()).filter(Boolean);
  if (spoken.length === 0) return { ...base, status: "unknown" };
  const have = wanted.filter((l) => spoken.includes(l.toLowerCase()));
  const status: QualificationStatus =
    have.length === wanted.length ? "met" : have.length > 0 ? "partial" : "not_met";
  return { ...base, status, actual: have.join(", ") };
}

/** Years in the job's industry; a mention alone is partial. Never a filter. */
function industryCheck(input: QualificationInput): QualificationCheck | null {
  const fit = input.industry;
  if (!fit) return null;
  const wanted = input.jobIndustries?.length ? input.jobIndustries : fit.matched;
  const status: QualificationStatus = fit.score >= 75 ? "met" : fit.score >= 50 ? "partial" : "not_met";
  return {
    key: "industry",
    status,
    hard: false,
    ...(wanted.length ? { required: wanted.join(", ") } : {}),
    ...(fit.years > 0 ? { actual: fmtYears(fit.years) } : {}),
  };
}

function screeningChecks(input: QualificationInput): QualificationCheck[] {
  const labels = new Map((input.questions ?? []).map((q) => [q.id, q.label]));
  const answers = new Map((input.answers ?? []).map((a) => [a.questionId, a.answer]));
  return (input.knockouts ?? [])
    .filter((rule) => labels.has(rule.questionId))
    .map((rule) => {
      const answer = answers.get(rule.questionId);
      const status = evaluateKnockout(rule, answer);
      const given = Array.isArray(answer) ? answer.join(", ") : answer == null ? "" : String(answer);
      return {
        key: "screening" as const,
        status,
        // A preferred answer is a plus, not a filter.
        hard: !rule.preferred,
        required: describeKnockout(rule),
        ...(given ? { actual: given } : {}),
        questionId: rule.questionId,
        label: labels.get(rule.questionId),
      };
    });
}

const CV_STATUS: Record<CvState, QualificationStatus> = {
  read: "met",
  reading: "unknown",
  // Amber, so the employer notices and asks for a readable copy.
  unreadable: "partial",
  none: "unknown",
};

/**
 * Whether the CV was counted. Never a filter: an unreadable file is the
 * file's problem, not a missing qualification. `actual` carries the state and
 * `label` the file name, for the checklist's wording.
 */
function cvCheck(cv?: ApplicantCv | null): QualificationCheck | null {
  if (!cv) return null;
  return {
    key: "cv",
    status: CV_STATUS[cv.state],
    hard: false,
    actual: cv.state,
    ...(cv.fileName ? { label: cv.fileName } : {}),
  };
}

/** Roll the hard checks up: any failure wins, then any unknown. */
export function requirementsStatusOf(checks: readonly QualificationCheck[]): RequirementsStatus {
  const hard = checks.filter((check) => check.hard);
  if (hard.some((check) => check.status === "not_met")) return "not_met";
  if (hard.some((check) => check.status === "unknown")) return "unverified";
  return "met";
}

/** Every requirement the job states, checked against one candidate. */
export function evaluateQualifications(input: QualificationInput): {
  checks: QualificationCheck[];
  status: RequirementsStatus;
} {
  const { seeker, job, relevance } = input;
  const checks = [
    experienceCheck(seeker, job),
    educationCheck(seeker, job),
    ...screeningChecks(input),
    locationCheck(seeker, job, input.locality),
    skillsCheck(relevance),
    industryCheck(input),
    languagesCheck(input.seekerLanguages ?? [], input.jobLanguages ?? []),
    salaryCheck(seeker, job),
    workModeCheck(seeker, job),
    cvCheck(input.cv),
  ].filter((check): check is QualificationCheck => check !== null);
  return { checks, status: requirementsStatusOf(checks) };
}
