/**
 * @jest-environment node
 *
 * 2026-09-28 OWASP assessment H-05: withAuth swaps ctx.userId to the company
 * owner for colleagues (and to the employer in tenant view), so
 * PATCH /api/employers/[ownerId] passed its "own account" check for a
 * colleague, who could then set the owner's login email to one they control
 * and reset the password. DELETE let the same colleague deactivate the owner.
 */
import { NextRequest } from "next/server";

const OWNER = "aaaaaaaaaaaaaaaaaaaaaaaa";
let ctx: Record<string, unknown> = {};

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (h: (req: NextRequest, c: unknown, p?: unknown) => Promise<Response>) =>
    async (req: NextRequest, route: { params: Promise<Record<string, string>> }) => h(req, ctx, await route.params),
}));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn(), actorFromCtx: jest.fn(() => ({})) }));
jest.mock("@/lib/employers/accountStatus", () => ({ deactivateEmployerAccount: jest.fn().mockResolvedValue({}) }));

const save = jest.fn();
const ownerDoc = { _id: OWNER, email: "owner@co.test", save };
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { findById: jest.fn(async () => ownerDoc) },
}));
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  default: { findOne: jest.fn(async () => null) },
  Employer: { findOne: jest.fn(async () => null) },
}));

async function call(method: "PATCH" | "DELETE", body?: unknown) {
  const route = await import("@/app/api/employers/[id]/route");
  const handler = (route as unknown as Record<string, (r: NextRequest, c: unknown) => Promise<Response>>)[method];
  return handler(
    new NextRequest(`http://localhost/api/employers/${OWNER}`, {
      method,
      ...(body ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}),
    }),
    { params: Promise.resolve({ id: OWNER }) },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  ownerDoc.email = "owner@co.test";
});

describe("PATCH /api/employers/[id]", () => {
  it("refuses a colleague acting in the owner's workspace", async () => {
    ctx = { userId: OWNER, role: "employer", locale: "en", member: { actorId: "bbbbbbbbbbbbbbbbbbbbbbbb", companyId: "c" } };
    const res = await call("PATCH", { email: "attacker@evil.test" });
    expect(res.status).toBe(403);
    expect(save).not.toHaveBeenCalled();
    expect(ownerDoc.email).toBe("owner@co.test");
  });

  it("refuses an agent in tenant view", async () => {
    ctx = { userId: OWNER, role: "employer", locale: "en", tenantView: { actorId: "a1", actorRole: "agent", employerId: OWNER } };
    const res = await call("PATCH", { name: "Renamed" });
    expect(res.status).toBe(403);
  });

  it("does not let a non-admin change the login email directly, even on their own account", async () => {
    ctx = { userId: OWNER, role: "employer", locale: "en" };
    const res = await call("PATCH", { email: "new@co.test" });
    expect(res.status).toBe(403);
    expect(ownerDoc.email).toBe("owner@co.test");
  });

  it("still lets an admin correct an employer's email", async () => {
    ctx = { userId: "ffffffffffffffffffffffff", role: "admin", locale: "en" };
    const res = await call("PATCH", { email: "fixed@co.test" });
    expect(res.status).toBe(200);
    expect(ownerDoc.email).toBe("fixed@co.test");
  });
});

describe("DELETE /api/employers/[id]", () => {
  it("refuses a colleague deactivating the owner", async () => {
    ctx = { userId: OWNER, role: "employer", locale: "en", member: { actorId: "bbbbbbbbbbbbbbbbbbbbbbbb", companyId: "c" } };
    const res = await call("DELETE");
    expect(res.status).toBe(403);
  });
});
