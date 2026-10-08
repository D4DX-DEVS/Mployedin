/**
 * @jest-environment node
 *
 * SEC-B4 / AD-4: employer registration used to delete ANY account whose email
 * was unverified and older than 24h — a job seeker, a staff member, a social
 * login, or an employer that already had jobs and a team — just because an
 * anonymous visitor submitted the form with that address. Only a stale
 * unverified employer password signup with no activity may be purged.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
  RATE_LIMIT_CONFIGS: { auth: {} },
}));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/communications/email", () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  EmailTemplates: {
    verifyEmailOtp: jest.fn(() => ({ subject: "s", html: "h" })),
    employerSelfWelcome: jest.fn(() => ({ subject: "s", html: "h" })),
  },
}));
jest.mock("@/lib/subscription/autoAssign", () => ({ autoAssignDefaultPlan: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/storage/spaces", () => ({ uploadBuffer: jest.fn() }));
jest.mock("@/lib/notifications/trigger", () => ({
  notifyAdminsEmployerRegistered: jest.fn().mockResolvedValue(undefined),
  getSuperAgentUserId: jest.fn(),
  notifySuperAgentEmployerRegistered: jest.fn(),
}));
jest.mock("bcryptjs", () => ({ __esModule: true, default: { hash: jest.fn().mockResolvedValue("hash") } }));

const userFindOne = jest.fn();
const userDeleteOne = jest.fn().mockResolvedValue(null);
const userCreate = jest.fn();
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    findOne: (...a: unknown[]) => userFindOne(...a),
    deleteOne: (...a: unknown[]) => userDeleteOne(...a),
    create: (...a: unknown[]) => userCreate(...a),
  },
}));
const employerFindOne = jest.fn();
const employerDeleteOne = jest.fn().mockResolvedValue(null);
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  default: {
    findOne: (...a: unknown[]) => employerFindOne(...a),
    deleteOne: (...a: unknown[]) => employerDeleteOne(...a),
    create: jest.fn().mockResolvedValue({ _id: "emp-new" }),
  },
}));
const jobExists = jest.fn();
jest.mock("@/models/Job", () => ({ __esModule: true, default: { exists: (...a: unknown[]) => jobExists(...a) } }));
const companyUserExists = jest.fn();
jest.mock("@/models/CompanyUser", () => ({
  __esModule: true,
  CompanyUser: {
    exists: (...a: unknown[]) => companyUserExists(...a),
    deleteMany: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
  },
  getDefaultPermissions: jest.fn(() => ({})),
}));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/SuperAgent", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/ReferralLink", () => ({
  __esModule: true,
  default: { updateMany: jest.fn().mockResolvedValue(null) },
}));

import { POST } from "@/app/api/auth/employer-register/route";

const STALE = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

function request() {
  const form = new FormData();
  form.set("companyName", "Acme");
  form.set("contactName", "Owner");
  form.set("contactEmail", "victim@example.com");
  form.set("password", "Str0ng!Passw0rd#2026");
  return new NextRequest("http://localhost/api/auth/employer-register", { method: "POST", body: form });
}

const selectLean = (value: unknown) => ({ select: () => ({ lean: () => Promise.resolve(value) }) });

beforeEach(() => {
  jest.clearAllMocks();
  employerFindOne.mockReturnValue(selectLean({ _id: "emp-old" }));
  jobExists.mockResolvedValue(null);
  companyUserExists.mockResolvedValue(null);
  userCreate.mockResolvedValue({ _id: "u-new" });
});

const staleUser = (over: Record<string, unknown>) => ({
  _id: "u-old",
  isEmailVerified: false,
  createdAt: STALE,
  role: "employer",
  authProvider: "credentials",
  ...over,
});

it.each([
  ["job seeker", { role: "job_seeker" }],
  ["admin", { role: "admin" }],
  ["social-login employer", { authProvider: "google" }],
])("refuses with 409 and never deletes a stale unverified %s", async (_label, over) => {
  userFindOne.mockResolvedValue(staleUser(over));
  const res = await POST(request());
  expect(res.status).toBe(409);
  expect(await res.json()).toEqual({ message: "Email already in use" });
  expect(userDeleteOne).not.toHaveBeenCalled();
  expect(employerDeleteOne).not.toHaveBeenCalled();
});

it("refuses to purge a stale employer that already has jobs", async () => {
  userFindOne.mockResolvedValue(staleUser({}));
  jobExists.mockResolvedValue({ _id: "j1" });
  const res = await POST(request());
  expect(res.status).toBe(409);
  expect(userDeleteOne).not.toHaveBeenCalled();
});

it("refuses to purge a stale employer with team memberships", async () => {
  userFindOne.mockResolvedValue(staleUser({}));
  companyUserExists.mockResolvedValue({ _id: "cu1" });
  const res = await POST(request());
  expect(res.status).toBe(409);
  expect(userDeleteOne).not.toHaveBeenCalled();
});

it("still purges an inactive stale employer password signup and re-registers", async () => {
  userFindOne.mockResolvedValue(staleUser({}));
  const res = await POST(request());
  expect(res.status).toBe(201);
  expect(userDeleteOne).toHaveBeenCalledWith({ _id: "u-old" });
  expect(employerDeleteOne).toHaveBeenCalledWith({ userId: "u-old" });
});
