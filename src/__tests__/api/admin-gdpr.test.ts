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

const userFind = jest.fn((..._args: unknown[]) => chain([{ _id: "64d000000000000000000003", email: "sara@example.com" }]));
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    countDocuments: jest.fn().mockResolvedValue(42),
    find: (...a: unknown[]) => userFind(...a),
  },
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

  it("GET /api/admin/gdpr averages response time over admin-handled requests, never self-service exports", async () => {
    // An export completes the instant the user downloads it; counting those
    // pinned the average at 0 days whatever admins actually did.
    gdprAggregate.mockResolvedValueOnce([{ avgMs: 30 * 60 * 60 * 1000 }]);
    const { GET } = await import("@/app/api/admin/gdpr/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/admin/gdpr?page=1&limit=10"), { params: Promise.resolve({}) });
    const payload = await res.json();

    const [pipeline] = gdprAggregate.mock.calls[0] as [Array<{ $match?: Record<string, unknown> }>];
    expect(pipeline[0].$match).toEqual(expect.objectContaining({
      status: "completed",
      requestType: { $ne: "export" },
    }));
    expect(payload.stats.avgResponseMs).toBe(30 * 60 * 60 * 1000);
  });

  it("GET /api/admin/gdpr reports no average until an admin has completed a request", async () => {
    const { GET } = await import("@/app/api/admin/gdpr/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/admin/gdpr?page=1&limit=10"), { params: Promise.resolve({}) });
    const payload = await res.json();

    expect(payload.stats.avgResponseMs).toBeNull();
  });

  it("GET /api/admin/gdpr names the admin who handled a request and returns the user's reason", async () => {
    gdprFind.mockImplementation(() => chain([{
      ...requestDoc,
      requestType: "delete",
      status: "completed",
      completedAt: new Date("2026-08-02T10:00:00Z"),
      handledBy: ADMIN_ID,
      notes: "Moving abroad",
    }]));
    userFind.mockImplementationOnce(() => chain([{ _id: ADMIN_ID, name: "Super Admin" }]));
    const { GET } = await import("@/app/api/admin/gdpr/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/admin/gdpr?page=1&limit=10"), { params: Promise.resolve({}) });
    const payload = await res.json();

    expect(userFind).toHaveBeenCalledWith({ _id: { $in: [ADMIN_ID] } });
    expect(payload.items[0]).toEqual(expect.objectContaining({
      handledByName: "Super Admin",
      notes: "Moving abroad",
    }));
  });

  it("GET /api/admin/gdpr looks each handler up once, matching stored ObjectIds", async () => {
    const { Types } = jest.requireActual("mongoose") as typeof import("mongoose");
    const OTHER_ADMIN = "64d000000000000000000009";
    gdprFind.mockImplementation(() => chain([
      { ...requestDoc, _id: "64d000000000000000000011", status: "in_progress", handledBy: new Types.ObjectId(ADMIN_ID) },
      { ...requestDoc, _id: "64d000000000000000000012", status: "rejected", handledBy: new Types.ObjectId(ADMIN_ID) },
      // An admin account that no longer exists.
      { ...requestDoc, _id: "64d000000000000000000013", status: "rejected", handledBy: new Types.ObjectId(OTHER_ADMIN) },
    ]));
    userFind.mockImplementationOnce(() => chain([{ _id: new Types.ObjectId(ADMIN_ID), name: "Super Admin" }]));
    const { GET } = await import("@/app/api/admin/gdpr/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/admin/gdpr?page=1&limit=10"), { params: Promise.resolve({}) });
    const payload = await res.json();

    expect(userFind).toHaveBeenCalledTimes(1);
    expect(userFind).toHaveBeenCalledWith({ _id: { $in: [ADMIN_ID, OTHER_ADMIN] } });
    expect(payload.items.map((i: { handledByName: string | null }) => i.handledByName)).toEqual(["Super Admin", "Super Admin", null]);
  });

  it("GET /api/admin/gdpr skips the handler lookup when no request on the page was handled", async () => {
    const { GET } = await import("@/app/api/admin/gdpr/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/admin/gdpr?page=1&limit=10"), { params: Promise.resolve({}) });
    const payload = await res.json();

    expect(userFind).not.toHaveBeenCalled();
    expect(payload.items[0].handledByName).toBeNull();
  });

  it("GET /api/admin/gdpr/consent lists consent log entries", async () => {
    const { GET } = await import("@/app/api/admin/gdpr/consent/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/admin/gdpr/consent?page=1&limit=10"), { params: Promise.resolve({}) });
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.total).toBe(1);
    expect(payload.items[0]).toEqual(expect.objectContaining({
      userName: "Sara Ahmed",
      userEmail: "sara@example.com",
      consentType: "marketing",
      granted: true,
      timestamp: consentDoc.createdAt.toISOString(),
      source: null,
      policyVersion: null,
    }));
  });

  it("GET /api/admin/gdpr/consent filters by consent type and ignores an unknown one", async () => {
    const { GET } = await import("@/app/api/admin/gdpr/consent/route");
    await GET(new NextRequest("http://localhost:3000/api/admin/gdpr/consent?type=terms_and_privacy"), { params: Promise.resolve({}) });
    expect(consentFind).toHaveBeenLastCalledWith(expect.objectContaining({ consentType: "terms_and_privacy" }));

    await GET(new NextRequest("http://localhost:3000/api/admin/gdpr/consent?type=%24ne"), { params: Promise.resolve({}) });
    expect(consentFind.mock.calls.at(-1)?.[0]).not.toHaveProperty("consentType");
  });

  it("GET /api/admin/gdpr/consent finds a user's rows by e-mail", async () => {
    const { GET } = await import("@/app/api/admin/gdpr/consent/route");
    await GET(new NextRequest("http://localhost:3000/api/admin/gdpr/consent?search=sara%40example"), { params: Promise.resolve({}) });

    expect(userFind).toHaveBeenCalledWith({ email: { $regex: "sara@example", $options: "i" } });
    const filter = consentFind.mock.calls.at(-1)?.[0] as { $or: unknown[] };
    expect(filter.$or).toContainEqual({ userId: { $in: ["64d000000000000000000003"] } });
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
