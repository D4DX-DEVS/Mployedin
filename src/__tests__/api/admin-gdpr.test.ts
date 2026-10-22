/**
 * @jest-environment node
 */

import { NextRequest, NextResponse } from "next/server";

let ctxRole: "admin" | "super_agent" = "admin";
const ADMIN_ID = "64d000000000000000000001";
const REQUEST_ID = "64d000000000000000000002";
const CHOICE_REF = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";

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

  it("GET /api/admin/gdpr averages response time over admin-handled requests, refusals included, never self-service exports", async () => {
    // An export completes the instant the user downloads it; counting those
    // pinned the average at 0 days whatever admins actually did.
    gdprAggregate.mockResolvedValueOnce([{ avgMs: 30 * 60 * 60 * 1000 }]);
    const { GET } = await import("@/app/api/admin/gdpr/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/admin/gdpr?page=1&limit=10"), { params: Promise.resolve({}) });
    const payload = await res.json();

    const [pipeline] = gdprAggregate.mock.calls[0] as [Array<{ $match?: Record<string, unknown> }>];
    // A refusal is an answer too (UK GDPR Art 12(4)): its decision date is completedAt as well.
    expect(pipeline[0].$match).toEqual(expect.objectContaining({
      status: { $in: ["completed", "rejected"] },
      completedAt: { $ne: null },
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

  it("GET /api/admin/gdpr names the admin who handled a request and returns the user's reason, the outcome and the internal notes", async () => {
    gdprFind.mockImplementation(() => chain([{
      ...requestDoc,
      requestType: "delete",
      status: "completed",
      completedAt: new Date("2026-08-02T10:00:00Z"),
      handledBy: ADMIN_ID,
      notes: "Moving abroad",
      outcome: "Account erased",
      outcomeReason: "Invoices were kept: the law requires it",
      adminNotes: "Checked with legal",
    }]));
    userFind.mockImplementationOnce(() => chain([{ _id: ADMIN_ID, name: "Super Admin" }]));
    const { GET } = await import("@/app/api/admin/gdpr/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/admin/gdpr?page=1&limit=10"), { params: Promise.resolve({}) });
    const payload = await res.json();

    expect(userFind).toHaveBeenCalledWith({ _id: { $in: [ADMIN_ID] } });
    expect(payload.items[0]).toEqual(expect.objectContaining({
      handledByName: "Super Admin",
      notes: "Moving abroad",
      outcome: "Account erased",
      outcomeReason: "Invoices were kept: the law requires it",
      adminNotes: "Checked with legal",
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

  it("GET /api/admin/gdpr/consent shows an erased account as Deleted User with no e-mail, even on a row written before erasure anonymised it", async () => {
    userFind.mockImplementationOnce(() => chain([{ _id: "64d000000000000000000003", email: "deleted_x@anonymized.mployedin.com", deletedAt: new Date("2026-10-01") }]));
    const { GET } = await import("@/app/api/admin/gdpr/consent/route");
    const payload = await (await GET(new NextRequest("http://localhost:3000/api/admin/gdpr/consent?page=1&limit=10"), { params: Promise.resolve({}) })).json();

    expect(payload.items[0]).toEqual(expect.objectContaining({ userName: "Deleted User", userEmail: null, consentType: "marketing", granted: true }));
  });

  it("GET /api/admin/gdpr/consent filters by consent type and ignores an unknown one", async () => {
    const { GET } = await import("@/app/api/admin/gdpr/consent/route");
    await GET(new NextRequest("http://localhost:3000/api/admin/gdpr/consent?type=terms_and_privacy"), { params: Promise.resolve({}) });
    expect(consentFind).toHaveBeenLastCalledWith(expect.objectContaining({ consentType: "terms_and_privacy" }));

    await GET(new NextRequest("http://localhost:3000/api/admin/gdpr/consent?type=%24ne"), { params: Promise.resolve({}) });
    expect(consentFind.mock.calls.at(-1)?.[0]).not.toHaveProperty("consentType");
  });

  it("GET /api/admin/gdpr/consent filters by the cookie banner's per-category types", async () => {
    const { GET } = await import("@/app/api/admin/gdpr/consent/route");
    for (const type of ["cookies.preferences", "cookies.media"]) {
      await GET(new NextRequest(`http://localhost:3000/api/admin/gdpr/consent?type=${type}`), { params: Promise.resolve({}) });
      expect(consentFind).toHaveBeenLastCalledWith(expect.objectContaining({ consentType: type }));
    }
  });

  it("GET /api/admin/gdpr/consent finds a user's rows by e-mail", async () => {
    const { GET } = await import("@/app/api/admin/gdpr/consent/route");
    await GET(new NextRequest("http://localhost:3000/api/admin/gdpr/consent?search=sara%40example"), { params: Promise.resolve({}) });

    expect(userFind).toHaveBeenCalledWith({ email: { $regex: "sara@example", $options: "i" } });
    const filter = consentFind.mock.calls.at(-1)?.[0] as { $or: unknown[] };
    expect(filter.$or).toContainEqual({ userId: { $in: ["64d000000000000000000003"] } });
  });

  it("GET /api/admin/gdpr/consent returns each row's choice reference, or null when it has none", async () => {
    consentFind.mockImplementationOnce(() => chain([
      { ...consentDoc, _id: "64d0000000000000000000a1", consentType: "cookies.preferences", receiptId: CHOICE_REF },
      consentDoc,
    ]));
    const { GET } = await import("@/app/api/admin/gdpr/consent/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/admin/gdpr/consent?page=1&limit=10"), { params: Promise.resolve({}) });
    const payload = await res.json();

    expect(payload.items.map((i: { receiptId: string | null }) => i.receiptId)).toEqual([CHOICE_REF, null]);
  });

  it("GET /api/admin/gdpr/consent matches a full choice reference typed into the search box, next to the usual matches", async () => {
    const { GET } = await import("@/app/api/admin/gdpr/consent/route");
    await GET(new NextRequest(`http://localhost:3000/api/admin/gdpr/consent?search=${CHOICE_REF}`), { params: Promise.resolve({}) });

    const filter = consentFind.mock.calls.at(-1)?.[0] as { $or: unknown[] };
    expect(filter.$or).toContainEqual({ receiptId: CHOICE_REF });
    // The name, type and e-mail matches stay.
    expect(filter.$or).toContainEqual({ userName: { $regex: CHOICE_REF, $options: "i" } });
    expect(filter.$or).toContainEqual({ consentType: { $regex: CHOICE_REF, $options: "i" } });
    expect(filter.$or).toContainEqual({ userId: { $in: ["64d000000000000000000003"] } });
  });

  it("GET /api/admin/gdpr/consent finds a reference typed in upper case: ids are written lower-case, so it is lower-cased first", async () => {
    const { GET } = await import("@/app/api/admin/gdpr/consent/route");
    await GET(new NextRequest(`http://localhost:3000/api/admin/gdpr/consent?search=${CHOICE_REF.toUpperCase()}`), { params: Promise.resolve({}) });

    const filter = consentFind.mock.calls.at(-1)?.[0] as { $or: Array<Record<string, unknown>> };
    expect(filter.$or).toContainEqual({ receiptId: CHOICE_REF });
    expect(filter.$or).not.toContainEqual({ receiptId: CHOICE_REF.toUpperCase() });
  });

  it("GET /api/admin/gdpr/consent trims the typed reference before matching it", async () => {
    const { GET } = await import("@/app/api/admin/gdpr/consent/route");
    await GET(new NextRequest(`http://localhost:3000/api/admin/gdpr/consent?search=%20${CHOICE_REF}%20`), { params: Promise.resolve({}) });

    const filter = consentFind.mock.calls.at(-1)?.[0] as { $or: unknown[] };
    expect(filter.$or).toContainEqual({ receiptId: CHOICE_REF });
  });

  it.each([
    ["the start of a reference", CHOICE_REF.slice(0, 8)],
    ["a name", "sara"],
    ["a Mongo operator", "$ne"],
  ])("GET /api/admin/gdpr/consent adds no reference match for %s", async (_label, search) => {
    const { GET } = await import("@/app/api/admin/gdpr/consent/route");
    await GET(new NextRequest(`http://localhost:3000/api/admin/gdpr/consent?search=${encodeURIComponent(search)}`), { params: Promise.resolve({}) });

    const filter = consentFind.mock.calls.at(-1)?.[0] as { $or: Array<Record<string, unknown>> };
    expect(filter.$or.some((clause) => "receiptId" in clause)).toBe(false);
  });

  it("GET /api/admin/gdpr/consent never sends an IP address (still stored on sign-up and terms rows)", async () => {
    const { GET } = await import("@/app/api/admin/gdpr/consent/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/admin/gdpr/consent?page=1&limit=10"), { params: Promise.resolve({}) });
    const text = await res.text();

    expect(text).not.toContain("10.0.0.1");
    expect(JSON.parse(text).items[0]).not.toHaveProperty("ipAddress");
  });

  it("GET /api/admin/gdpr/consent lists only the consents that are not cookie choices when asked for the other consents", async () => {
    const { GET } = await import("@/app/api/admin/gdpr/consent/route");
    await GET(new NextRequest("http://localhost:3000/api/admin/gdpr/consent?type=other"), { params: Promise.resolve({}) });

    expect(consentFind).toHaveBeenLastCalledWith(expect.objectContaining({
      consentType: { $nin: ["cookies.preferences", "cookies.media"] },
    }));
  });

  it.each([
    ["the consent list", "@/app/api/admin/gdpr/consent/route", "consent", consentFind],
    ["the request list", "@/app/api/admin/gdpr/route", "", gdprFind],
  ])("GET %s gives a 100-row page (the largest rows-per-page option) and no more", async (_label, mod, path, find) => {
    const { GET } = (await import(mod)) as { GET: (req: NextRequest, ctx: unknown) => Promise<Response> };
    const q = chain([]);
    (find as jest.Mock).mockImplementation(() => q);
    await GET(new NextRequest(`http://localhost:3000/api/admin/gdpr/${path}?page=2&limit=100`), { params: Promise.resolve({}) });
    expect(q.limit).toHaveBeenLastCalledWith(100);
    expect(q.skip).toHaveBeenLastCalledWith(100);

    await GET(new NextRequest(`http://localhost:3000/api/admin/gdpr/${path}?page=1&limit=500`), { params: Promise.resolve({}) });
    expect(q.limit).toHaveBeenLastCalledWith(100);
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

    const res = await PATCH(patchReq(REQUEST_ID, { status: "completed", outcome: "Export sent" }), { params: Promise.resolve({ id: REQUEST_ID }) });
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.request.status).toBe("completed");
    expect(payload.request.completedAt).toBeTruthy();
    expect(payload.request.outcome).toBe("Export sent");
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
