/**
 * @jest-environment node
 */
import { resolveCompanyContext } from "@/lib/auth/companyContext";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));

const findOneEmployer = jest.fn();
const findByIdEmployer = jest.fn();
const findOneCompanyUser = jest.fn();

jest.mock("@/models/Employer", () => ({
  Employer: {
    findOne: (...a: unknown[]) => findOneEmployer(...a),
    findById: (...a: unknown[]) => findByIdEmployer(...a),
  },
}));

jest.mock("@/lib/employers/company-membership", () => ({
  ensureEmployerOwnerMembership: jest.fn().mockResolvedValue({ companyRole: "owner" }),
}));

// NOTE: the brief's draft mocked @/models/CompanyUser via `jest.doMock` inside
// `beforeEach`. That doesn't work here: this file's top-level
// `import { resolveCompanyContext } from "@/lib/auth/companyContext"` requires
// (and Node module-caches) @/models/CompanyUser once, at file-evaluation time —
// before any `beforeEach` runs. `jest.doMock` only redirects requires that
// happen *after* it's called, so companyContext.ts kept the real mongoose
// model. Confirmed empirically: with the doMock version, 4/5 tests failed with
// `CastError: Cast to ObjectId failed for value "memberUser" ... model
// "CompanyUser"` — the real model rejecting our plain string ids. A static
// top-level `jest.mock`, like the one already used for `Employer` below, is
// required instead. `computeEffectivePermissions` is pulled from the real
// module via `jest.requireActual` (partial mock) since resolveCompanyContext
// needs the real permission-merging behavior, not a stub.
jest.mock("@/models/CompanyUser", () => ({
  CompanyUser: { findOne: (...a: unknown[]) => findOneCompanyUser(...a) },
  computeEffectivePermissions: jest.requireActual("@/models/CompanyUser").computeEffectivePermissions,
}));

const lean = (value: unknown) => ({ select: () => ({ lean: async () => value }), lean: async () => value });

describe("resolveCompanyContext", () => {
  beforeEach(() => {
    findOneEmployer.mockReset();
    findByIdEmployer.mockReset();
    findOneCompanyUser.mockReset();
  });

  it("treats a user who owns an Employer as the owner of their own company", async () => {
    findOneEmployer.mockReturnValue(lean({ _id: "company1", companyEmail: "a@b.com" }));
    const ctx = await resolveCompanyContext("user1");
    expect(ctx).toMatchObject({
      companyId: "company1",
      companyOwnerUserId: "user1",
      companyUserRole: "owner",
    });
    expect(ctx?.permissions.canManageTeam).toBe(true);
  });

  it("resolves an active membership to the owner's user id", async () => {
    findOneEmployer.mockReturnValue(lean(null));
    findOneCompanyUser.mockReturnValue(
      lean({
        companyId: "company9",
        companyRole: "hiring_manager",
        companyRoles: ["hiring_manager"],
        permissionOverrides: { canRunScreening: true },
        jobAccess: [],
      })
    );
    findByIdEmployer.mockReturnValue(lean({ userId: "ownerUser" }));

    const ctx = await resolveCompanyContext("memberUser");
    expect(ctx).toMatchObject({
      companyId: "company9",
      companyOwnerUserId: "ownerUser",
      companyUserRole: "hiring_manager",
    });
    expect(ctx?.permissions.canRunScreening).toBe(true);
    expect(ctx?.permissions.canManageTeam).toBe(false);
  });

  it("queries membership filtered to active status", async () => {
    findOneEmployer.mockReturnValue(lean(null));
    findOneCompanyUser.mockReturnValue(lean(null));
    await resolveCompanyContext("memberUser");
    expect(findOneCompanyUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "memberUser", status: "active" })
    );
  });

  it("returns null when there is neither an Employer nor a membership", async () => {
    findOneEmployer.mockReturnValue(lean(null));
    findOneCompanyUser.mockReturnValue(lean(null));
    expect(await resolveCompanyContext("stranger")).toBeNull();
  });

  it("returns null when the membership points at a company with no owner", async () => {
    findOneEmployer.mockReturnValue(lean(null));
    findOneCompanyUser.mockReturnValue(
      lean({ companyId: "ghost", companyRole: "viewer", companyRoles: ["viewer"], jobAccess: [] })
    );
    findByIdEmployer.mockReturnValue(lean(null));
    expect(await resolveCompanyContext("memberUser")).toBeNull();
  });
});
