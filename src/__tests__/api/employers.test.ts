/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

import { NextResponse } from "next/server";

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function) => {
    return async (req: NextRequest, context: { params: Promise<Record<string, string>> } = { params: Promise.resolve({}) }) => {
      try {
        return await handler(req, { userId: "admin_001", role: "admin", locale: "en" }, await context.params);
      } catch (err) {
        if (err && typeof err === "object" && "status" in err && typeof (err as any).json === "function") {
          return err;
        }
        throw err;
      }
    };
  },
}));

jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ userId: ctx.userId, role: ctx.role })),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/communications/email", () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  EmailTemplates: {
    employerWelcome: jest.fn().mockReturnValue({
      subject: "Welcome",
      text: "",
      html: "",
    }),
  },
}));

jest.mock("bcryptjs", () => ({
  hash: jest.fn().mockResolvedValue("hashed-password"),
}));

const mockFindOneUser = jest.fn();
const mockCreateUser = jest.fn();
const mockFindByIdAndUpdate = jest.fn();

jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    findOne: (...args: unknown[]) => mockFindOneUser(...args),
    create: (...args: unknown[]) => mockCreateUser(...args),
    findByIdAndUpdate: (...args: unknown[]) => mockFindByIdAndUpdate(...args),
  },
}));

const mockCreateEmployer = jest.fn();

jest.mock("@/models/Employer", () => ({
  __esModule: true,
  default: {
    create: (...args: unknown[]) => mockCreateEmployer(...args),
  },
}));

const mockCreateCompanyUser = jest.fn().mockResolvedValue(undefined);
const mockGetDefaultPermissions = jest.fn(() => ({
  canCreateJobs: true,
  canManageTeam: true,
  canViewAnalytics: true,
  canExportData: true,
  canManageBilling: true,
  canViewReports: true,
  canApproveInvoices: true,
  canViewCommissions: true,
}));

jest.mock("@/models/CompanyUser", () => ({
  __esModule: true,
  CompanyUser: {
    create: (...args: unknown[]) => mockCreateCompanyUser(...args),
  },
  getDefaultPermissions: (...args: unknown[]) => mockGetDefaultPermissions(...args),
}));

jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: {},
}));

describe("Employer admin API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makePostRequest(body: unknown) {
    return new NextRequest("http://localhost/api/employers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("rejects a short admin password with validation details", async () => {
    const { POST } = await import("@/app/api/employers/route");
    const req = makePostRequest({
      name: "Test Contact",
      email: "emp@example.com",
      password: "Short1!Abc",
      companyName: "Acme",
      industry: "IT",
      location: "Dubai",
      phone: "971500000000",
    });

    const res = await (POST as any)(req, { params: Promise.resolve({}) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.details)).toBe(true);
    expect(body.details.some((detail: any) => detail.path === "password")).toBe(true);
  });

  it("creates an employer when the admin payload is valid", async () => {
    mockFindOneUser.mockResolvedValue(null);
    mockCreateUser.mockResolvedValue({ _id: "user_001", name: "Test Contact", email: "emp@example.com" });
    mockFindByIdAndUpdate.mockResolvedValue(undefined);
    mockCreateEmployer.mockResolvedValue({ _id: "emp_001", companyName: "Acme", industry: "IT", isAgentVerified: false });

    const { POST } = await import("@/app/api/employers/route");
    const req = makePostRequest({
      name: "Test Contact",
      email: "emp@example.com",
      password: "Str0ng!Passw0rd",
      companyName: "Acme",
      industry: "IT",
      location: "Dubai",
      phone: "971500000000",
    });

    const res = await (POST as any)(req, { params: Promise.resolve({}) });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.employer).toBeDefined();
    expect(body.employer.companyName).toBe("Acme");
    expect(body.employer.email).toBe("emp@example.com");
    expect(mockCreateUser).toHaveBeenCalledWith(expect.objectContaining({ email: "emp@example.com", role: "employer" }));
    expect(mockCreateEmployer).toHaveBeenCalledWith(expect.objectContaining({ companyName: "Acme", companyEmail: "emp@example.com" }));
  });
});
