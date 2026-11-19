/**
 * @jest-environment node
 */
import fs from "fs";
import path from "path";
import {
  MEMBER_ROUTE_FUNCTIONS,
  MEMBER_ALWAYS_ALLOWED,
  memberCanAccessPath,
  mayOfferCvExport,
  mayOpenTalentPoolCv,
} from "@/lib/permissions/companyFunctions";
import { computeEffectivePermissions } from "@/models/CompanyUser";

const API_ROOT = path.join(process.cwd(), "src", "app", "api");

describe("member route map", () => {
  it("names only real API directories", () => {
    for (const [prefix] of MEMBER_ROUTE_FUNCTIONS) {
      const dir = path.join(API_ROOT, prefix.replace(/^\/api\//, ""));
      expect({ prefix, exists: fs.existsSync(dir) }).toEqual({ prefix, exists: true });
    }
  });

  it("has no prefix shadowing another with a different flag", () => {
    for (const [a, flagA] of MEMBER_ROUTE_FUNCTIONS) {
      for (const [b, flagB] of MEMBER_ROUTE_FUNCTIONS) {
        if (a === b) continue;
        if (b.startsWith(a + "/") && flagA !== flagB) {
          // longer prefix must be listed before the shorter one so it wins
          const idxA = MEMBER_ROUTE_FUNCTIONS.findIndex(([p]) => p === a);
          const idxB = MEMBER_ROUTE_FUNCTIONS.findIndex(([p]) => p === b);
          expect({ pair: [b, a], bBeforeA: idxB < idxA }).toEqual({ pair: [b, a], bBeforeA: true });
        }
      }
    }
  });
});

describe("memberCanAccessPath", () => {
  const screeningOnly = computeEffectivePermissions(["viewer"], { canRunScreening: true });

  it("allows a mapped route when the member holds the flag", () => {
    expect(memberCanAccessPath("/api/employer/background-checks", screeningOnly)).toBe(true);
  });

  it("allows a nested path under a mapped prefix", () => {
    expect(memberCanAccessPath("/api/employer/background-checks/abc123", screeningOnly)).toBe(true);
  });

  it("refuses a mapped route when the member lacks the flag", () => {
    expect(memberCanAccessPath("/api/invoices", screeningOnly)).toBe(false);
  });

  it("refuses an unmapped route by default", () => {
    expect(memberCanAccessPath("/api/employer/some-future-page", screeningOnly)).toBe(false);
  });

  it("allows the universal routes regardless of grant", () => {
    for (const prefix of MEMBER_ALWAYS_ALLOWED) {
      expect({ prefix, ok: memberCanAccessPath(prefix, screeningOnly) }).toEqual({ prefix, ok: true });
    }
  });

  it("gives an owner-shaped permission set access to every mapped route", () => {
    const ownerPerms = computeEffectivePermissions(["owner"]);
    for (const [prefix] of MEMBER_ROUTE_FUNCTIONS) {
      expect({ prefix, ok: memberCanAccessPath(prefix, ownerPerms) }).toEqual({ prefix, ok: true });
    }
  });

  it("resolves /api/employers/team to canManageTeam, not the canManageCompanySettings that gates the shorter /api/employers prefix", () => {
    const teamOnly = computeEffectivePermissions(["viewer"], { canManageTeam: true });
    expect(memberCanAccessPath("/api/employers/team", teamOnly)).toBe(true);

    const settingsOnly = computeEffectivePermissions(["viewer"], { canManageCompanySettings: true });
    expect(memberCanAccessPath("/api/employers/team", settingsOnly)).toBe(false);
  });

  it("lets an applicant reviewer use AI search on the applications list, and nobody else", () => {
    const reviewer = computeEffectivePermissions(["viewer"], { canReviewApplicants: true });
    expect(memberCanAccessPath("/api/ai/application-search-filters", reviewer)).toBe(true);
    expect(memberCanAccessPath("/api/ai/application-search-filters", screeningOnly)).toBe(false);
    // The prefix is this one endpoint, not every AI route.
    expect(memberCanAccessPath("/api/ai/copilot", reviewer)).toBe(false);
  });

  it("lets a colleague use the bulk CV export only with the candidate-pool function, like the candidate CVs it reads", () => {
    const poolManager = computeEffectivePermissions(["viewer"], { canManageTalentPools: true });
    expect(memberCanAccessPath("/api/cv-export/manifest", poolManager)).toBe(true);

    // Not mapped means refused: none of the other functions reaches it.
    const others = computeEffectivePermissions(["viewer"], {
      canManageCompanySettings: true,
      canRunScreening: true,
    });
    expect(memberCanAccessPath("/api/cv-export/manifest", others)).toBe(false);
    expect(memberCanAccessPath("/api/cv-export/manifest", computeEffectivePermissions(["viewer"]))).toBe(false);

    // The same function the candidate CV route it fetches files through is gated on.
    const cvFunction = MEMBER_ROUTE_FUNCTIONS.find(([prefix]) => prefix === "/api/employers/candidates")?.[1];
    expect(MEMBER_ROUTE_FUNCTIONS.find(([prefix]) => prefix === "/api/cv-export")?.[1]).toBe(cvFunction);
  });

  describe("an applicant's CV for a colleague who reviews applicants (not the candidate-pool function)", () => {
    const reviewer = computeEffectivePermissions(["viewer"], { canReviewApplicants: true });
    const poolManager = computeEffectivePermissions(["viewer"], { canManageTalentPools: true });
    const cv = "/api/employers/candidates/650000000000000000000330/cv";
    const withApp = { method: "GET", searchParams: new URLSearchParams("applicationId=650000000000000000000310") };

    it("opens the candidate CV route only with an applicationId", () => {
      expect(memberCanAccessPath(cv, reviewer, withApp)).toBe(true);
      expect(memberCanAccessPath(cv, reviewer, { method: "GET", searchParams: new URLSearchParams("kind=built&applicationId=x") })).toBe(true);
    });

    it("holds for the default hiring_manager role: applicant CVs yes, talent-pool CVs no", () => {
      const hiringManager = computeEffectivePermissions(["hiring_manager"]);
      expect(memberCanAccessPath(cv, hiringManager, withApp)).toBe(true);
      expect(memberCanAccessPath(cv, hiringManager, { method: "GET", searchParams: new URLSearchParams() })).toBe(false);
      expect(memberCanAccessPath("/api/cv-export/manifest", hiringManager, { method: "POST" })).toBe(true);
    });

    it("keeps the talent-pool view (no applicationId, empty id, or no request info) on the pool function", () => {
      expect(memberCanAccessPath(cv, reviewer)).toBe(false);
      expect(memberCanAccessPath(cv, reviewer, { method: "GET", searchParams: new URLSearchParams("") })).toBe(false);
      expect(memberCanAccessPath(cv, reviewer, { method: "GET", searchParams: new URLSearchParams("applicationId=") })).toBe(false);
      expect(memberCanAccessPath(cv, reviewer, { method: "GET", searchParams: new URLSearchParams("kind=built") })).toBe(false);
      expect(memberCanAccessPath(cv, poolManager)).toBe(true);
    });

    it("widens nothing else: other candidate routes, other methods, and members without the review function", () => {
      expect(memberCanAccessPath("/api/employers/candidates/650000000000000000000330", reviewer, withApp)).toBe(false);
      expect(memberCanAccessPath("/api/employers/candidates", reviewer, withApp)).toBe(false);
      expect(memberCanAccessPath(`${cv}/extra`, reviewer, withApp)).toBe(false);
      expect(memberCanAccessPath(cv, reviewer, { ...withApp, method: "POST" })).toBe(false);
      const screeningOnly = computeEffectivePermissions(["viewer"], { canRunScreening: true });
      expect(memberCanAccessPath(cv, screeningOnly, withApp)).toBe(false);
    });

    it("lets a reviewer reach the export manifest by POST only (the route checks every item names an application)", () => {
      expect(memberCanAccessPath("/api/cv-export/manifest", reviewer, { method: "POST" })).toBe(true);
      expect(memberCanAccessPath("/api/cv-export/manifest", reviewer, { method: "GET" })).toBe(false);
      expect(memberCanAccessPath("/api/cv-export/manifest", reviewer)).toBe(false);
      expect(memberCanAccessPath("/api/cv-export/other", reviewer, { method: "POST" })).toBe(false);
    });
  });

  it("allows /api/employers/me even for a member holding none of the granted functions", () => {
    const noFunctions = computeEffectivePermissions(["viewer"]);
    expect(memberCanAccessPath("/api/employers/me", noFunctions)).toBe(true);
  });
});

describe("mayOfferCvExport", () => {
  const colleague = (overrides: Record<string, boolean>) => ({
    id: "u2",
    companyOwnerUserId: "u1",
    companyPermissions: computeEffectivePermissions(["viewer"], overrides),
  });

  it("is on for an owner and for anyone who is not a colleague", () => {
    expect(mayOfferCvExport({ id: "u1", companyOwnerUserId: "u1" })).toBe(true);
    expect(mayOfferCvExport({ id: "u1" })).toBe(true);
    expect(mayOfferCvExport(undefined)).toBe(true);
  });

  it("is on for a colleague who reviews applicants or manages talent pools", () => {
    expect(mayOfferCvExport(colleague({ canReviewApplicants: true }))).toBe(true);
    expect(mayOfferCvExport(colleague({ canManageTalentPools: true }))).toBe(true);
  });

  it("is off for a colleague with neither, or with no permissions in the session", () => {
    expect(mayOfferCvExport(colleague({ canRunScreening: true }))).toBe(false);
    expect(mayOfferCvExport({ id: "u2", companyOwnerUserId: "u1" })).toBe(false);
  });
});

describe("mayOpenTalentPoolCv", () => {
  const colleague = (overrides: Record<string, boolean>) => ({
    id: "u2",
    companyOwnerUserId: "u1",
    companyPermissions: computeEffectivePermissions(["viewer"], overrides),
  });

  it("is on for an owner and for anyone who is not a colleague", () => {
    expect(mayOpenTalentPoolCv({ id: "u1", companyOwnerUserId: "u1" })).toBe(true);
    expect(mayOpenTalentPoolCv({ id: "u1" })).toBe(true);
    expect(mayOpenTalentPoolCv(undefined)).toBe(true);
  });

  it("is on for a colleague who manages talent pools", () => {
    expect(mayOpenTalentPoolCv(colleague({ canManageTalentPools: true }))).toBe(true);
  });

  it("is off for a colleague who only reviews applicants (the CV route needs an application for them), or has no permissions in the session", () => {
    expect(mayOpenTalentPoolCv(colleague({ canReviewApplicants: true }))).toBe(false);
    expect(mayOpenTalentPoolCv({ id: "u2", companyOwnerUserId: "u1" })).toBe(false);
  });
});
