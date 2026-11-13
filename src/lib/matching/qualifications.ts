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
import { expectationInJobCurrency, monthlySalaryMidpoint } from "@/lib/matching/eligibility";
import type { RelevanceBreakdown } from "@/lib/matching/relevance";
import { SALARY_TOLERANCE } from "@/lib/matching/constants";
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
  | "credential"
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

/*
 * Experience, education, licences and languages read the same evaluation the
 * scores and the requirement report use (requirementParts.ts), so the
 * checklist, the report and both scores cannot disagree. A must-have is hard;
 * a nice-to-have is shown only.
 */

function experienceCheck(seeker: SeekerProfile, job: JobProfile, relevance: RelevanceBreakdown): QualificationCheck | null {
  const ex = relevance.evaluation?.experience;
  if (!(job.minExp > 0)) {
    // No minimum to meet, but the employer still sees that nothing was stated
    // (the breakdown reads "Not provided"); soft, so it never blocks anyone.
    return seeker.experienceKnown === false ? { key: "experience", status: "unknown", hard: false } : null;
  }
  if (!ex) {
    // A breakdown built without the requirement evaluation: career length only.
    const base = { key: "experience" as const, hard: true, required: fmtYears(job.minExp) };
    if (seeker.experienceKnown === false) return { ...base, status: "unknown" };
    const years = seeker.experienceYears;
    const status: QualificationStatus = years >= job.minExp ? "met" : years >= job.minExp - 1 ? "partial" : "not_met";
    return { ...base, status, actual: fmtYears(years) };
  }
  const base = {
    key: "experience" as const,
    hard: ex.asked.importance === "must",
    required: fmtYears(job.minExp),
    ...(ex.asked.subjectSource !== "title" && ex.asked.subject ? { label: ex.asked.subject } : {}),
  };
  if (!ex.known) return { ...base, status: "unknown" };
  const shown = ex.asked.subjectSource !== "title" && ex.relevantYears !== null ? ex.relevantYears : ex.totalYears;
  // Met only by a guessed end date: show the years that are certain.
  return { ...base, status: ex.status, actual: fmtYears(ex.confirmedYears ?? shown) };
}

function educationCheck(seeker: SeekerProfile, job: JobProfile, relevance: RelevanceBreakdown): QualificationCheck | null {
  if (!relevance.evaluation) {
    // A breakdown built without the requirement evaluation: levels only.
    const required = job.requiredEducationLevel ?? 0;
    if (required <= 0) return null;
    const held = seeker.educationLevel ?? 0;
    const base = { key: "education" as const, hard: true, required: String(required) };
    if (held <= 0) return { ...base, status: "unknown" };
    const status: QualificationStatus = held >= required ? "met" : required - held === 1 ? "partial" : "not_met";
    return { ...base, status, actual: String(held) };
  }
  const ed = relevance.evaluation.education;
  if (!ed) return null;
  const base = { key: "education" as const, hard: ed.asked.importance === "must", required: String(ed.asked.level) };
  if (ed.held <= 0) return { ...base, status: "unknown" };
  return { ...base, status: ed.status, actual: String(ed.held) };
}

function credentialChecks(relevance: RelevanceBreakdown): QualificationCheck[] {
  return (relevance.evaluation?.credentials ?? []).map((c) => ({
    key: "credential" as const,
    status: c.status,
    hard: c.asked.importance === "must",
    required: c.asked.name,
    label: c.asked.name,
    ...(c.quote ? { actual: c.quote } : {}),
  }));
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
  const expected = expectationInJobCurrency(seeker, job);
  if (expected == null) return null;
  const seekerCur = (seeker.salaryCurrency ?? "").toUpperCase().trim();
  const jobCur = (job.salaryCurrency ?? "").toUpperCase().trim();
  const status: QualificationStatus =
    expected <= mid ? "met" : mid >= expected * SALARY_TOLERANCE ? "partial" : "not_met";
  const cur = jobCur || seekerCur;
  const money = (n: number, c = cur) => `${c ? `${c} ` : ""}${Math.round(n)}`;
  // Converted: show the figure in the job's currency and what the seeker typed.
  const converted = Boolean(seekerCur && jobCur && seekerCur !== jobCur);
  const actual = converted
    ? `≈ ${money(expected)} (${money(seeker.salaryExpectation, seekerCur)})`
    : money(expected);
  return { key: "salary", status, hard: false, required: money(mid), actual };
}

function workModeCheck(seeker: SeekerProfile, job: JobProfile): QualificationCheck | null {
  const pref = (seeker.jobType ?? "").toLowerCase().trim();
  const mode = (job.workMode ?? "").toLowerCase().trim();
  if (!pref || pref === "any" || !mode) return null;
  const penalty = workModePenalty(pref, mode);
  const status: QualificationStatus = penalty === 0 ? "met" : penalty >= 15 ? "not_met" : "partial";
  return { key: "work_mode", status, hard: false, required: mode, actual: pref };
}

function languagesCheck(
  relevance: RelevanceBreakdown,
  seekerLanguages: readonly string[],
  jobLanguages: readonly string[],
): QualificationCheck | null {
  const lang = relevance.evaluation?.languages;
  if (lang) {
    const base = { key: "languages" as const, hard: lang.importance === "must", required: [...lang.have, ...lang.missing].join(", ") };
    if (lang.status === "unknown") return { ...base, status: "unknown" };
    return { ...base, status: lang.status, actual: lang.have.join(", ") };
  }
  // Languages stored on the job but never confirmed on the form (D14): shown
  // to the employer, never scored, never a must-have.
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
    experienceCheck(seeker, job, relevance),
    educationCheck(seeker, job, relevance),
    ...credentialChecks(relevance),
    ...screeningChecks(input),
    locationCheck(seeker, job, input.locality),
    skillsCheck(relevance),
    industryCheck(input),
    languagesCheck(relevance, input.seekerLanguages ?? [], input.jobLanguages ?? []),
    salaryCheck(seeker, job),
    workModeCheck(seeker, job),
    cvCheck(input.cv),
  ].filter((check): check is QualificationCheck => check !== null);
  return { checks, status: requirementsStatusOf(checks) };
}
