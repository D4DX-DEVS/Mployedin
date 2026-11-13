import { isCompanyHidden, maskJobEmployer } from "@/lib/jobs/companyDisclosure";

/**
 * The candidate's view of their own application.
 *
 * An application document carries the employer's working notes about the
 * candidate as well as the candidate's own data. These keys are recruiter-only:
 * the notes thread, agent/employer notes, the rejection reason, the AI
 * strengths/gaps the employer reads, and the engagement ranking. The list and
 * detail routes both use this one list so they cannot drift apart again (the
 * list once excluded `employerNotes` but shipped the `notes` thread).
 */
export const SEEKER_HIDDEN_APPLICATION_FIELDS = [
  "notes",
  "employerNotes",
  "agentNotes",
  "rejectionReason",
  "matchStrengths",
  "matchGaps",
  "matchBreakdown",
  "qualifications",
  "requirementsStatus",
  "requirementReport",
  "mustHaveRank",
  "missingSkills",
  "weightsApplied",
  "behaviorSignals",
  "behaviorScore",
] as const;

/**
 * Which staff member reviewed an automatic rejection is the employer's
 * business; that a person did (reviewedAt) is the candidate's.
 */
const SEEKER_HIDDEN_NESTED_FIELDS = ["automatedDecision.reviewedBy"] as const;

/** Mongoose exclusion projection for a seeker's application query. */
export const SEEKER_APPLICATION_PROJECTION = [...SEEKER_HIDDEN_APPLICATION_FIELDS, ...SEEKER_HIDDEN_NESTED_FIELDS]
  .map((f) => `-${f}`)
  .join(" ");

/**
 * The match figure a seeker sees on their own application, as the fields to
 * lay over the document.
 *
 * `seekerMatchScore` is the engine's number for the pair; `aiMatchScore` is the
 * employer's re-weighted ranking and is never the seeker's to see once the
 * engine number exists. A stored null means the application was scored while
 * the profile stated nothing the score reads, so there is no figure to show: a
 * new account that applied with no CV read "29% match" on its own application.
 * A document from before the field existed keeps what it has.
 */
export function seekerScoreView(app: { seekerMatchScore?: unknown }): { aiMatchScore?: number | undefined } {
  if (app.seekerMatchScore === null) return { aiMatchScore: undefined };
  if (typeof app.seekerMatchScore === "number") return { aiMatchScore: app.seekerMatchScore };
  return {};
}

/**
 * A job posted with the company hidden stays hidden after the candidate
 * applies: the populated job shows "Mployedin" and its mark. The job must be
 * populated with `discloseCompany` for this to apply.
 */
export function maskSeekerApplicationJob<T extends object>(app: T): T {
  const job = (app as Record<string, unknown>).jobId;
  if (!job || typeof job !== "object" || !isCompanyHidden(job as { discloseCompany?: boolean })) return app;
  return { ...app, jobId: maskJobEmployer({ ...(job as Record<string, unknown>) }) } as T;
}

/** Returns a copy of a lean application without the recruiter-only keys. */
export function stripSeekerHiddenFields<T extends object>(app: T): T {
  const copy = { ...maskSeekerApplicationJob(app) } as Record<string, unknown>;
  for (const key of SEEKER_HIDDEN_APPLICATION_FIELDS) delete copy[key];
  if (copy.automatedDecision && typeof copy.automatedDecision === "object") {
    const { reviewedBy: _reviewer, ...decision } = copy.automatedDecision as Record<string, unknown>;
    copy.automatedDecision = decision;
  }
  return copy as T;
}
