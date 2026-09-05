/**
 * @jest-environment node
 */

import { NextRequest, NextResponse } from "next/server";

let ctxRole: "admin" | "super_agent" = "admin";
const ADMIN_ID = "64d000000000000000000001";
const REQUEST_ID = "64d000000000000000000002";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ actorId: ctx.userId, actorRole: ctx.role })),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => Promise<Response>) =>
    async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
      const params = context ? await context.params : {};
      try {
        return await handler(req, { userId: ADMIN_ID, role: ctxRole, locale: "en" }, params);
      } catch (err) {
        if (err instanceof NextResponse) return err;
        throw err;
      }
    },
}));

function chain(result: unknown) {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["sort", "skip", "limit", "select", "populate"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn().mockResolvedValue(result);
  return c;
}

const requestDoc = {
  _id: REQUEST_ID,
  userId: "64d000000000000000000003",
  userName: "Sara Ahmed",
  userEmail: "sara@example.com",
  requestType: "export",
  status: "pending",
  createdAt: new Date("2026-08-01T10:00:00Z"),
};
const gdprFind = jest.fn((..._args: unknown[]) => chain([requestDoc]));
const gdprCount = jest.fn().mockResolvedValue(1);
const gdprAggregate = jest.fn().mockResolvedValue([]);
const gdprFindById = jest.fn();
jest.mock("@/models/GdprRequest", () => ({
  __esModule: true,
  // Keep the real constants (types, statuses, transition table); mock only the model.
  ...jest.requireActual("@/models/GdprRequest"),
  default: {
    find: (...a: unknown[]) => gdprFind(...a),
    countDocuments: (...a: unknown[]) => gdprCount(...a),
    aggregate: (...a: unknown[]) => gdprAggregate(...a),
    findById: (...a: unknown[]) => gdprFindById(...a),
  },
}));

const consentDoc = {
  _id: "64d000000000000000000004",
  userId: "64d000000000000000000003",
  userName: "Sara Ahmed",
  consentType: "marketing",
  granted: true,
  ipAddress: "10.0.0.1",
  createdAt: new Date("2026-08-02T10:00:00Z"),
};
const consentFind = jest.fn((..._args: unknown[]) => chain([consentDoc]));
jest.mock("@/models/ConsentLog", () => ({
  __esModule: true,
  default: {
    find: (...a: unknown[]) => consentFind(...a),
    countDocuments: jest.fn().mockResolvedValue(1),
    aggregate: jest.fn().mockResolvedValue([{ activeConsents: 1 }]),
  },
}));

jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { countDocuments: jest.fn().mockResolvedValue(42) },
}));

const patchReq = (id: string, body: unknown) =>
  new NextRequest(`http://localhost:3000/api/admin/gdpr/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("Admin GDPR register", () => {
  beforeEach(() => {
    ctxRole = "admin";
    jest.clearAllMocks();
    gdprFind.mockImplementation(() => chain([requestDoc]));
    gdprCount.mockResolvedValue(1);
  });

  it("GET /api/admin/gdpr lists data requests from the GDPR register with stats", async () => {
    const { GET } = await import("@/app/api/admin/gdpr/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/admin/gdpr?page=1&limit=10"), { params: Promise.resolve({}) });
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.total).toBe(1);
    expect(payload.items[0]).toEqual(expect.objectContaining({
      _id: REQUEST_ID,
      userName: "Sara Ahmed",
      userEmail: "sara@example.com",
      requestType: "export",
      status: "pending",
    }));
    expect(payload.stats).toEqual(expect.objectContaining({
      totalRequests: expect.any(Number),
      pendingRequests: expect.any(Number),
      completedRequests: expect.any(Number),
      dataSubjects: 42,
      activeConsents: expect.any(Number),
    }));
    expect(gdprFind).toHaveBeenCalled();
  });

  it("GET /api/admin/gdpr/consent lists consent log entries", async () => {
    const { GET } = await import("@/app/api/admin/gdpr/consent/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/admin/gdpr/consent?page=1&limit=10"), { params: Promise.resolve({}) });
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.total).toBe(1);
    expect(payload.items[0]).toEqual(expect.objectContaining({
      userName: "Sara Ahmed",
      consentType: "marketing",
      granted: true,
      timestamp: consentDoc.createdAt.toISOString(),
    }));
  });

  it("PATCH /api/admin/gdpr/[id] moves a pending request to in_progress and records the handler", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    gdprFindById.mockResolvedValue({ ...requestDoc, save });
    const { PATCH } = await import("@/app/api/admin/gdpr/[id]/route");

    const res = await PATCH(patchReq(REQUEST_ID, { status: "in_progress" }), { params: Promise.resolve({ id: REQUEST_ID }) });
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.request.status).toBe("in_progress");
    expect(payload.request.handledBy).toBe(ADMIN_ID);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("PATCH stamps completedAt when a request is completed", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    gdprFindById.mockResolvedValue({ ...requestDoc, status: "in_progress", save });
    const { PATCH } = await import("@/app/api/admin/gdpr/[id]/route");

    const res = await PATCH(patchReq(REQUEST_ID, { status: "completed", notes: "Export sent" }), { params: Promise.resolve({ id: REQUEST_ID }) });
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.request.status).toBe("completed");
    expect(payload.request.completedAt).toBeTruthy();
    expect(payload.request.notes).toBe("Export sent");
  });

  it("PATCH refuses to reopen a completed request", async () => {
    gdprFindById.mockResolvedValue({ ...requestDoc, status: "completed", save: jest.fn() });
    const { PATCH } = await import("@/app/api/admin/gdpr/[id]/route");

    const res = await PATCH(patchReq(REQUEST_ID, { status: "pending" }), { params: Promise.resolve({ id: REQUEST_ID }) });
    expect(res.status).toBe(409);
  });

  it("PATCH rejects an invalid id and a non-admin caller", async () => {
    const { PATCH } = await import("@/app/api/admin/gdpr/[id]/route");
    const bad = await PATCH(patchReq("nope", { status: "in_progress" }), { params: Promise.resolve({ id: "nope" }) });
    expect(bad.status).toBe(400);

    ctxRole = "super_agent";
    const forbidden = await PATCH(patchReq(REQUEST_ID, { status: "in_progress" }), { params: Promise.resolve({ id: REQUEST_ID }) });
    expect(forbidden.status).toBe(403);
  });
});
