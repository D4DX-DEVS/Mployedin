/**
 * @jest-environment node
 *
 * SEC-E1 / SEC-E2: POST /api/employers/team must never echo the invite token
 * (a bearer credential for joining the company) and must refuse tenant view.
 */
import { NextRequest } from "next/server";

const OWNER = "aaaaaaaaaaaaaaaaaaaaaaaa";
const COMPANY = "cccccccccccccccccccccccc";
const guards: unknown[] = [];

let currentCtx: Record<string, unknown> = {};
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth:
    (h: (req: NextRequest, ctx: unknown) => Promise<Response>, guard?: unknown) => {
      guards.push(guard);
      return async (req: NextRequest) => h(req, currentCtx);
    },
}));
jest.mock("@/lib/subscription/withSubscription", () => ({ withSubscription: (h: unknown) => h }));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn(), actorFromCtx: jest.fn(() => ({})) }));
jest.mock("@/lib/notifications/trigger", () => ({ notify: jest.fn() }));
jest.mock("@/lib/communications/email", () => ({ sendEmail: jest.fn() }));
jest.mock("@/models/User", () => ({
  User: { findOne: () => ({ select: () => ({ lean: () => Promise.resolve(null) }) }) },
}));
jest.mock("@/models/Employer", () => ({
  Employer: {
    findOne: () => ({
      select: () => ({ lean: () => Promise.resolve({ _id: COMPANY, companyEmail: "o@co.test", companyName: "Co" }) }),
    }),
  },
}));
jest.mock("@/lib/permissions/team", () => ({ getTeamActorRole: jest.fn().mockResolvedValue("owner") }));

const create = jest.fn();
jest.mock("@/models/CompanyUser", () => ({
  CompanyUser: {
    findOne: jest.fn().mockResolvedValue(null),
    countDocuments: jest.fn().mockResolvedValue(1),
    create: (...a: unknown[]) => create(...a),
  },
  computeEffectivePermissions: jest.fn(() => ({})),
  getPrimaryRole: (roles: string[]) => roles[0],
}));

const invite = async () => {
  const { POST } = await import("@/app/api/employers/team/route");
  return POST(
    new NextRequest("http://localhost/api/employers/team", {
      method: "POST",
      body: JSON.stringify({ email: "new@co.test", companyRole: "viewer" }),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({}) },
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  create.mockImplementation(async (doc: Record<string, unknown>) => ({
    ...doc,
    _id: "m1",
    toObject() {
      const { toObject: _drop, ...rest } = this as Record<string, unknown>;
      return { ...rest };
    },
  }));
});

it("guards POST with employers:update", async () => {
  await import("@/app/api/employers/team/route");
  expect(guards).toContainEqual({ resource: "employers", action: "update" });
});

it("never returns the invite token", async () => {
  currentCtx = { userId: OWNER, role: "employer" };
  const res = await invite();
  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body.member.email).toBe("new@co.test");
  expect(body.member).not.toHaveProperty("inviteToken");
  expect(create.mock.calls[0][0]).toHaveProperty("inviteToken");
});

it("refuses to invite from tenant view", async () => {
  currentCtx = { userId: OWNER, role: "employer", tenantView: { actorId: "x", actorRole: "agent", employerId: COMPANY } };
  const res = await invite();
  expect(res.status).toBe(403);
  expect(create).not.toHaveBeenCalled();
});

// EMP-12: a second pending invite hit the legacy non-partial
// companyId_1_userId_1 index (userId: null) and surfaced as a bare 500.
describe("duplicate-key failures on invite", () => {
  const dupKey = (keyPattern: Record<string, number>) =>
    Object.assign(new Error("E11000 duplicate key error"), { code: 11000, keyPattern });

  beforeEach(() => {
    currentCtx = { userId: OWNER, role: "employer" };
  });

  it("maps the legacy userId:null index collision to a 503 with a readable message", async () => {
    create.mockRejectedValueOnce(dupKey({ companyId: 1, userId: 1 }));
    const res = await invite();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("INVITE_UNAVAILABLE");
    expect(body.error).toMatch(/temporarily unavailable/i);
  });

  it("maps a racing invite for the same email to 409 ALREADY_MEMBER", async () => {
    create.mockRejectedValueOnce(dupKey({ companyId: 1, email: 1 }));
    const res = await invite();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("ALREADY_MEMBER");
  });

  it("still rethrows unrelated errors", async () => {
    create.mockRejectedValueOnce(new Error("boom"));
    await expect(invite()).rejects.toThrow("boom");
  });
});
