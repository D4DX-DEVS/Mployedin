/**
 * What the employer subscription page may call "included".
 *
 * The page used to hard-code the first three features as included whenever the
 * feature-gate map had no verdict — and the gate endpoint currently returns an
 * empty map (payment gateway not wired), so every plan looked like it included
 * job posting, applicant tracking and team seats while every toggle looked
 * locked. Derive the answer from the plan's own limits instead; a live gate
 * verdict, when present, still wins.
 */

export type EmployerFeatureKey =
  | "jobPosting"
  | "applicantTracking"
  | "teamCollaboration"
  | "dataExport"
  | "analytics"
  | "commTemplates"
  | "scorecards"
  | "prioritySupport";

type GateMap = Record<string, { allowed: boolean }> | undefined;
type PlanLimits = Record<string, unknown> | undefined;

/** -1 means unlimited; any positive cap means the feature exists on the plan. */
function numericAllowed(max: unknown): boolean {
  return typeof max === "number" && (max === -1 || max > 0);
}

export function deriveEmployerFeatureAccess(
  limits: PlanLimits,
  features: GateMap,
): Record<EmployerFeatureKey, boolean> {
  const l = limits ?? {};
  const f = features ?? {};
  const gate = (key: string, fallback: boolean): boolean => f[key]?.allowed ?? fallback;

  return {
    jobPosting: gate("activeJobs", numericAllowed(l.maxActiveJobs)),
    applicantTracking: gate("applicationsViewed", numericAllowed(l.maxApplicationsViewPerMonth)),
    teamCollaboration: gate("teamMembers", numericAllowed(l.maxTeamMembers)),
    dataExport: gate("dataExport", l.dataExport === true),
    analytics: typeof l.analyticsLevel === "string" && l.analyticsLevel !== "none",
    commTemplates: gate("commTemplates", l.commTemplates === true),
    scorecards: gate("scorecardEvaluations", l.scorecardEvaluations === true),
    prioritySupport: gate("prioritySupport", l.prioritySupport === true),
  };
}
