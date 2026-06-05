/**
 * @jest-environment node
 */

const ownerPermissions = {
  canCreateJobs: true,
  canManageTeam: true,
  canViewAnalytics: true,
  canExportData: true,
  canManageBilling: true,
  canViewReports: true,
  canApproveInvoices: true,
  canViewCommissions: true,
};

jest.mock("@/models/CompanyUser", () => ({
  CompanyUser: {
    findOne: jest.fn(),
    create: jest.fn(),
  },
  getDefaultPermissions: jest.fn(() => ownerPermissions),
}));

jest.mock("@/models/User", () => ({
  User: {
    findById: jest.fn(),
  },
}));

describe("ensureEmployerOwnerMembership", () => {
  const { CompanyUser } = require("@/models/CompanyUser");
  const { User } = require("@/models/User");

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates an active owner CompanyUser for legacy employer owners", async () => {
    CompanyUser.findOne
      .mockReturnValueOnce({ lean: jest.fn().mockResolvedValue(null) })
      .mockResolvedValueOnce(null);
    CompanyUser.create.mockResolvedValue({
      toObject: () => ({
        companyId: "emp_001",
        userId: "user_001",
        email: "owner@example.com",
        companyRole: "owner",
        status: "active",
      }),
    });

    const { ensureEmployerOwnerMembership } = await import("@/lib/employers/company-membership");
    const member = await ensureEmployerOwnerMembership({
      companyId: "emp_001",
      userId: "user_001",
      email: "OWNER@example.com ",
    });

    expect(CompanyUser.create).toHaveBeenCalledWith(expect.objectContaining({
      companyId: "emp_001",
      userId: "user_001",
      email: "owner@example.com",
      companyRole: "owner",
      companyRoles: ["owner"],
      permissions: ownerPermissions,
      invitedBy: "user_001",
      status: "active",
    }));
    expect(member).toEqual(expect.objectContaining({
      companyRole: "owner",
      status: "active",
    }));
  });

  it("returns null without creating membership when no owner email can be resolved", async () => {
    CompanyUser.findOne.mockReturnValueOnce({ lean: jest.fn().mockResolvedValue(null) });
    User.findById.mockReturnValueOnce({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      }),
    });

    const { ensureEmployerOwnerMembership } = await import("@/lib/employers/company-membership");
    const member = await ensureEmployerOwnerMembership({
      companyId: "emp_001",
      userId: "user_001",
    });

    expect(member).toBeNull();
    expect(CompanyUser.create).not.toHaveBeenCalled();
  });
});