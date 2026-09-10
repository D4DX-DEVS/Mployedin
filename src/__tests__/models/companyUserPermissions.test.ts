/**
 * @jest-environment node
 */
import {
  COMPANY_FUNCTIONS,
  computeEffectivePermissions,
  getDefaultPermissions,
} from "@/models/CompanyUser";

describe("company permissions", () => {
  it("exposes eleven grantable functions in display order", () => {
    expect(COMPANY_FUNCTIONS).toEqual([
      "canCreateJobs",
      "canReviewApplicants",
      "canScheduleInterviews",
      "canSendOffers",
      "canOnboardPlacements",
      "canRunScreening",
      "canManageTalentPools",
      "canManageBilling",
      "canViewAnalytics",
      "canManageCompanySettings",
      "canManageTeam",
    ]);
  });

  it("gives an owner every flag", () => {
    const perms = getDefaultPermissions("owner");
    for (const flag of COMPANY_FUNCTIONS) {
      expect(perms[flag]).toBe(true);
    }
  });

  it("gives a viewer none of the grantable flags", () => {
    const perms = getDefaultPermissions("viewer");
    for (const flag of COMPANY_FUNCTIONS) {
      expect(perms[flag]).toBe(false);
    }
  });

  it("unions permissions across several roles", () => {
    const perms = computeEffectivePermissions(["hiring_manager", "accounting"]);
    expect(perms.canCreateJobs).toBe(true);
    expect(perms.canManageBilling).toBe(true);
    expect(perms.canManageTeam).toBe(false);
  });

  it("lets an override switch a role default off", () => {
    const perms = computeEffectivePermissions(["hiring_manager"], { canSendOffers: false });
    expect(perms.canSendOffers).toBe(false);
    expect(perms.canCreateJobs).toBe(true);
  });

  it("lets an override switch a missing flag on", () => {
    const perms = computeEffectivePermissions(["viewer"], { canRunScreening: true });
    expect(perms.canRunScreening).toBe(true);
    expect(perms.canCreateJobs).toBe(false);
  });

  it("ignores an override naming a flag that does not exist", () => {
    const perms = computeEffectivePermissions(
      ["viewer"],
      { notAFlag: true } as unknown as Partial<Record<string, boolean>>
    );
    expect(perms).toEqual(getDefaultPermissions("viewer"));
  });

  it("gives a hiring manager the hiring functions and nothing else", () => {
    const perms = getDefaultPermissions("hiring_manager");
    expect(perms.canCreateJobs).toBe(true);
    expect(perms.canReviewApplicants).toBe(true);
    expect(perms.canScheduleInterviews).toBe(true);
    expect(perms.canSendOffers).toBe(true);
    expect(perms.canOnboardPlacements).toBe(true);
    expect(perms.canRunScreening).toBe(true);
    expect(perms.canManageBilling).toBe(false);
    expect(perms.canManageCompanySettings).toBe(false);
    expect(perms.canManageTeam).toBe(false);
  });

  it("ignores an override naming an inherited Object property", () => {
    const perms = computeEffectivePermissions(
      ["viewer"],
      { constructor: true, toString: true, hasOwnProperty: true } as unknown as Partial<Record<string, boolean>>
    );
    expect(perms).toEqual(getDefaultPermissions("viewer"));
    expect(Object.prototype.hasOwnProperty.call(perms, "constructor")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(perms, "toString")).toBe(false);
  });
});
