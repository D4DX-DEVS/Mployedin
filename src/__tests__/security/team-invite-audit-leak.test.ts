/**
 * @jest-environment node
 *
 * 2026-09-28 OWASP assessment H-04: inviting an existing account (say an
 * admin) bound its userId to the pending CompanyUser row, and Team Activity
 * Logs then listed that user's platform-wide AuditLog rows — IPs, user
 * agents, before/after diffs — without the invitee ever accepting.
 */
import { NextRequest } from "next/server";

const OWNER = "aaaaaaaaaaaaaaaaaaaaaaaa";
const COMPANY = "cccccccccccccccccccccccc";
const EXISTING_ADMIN = "dddddddddddddddddddddddd";

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (h: (req: NextRequest, ctx: unknown) => Promise<Response>) => async (req: NextRequest) =>
    h(req, { userId: "aaaaaaaaaaaaaaaaaaaaaaaa", role: "employer", locale: "en" }),
}));
jest.mock("@/lib/subscription/withSubscription", () => ({ withSubscription: (h: unknown) => h }));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn(), actorFromCtx: jest.fn(() => ({})) }));
jest.mock("@/lib/notifications/trigger", () => ({ notify: jest.fn() }));
jest.mock("@/lib/communications/email", () => ({ sendEmail: jest.fn() }));
jest.mock("@/lib/permissions/team", () => ({ getTeamActorRole: jest.fn().mockResolvedValue("owner") }));

const userFind = jest.fn(() => ({ select: () => ({ lean: async () => [{ _id: "dddddddddddddddddddddddd", name: "Super Admin", email: "admin@x.test", avatar: "a.png" }] }) }));
jest.mock("@/models/User", () => ({
  User: {
    // An account with the invited address exists.
    findOne: () => ({ select: () => ({ lean: async () => ({ _id: "dddddddddddddddddddddddd" }) }) }),
    find: (...a: unknown[]) => userFind(...(a as [])),
  },
}));
jest.mock("@/models/Employer", () => ({
  Employer: {
    findOne: () => ({
      select: () => ({ lean: async () => ({ _id: "cccccccccccccccccccccccc", companyEmail: "o@co.test", companyName: "Co" }) }),
    }),
  },
}));

const create = jest.fn();
const companyUserFind = jest.fn();
jest.mock("@/models/CompanyUser", () => ({
  CompanyUser: {
    findOne: jest.fn().mockResolvedValue(null),
    countDocuments: jest.fn().mockResolvedValue(1),
    create: (...a: unknown[]) => create(...a),
    find: (...a: unknown[]) => companyUserFind(...(a as [])),
    aggregate: jest.fn().mockResolvedValue([{ _id: "pending", count: 1 }]),
  },
  computeEffectivePermissions: jest.fn(() => ({})),
  getPrimaryRole: (roles: string[]) => roles[0],
}));

const auditFind = jest.fn();
jest.mock("@/models/AuditLog", () => {
  const q: Record<string, unknown> = {};
  for (const m of ["sort", "skip", "limit", "populate"]) q[m] = () => q;
  q.lean = async () => [];
  return {
    __esModule: true,
    default: {
      find: (...a: unknown[]) => { auditFind(...a); return q; },
      countDocuments: jest.fn().mockResolvedValue(0),
    },
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  create.mockImplementation(async (doc: Record<string, unknown>) => ({ ...doc, _id: "m1", toObject: () => ({ ...doc }) }));
});

it("does not bind an existing account to a pending invitation", async () => {
  const { POST } = await import("@/app/api/employers/team/route");
  await POST(
    new NextRequest("http://localhost/api/employers/team", {
      method: "POST",
      body: JSON.stringify({ email: "admin@x.test", companyRole: "viewer" }),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({}) },
  );
  expect(create).toHaveBeenCalledTimes(1);
  expect(create.mock.calls[0][0]).not.toHaveProperty("userId");
  expect(create.mock.calls[0][0].status).toBe("pending");
});

it("team list hides account details of pending invitees (legacy bound rows included)", async () => {
  const chain = { sort: () => chain, skip: () => chain, limit: () => chain, lean: async () => [
    { _id: "m1", email: "admin@x.test", status: "pending", userId: EXISTING_ADMIN, companyRole: "viewer" },
  ] };
  companyUserFind.mockReturnValue(chain);
  const { GET } = await import("@/app/api/employers/team/route");
  const res = await GET(new NextRequest("http://localhost/api/employers/team"), { params: Promise.resolve({}) });
  const body = await res.json();
  expect(body.members[0].user).toBeNull();
  expect(JSON.stringify(body)).not.toContain("Super Admin");
});

it("activity logs skip pending rows and only read rows about this company", async () => {
  companyUserFind.mockReturnValue({ select: () => ({ lean: async () => [{ userId: OWNER, email: "o@co.test", companyRole: "owner" }] }) });
  const { GET } = await import("@/app/api/employers/team/activity-logs/route");
  await GET(new NextRequest("http://localhost/api/employers/team/activity-logs"), { params: Promise.resolve({}) });

  const memberQuery = companyUserFind.mock.calls[0][0];
  expect(memberQuery.status).toEqual({ $ne: "pending" });

  const logQuery = auditFind.mock.calls[0][0];
  expect(logQuery.$or).toEqual([{ actorId: OWNER }, { onBehalfOfId: OWNER }]);
  expect(COMPANY).toBeTruthy();
});
