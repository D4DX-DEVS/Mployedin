/**
 * @jest-environment node
 */
import fs from "fs";
import path from "path";
import {
  MEMBER_ROUTE_FUNCTIONS,
  MEMBER_ALWAYS_ALLOWED,
  memberCanAccessPath,
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

  it("allows /api/employers/me even for a member holding none of the granted functions", () => {
    const noFunctions = computeEffectivePermissions(["viewer"]);
    expect(memberCanAccessPath("/api/employers/me", noFunctions)).toBe(true);
  });
});
