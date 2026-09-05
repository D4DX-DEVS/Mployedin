import { deriveEmployerFeatureAccess } from "@/lib/subscription/employerFeatureList";

describe("deriveEmployerFeatureAccess — plan limits decide what the subscription page shows", () => {
  it("marks numeric features included when the plan allows them and locked when the limit is 0", () => {
    const access = deriveEmployerFeatureAccess(
      { maxActiveJobs: 5, maxApplicationsViewPerMonth: -1, maxTeamMembers: 0 },
      {},
    );
    expect(access.jobPosting).toBe(true);
    expect(access.applicantTracking).toBe(true);
    expect(access.teamCollaboration).toBe(false);
  });

  it("does not assume anything is included when the plan has no limits at all", () => {
    const access = deriveEmployerFeatureAccess(undefined, {});
    expect(Object.values(access).every((v) => v === false)).toBe(true);
  });

  it("reads boolean toggles and the analytics level from the plan", () => {
    const access = deriveEmployerFeatureAccess(
      { dataExport: true, commTemplates: false, scorecardEvaluations: true, prioritySupport: false, analyticsLevel: "advanced" },
      {},
    );
    expect(access.dataExport).toBe(true);
    expect(access.commTemplates).toBe(false);
    expect(access.scorecards).toBe(true);
    expect(access.prioritySupport).toBe(false);
    expect(access.analytics).toBe(true);
  });

  it("lets a live feature-gate verdict override the static plan limits", () => {
    const access = deriveEmployerFeatureAccess(
      { maxActiveJobs: 5, dataExport: true, analyticsLevel: "none" },
      { activeJobs: { allowed: false }, dataExport: { allowed: false } },
    );
    expect(access.jobPosting).toBe(false);
    expect(access.dataExport).toBe(false);
    expect(access.analytics).toBe(false);
  });
});
