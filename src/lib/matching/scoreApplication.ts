/**
 * Loads what one applicant's ATS score needs and runs it.
 *
 * Every writer of an application's score goes through here — the screening
 * worker on apply, the employer's "Score" / "Score all", and the re-score that
 * follows a job edit — so a candidate's score, checklist and skills lists are
 * always produced together from the same inputs.
 */

import Application from "@/models/Application";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import { Employer } from "@/models/Employer";
import { SEEKER_MATCH_FIELDS, jobProfileFromDoc } from "@/lib/matchScore";
import { JOB_MATCH_FIELDS } from "@/lib/matching/constants";
import { effectiveSeekerProfile } from "@/lib/effectiveSeekerProfile";
import { resolveEngineOptions, scoreOnePair, type EngineOptions } from "@/lib/matching/seekerMatches";
import { customMatchingWeights } from "@/lib/ai/matchingWeights";
import { buildApplicantMatch, type ApplicantMatch } from "@/lib/matching/applicantScore";
import type { KnockoutRule } from "@/lib/matching/knockouts";
import { industryEvidenceOf, industryFit, jobIndustriesOf } from "@/lib/matching/industry";
import { resolveLocality } from "@/lib/matching/locality.server";
import { sanitizeAIInput, sanitizeAiList } from "@/lib/ai/sanitize";
import { mergeCvIntoSeeker, type ApplicantCv } from "@/lib/cv/parsedCv";
import { applicantCvsFor } from "@/lib/cv/cvDocuments";

/** Every Job path the applicant score reads. */
export const APPLICANT_JOB_FIELDS =
  `${JOB_MATCH_FIELDS} description tags workflow screeningQuestions screeningKnockouts matchingWeights`;

/** Every JobSeeker path the applicant score reads. */
export const APPLICANT_SEEKER_FIELDS = `${SEEKER_MATCH_FIELDS} userId languages industry cv.originalUrl`;

type Lean = Record<string, unknown>;

interface ScreeningAnswer {
  questionId: string;
  answer: unknown;
}

export interface ApplicantScoreInput {
  job: Lean;
  seeker: Lean;
  /** Employer.matchingWeights — the company default the job may override. */
  employerWeights?: unknown;
  /** Employer.industry — one source of the job's industry. */
  employerIndustry?: string | null;
  /** The application's screening answers; absent for a talent-pool candidate. */
  answers?: readonly ScreeningAnswer[];
  /** The CV behind this score (applicantCvFor); its reading is added to the profile. */
  cv?: ApplicantCv | null;
  engine?: EngineOptions;
}

/** Score one seeker against one job, employer side. */
export async function computeApplicantMatch(input: ApplicantScoreInput): Promise<ApplicantMatch> {
  const { job } = input;
  // Profile plus what the CV says — every part below reads this one seeker.
  const seeker = mergeCvIntoSeeker(input.seeker, input.cv);
  const seekerProfile = await effectiveSeekerProfile(
    String(seeker.userId ?? ""),
    seeker as Parameters<typeof effectiveSeekerProfile>[1],
  );
  const jobProfile = jobProfileFromDoc(job as Parameters<typeof jobProfileFromDoc>[0]);
  const [pair, locality] = await Promise.all([
    scoreOnePair(seekerProfile, job, input.engine),
    resolveLocality(job as Parameters<typeof resolveLocality>[0], seeker as Parameters<typeof resolveLocality>[1]),
  ]);
  const requirements = (job.requirements ?? {}) as { languages?: string[] };
  const languages = (seeker.languages as Array<{ language?: string }> | undefined) ?? [];
  const jobIndustries = jobIndustriesOf({
    description: job.description as string | undefined,
    tags: job.tags as string[] | undefined,
    skills: jobProfile.skills,
    employerIndustry: input.employerIndustry,
  });

  return buildApplicantMatch({
    pair,
    seeker: seekerProfile,
    job: jobProfile,
    weights: customMatchingWeights(job.matchingWeights, input.employerWeights),
    seekerLanguages: languages.map((l) => l.language ?? "").filter(Boolean),
    jobLanguages: requirements.languages ?? [],
    knockouts: (job.screeningKnockouts as KnockoutRule[] | undefined) ?? [],
    questions: (job.screeningQuestions as Array<{ id: string; label: string }> | undefined) ?? [],
    answers: input.answers,
    jobIndustries,
    industry: industryFit(jobIndustries, industryEvidenceOf(seeker as Parameters<typeof industryEvidenceOf>[0])),
    locality,
    cv: input.cv ?? null,
  });
}

/** The Application fields a score writes — one $set, so no field is ever left behind. */
export function applicantMatchUpdate(match: ApplicantMatch): Record<string, unknown> {
  return {
    aiMatchScore: match.aiMatchScore,
    seekerMatchScore: match.seekerMatchScore,
    scoredVia: "engine",
    // Replaces the whole subdocument, so an older scorer's location / salary
    // parts cannot linger beside the engine's.
    matchBreakdown: match.matchBreakdown,
    matchedSkills: match.matchedSkills,
    missingSkills: match.missingSkills,
    qualifications: match.qualifications,
    requirementsStatus: match.requirementsStatus,
    weightsApplied: match.weightsApplied,
    scoredAt: new Date(),
  };
}

/**
 * The deterministic facts, phrased for the narrative prompt, so the model's
 * strengths and gaps agree with the checklist beside them instead of
 * re-deriving (and contradicting) them from the raw profile.
 */
export function describeMatchForPrompt(match: ApplicantMatch): string {
  const failed = match.qualifications
    .filter((check) => check.status === "not_met")
    .map((check) =>
      sanitizeAIInput(
        `${check.label ?? check.key}: asks ${check.required ?? "?"}, candidate ${check.actual ?? "not stated"}`,
        160,
      ),
    );
  return [
    `Skills the candidate has: ${sanitizeAiList(match.matchedSkills, 12, 60)}`,
    `Required skills with no evidence: ${sanitizeAiList(match.missingSkills, 12, 60)}`,
    `Requirements not met: ${failed.length ? failed.join("; ") : "none"}`,
  ].join("\n");
}

export interface ScoredApplicant {
  applicationId: string;
  match: ApplicantMatch;
}

/**
 * Score a batch of one job's applications: the job, its employer and the
 * engine settings load once, the seekers in one query. Applications whose
 * seeker is gone are skipped.
 */
export async function scoreApplicationsOfJob(
  jobId: string,
  applicationIds: readonly string[],
): Promise<ScoredApplicant[]> {
  const job = (await Job.findById(jobId).select(`${APPLICANT_JOB_FIELDS} employerId`).lean()) as Lean | null;
  if (!job || applicationIds.length === 0) return [];

  const [employer, applications, engine] = await Promise.all([
    job.employerId ? Employer.findById(job.employerId).select("matchingWeights industry").lean() : null,
    Application.find({ _id: { $in: applicationIds }, jobId })
      .select("jobSeekerId screeningAnswers documents")
      .lean(),
    resolveEngineOptions(),
  ]);
  const seekers = await JobSeeker.find({
    _id: { $in: (applications as Lean[]).map((a) => a.jobSeekerId) },
  })
    .select(APPLICANT_SEEKER_FIELDS)
    .lean();
  const seekerById = new Map((seekers as Lean[]).map((s) => [String(s._id), s]));
  const employerWeights = (employer as { matchingWeights?: unknown } | null)?.matchingWeights;
  const employerIndustry = (employer as { industry?: string } | null)?.industry;

  const scorable = (applications as Lean[]).flatMap((application) => {
    const seeker = seekerById.get(String(application.jobSeekerId));
    return seeker ? [{ application, seeker }] : [];
  });
  // The CVs behind the scores, in one query for the whole batch.
  const cvs = await applicantCvsFor(
    scorable.map(({ application, seeker }) => ({
      jobSeekerId: String(application.jobSeekerId),
      documents: application.documents as Array<{ url?: string; type?: string; name?: string }> | undefined,
      profileCvUrl: (seeker.cv as { originalUrl?: string } | undefined)?.originalUrl,
    })),
  );

  const out: ScoredApplicant[] = [];
  for (const [i, { application, seeker }] of scorable.entries()) {
    const cv = cvs[i];
    const match = await computeApplicantMatch({
      job,
      seeker,
      employerWeights,
      employerIndustry,
      answers: (application.screeningAnswers as ScreeningAnswer[] | undefined) ?? [],
      cv,
      engine,
    });
    out.push({ applicationId: String(application._id), match });
  }
  return out;
}
