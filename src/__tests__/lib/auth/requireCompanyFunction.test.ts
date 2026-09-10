/**
 * @jest-environment node
 */
import { requireCompanyFunction } from "@/lib/auth/requireCompanyFunction";
import { computeEffectivePermissions } from "@/models/CompanyUser";

const notFound = jest.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
jest.mock("next/navigation", () => ({ notFound: () => notFound() }));

// This repo does not use next-auth's getServerSession(authOptions) — it
// exports an `auth()` helper from @/lib/auth/config (see requireRole.ts for
// the canonical call site). Mock that export directly.
const auth = jest.fn();
jest.mock("@/lib/auth/config", () => ({ auth: () => auth() }));

describe("requireCompanyFunction", () => {
  beforeEach(() => {
    notFound.mockClear();
    auth.mockReset();
  });

  it("returns when there is no session", async () => {
    auth.mockResolvedValue(null);
    await expect(requireCompanyFunction("canManageTeam")).resolves.toBeUndefined();
    expect(notFound).not.toHaveBeenCalled();
  });

  it("returns for a non-employer role (e.g. an agent in tenant view)", async () => {
    auth.mockResolvedValue({
      user: { id: "u1", role: "agent", companyOwnerUserId: "someone-elses-company" },
    });
    await expect(requireCompanyFunction("canManageTeam")).resolves.toBeUndefined();
    expect(notFound).not.toHaveBeenCalled();
  });

  it("returns for an owner", async () => {
    auth.mockResolvedValue({
      user: { id: "u1", role: "employer", companyOwnerUserId: "u1" },
    });
    await expect(requireCompanyFunction("canManageTeam")).resolves.toBeUndefined();
    expect(notFound).not.toHaveBeenCalled();
  });

  it("returns for a member who holds the flag", async () => {
    auth.mockResolvedValue({
      user: {
        id: "member",
        role: "employer",
        companyOwnerUserId: "owner",
        companyPermissions: computeEffectivePermissions(["viewer"], { canRunScreening: true }),
      },
    });
    await expect(requireCompanyFunction("canRunScreening")).resolves.toBeUndefined();
    expect(notFound).not.toHaveBeenCalled();
  });

  it("calls notFound for a member without the flag", async () => {
    auth.mockResolvedValue({
      user: {
        id: "member",
        role: "employer",
        companyOwnerUserId: "owner",
        companyPermissions: computeEffectivePermissions(["viewer"]),
      },
    });
    await expect(requireCompanyFunction("canManageBilling")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("calls notFound when a member session carries no permissions at all (fail closed)", async () => {
    auth.mockResolvedValue({
      user: { id: "member", role: "employer", companyOwnerUserId: "owner" },
    });
    await expect(requireCompanyFunction("canRunScreening")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
