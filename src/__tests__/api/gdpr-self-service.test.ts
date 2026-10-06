/**
 * @jest-environment node
 *
 * GDPR self-service: a user asks for deletion (a pending request an admin
 * completes — nothing is erased on the spot), can withdraw it until an admin
 * starts, and admins hear about it. Completing the request in the admin
 * register is what erases the account; admin accounts are never erased. The
 * consent endpoint shows Terms & Privacy and cookies, and takes cookies only.
 */
import { NextRequest, NextResponse } from "next/server";

const USER_ID = "64f000000000000000000001";
const OTHER_ID = "64f000000000000000000009";
const REQUEST_ID = "64f000000000000000000002";
let ctxRole = "job_seeker";
let ctxUserId = USER_ID;

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/security/clientIp", () => ({ getClientIp: () => "10.0.0.1" }));
const logActivity = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ actorId: ctx.userId, actorRole: ctx.role })),
  logActivity: (...a: unknown[]) => logActivity(...a),
}));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => Promise<Response>) =>
    async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
      const params = context ? await context.params : {};
      try {
        return await handler(req, { userId: ctxUserId, role: ctxRole, locale: "en" }, params);
      } catch (err) {
        if (err instanceof NextResponse) return err;
        throw err;
      }
    },
}));

const notifyAdmins = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/notifications/trigger", () => ({
  notifyAdminsGdprDeletionRequest: (...a: unknown[]) => notifyAdmins(...a),
}));
const erase = jest.fn();
jest.mock("@/lib/gdpr/erasure", () => ({ eraseUserPersonalData: (...a: unknown[]) => erase(...a) }));

function chain(result: unknown) {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["sort", "skip", "limit", "select", "populate"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn().mockResolvedValue(result);
  return c;
}

let openRequest: unknown = null;
let ownRequests: unknown[] = [];
let requestDoc: Record<string, unknown> & { save: jest.Mock };
const gdprCreate = jest.fn(async (doc: Record<string, unknown>) => ({ _id: REQUEST_ID, ...doc }));
const gdprFindOne = jest.fn();
const gdprClaim = jest.fn();
const gdprUpdateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
jest.mock("@/models/GdprRequest", () => ({
  __esModule: true,
  ...jest.requireActual("@/models/GdprRequest"),
  default: {
    create: (...a: [Record<string, unknown>]) => gdprCreate(...a),
    find: jest.fn(() => chain(ownRequests)),
    findOne: (...a: unknown[]) => gdprFindOne(...a),
    findById: jest.fn(async () => requestDoc),
    findOneAndUpdate: (...a: unknown[]) => gdprClaim(...a),
    updateOne: (...a: unknown[]) => gdprUpdateOne(...a),
  },
}));

let subjectRole = "job_seeker";
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(() => chain({ _id: USER_ID, name: "Sara Ahmed", email: "sara@example.com", role: subjectRole })),
  },
}));

let latestConsents: Record<string, unknown> = {};
const consentCreate = jest.fn().mockResolvedValue({});
jest.mock("@/models/ConsentLog", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn((q: { consentType: string }) => chain(latestConsents[q.consentType] ?? null)),
    create: (...a: unknown[]) => consentCreate(...a),
  },
}));

function req(url: string, method = "GET", body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
const noParams = { params: Promise.resolve({}) };

beforeEach(() => {
  jest.clearAllMocks();
  ctxRole = "job_seeker";
  ctxUserId = USER_ID;
  subjectRole = "job_seeker";
  openRequest = null;
  ownRequests = [];
  latestConsents = {};
  // The helper looks for an open request with .select().lean(); the cancel
  // route awaits findOne directly and needs a saveable document.
  gdprFindOne.mockImplementation(() => Object.assign(Promise.resolve(requestDoc), chain(openRequest)));
  gdprClaim.mockImplementation(async () => requestDoc);
  requestDoc = {
    _id: REQUEST_ID,
    userId: USER_ID,
    userName: "Sara Ahmed",
    userEmail: "sara@example.com",
    requestType: "delete",
    status: "pending",
    save: jest.fn().mockResolvedValue(undefined),
  };
});

describe("POST /api/gdpr/requests", () => {
  it("opens a pending deletion request, audits it and tells the admins — nothing is erased", async () => {
    const { POST } = await import("@/app/api/gdpr/requests/route");
    const res = await POST(req("/api/gdpr/requests", "POST", { requestType: "delete", reason: "Found a job" }), noParams);

    expect(res.status).toBe(202);
    expect(gdprCreate).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_ID,
      userEmail: "sara@example.com",
      requestType: "delete",
      status: "pending",
      notes: "Found a job",
    }));
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "gdpr.deletion_requested" }));
    expect(notifyAdmins).toHaveBeenCalledWith("Sara Ahmed", REQUEST_ID);
    expect(erase).not.toHaveBeenCalled();
  });

  it("refuses a second request while one is open", async () => {
    openRequest = { _id: REQUEST_ID };
    const { POST } = await import("@/app/api/gdpr/requests/route");
    const res = await POST(req("/api/gdpr/requests", "POST", { requestType: "delete" }), noParams);

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("REQUEST_OPEN");
    expect(gdprCreate).not.toHaveBeenCalled();
  });

  it("refuses admins", async () => {
    ctxRole = "admin";
    const { POST } = await import("@/app/api/gdpr/requests/route");
    const res = await POST(req("/api/gdpr/requests", "POST", { requestType: "delete" }), noParams);

    expect(res.status).toBe(403);
    expect(gdprCreate).not.toHaveBeenCalled();
  });

  it("still succeeds when the admin notification fails", async () => {
    notifyAdmins.mockRejectedValueOnce(new Error("bell down"));
    const { POST } = await import("@/app/api/gdpr/requests/route");
    const res = await POST(req("/api/gdpr/requests", "POST", { requestType: "delete" }), noParams);
    expect(res.status).toBe(202);
  });

  it("DELETE /api/gdpr/export takes the same path", async () => {
    const { DELETE } = await import("@/app/api/gdpr/export/route");
    const res = await DELETE(req("/api/gdpr/export", "DELETE"), noParams);

    expect(res.status).toBe(202);
    expect(gdprCreate).toHaveBeenCalledWith(expect.objectContaining({ requestType: "delete", status: "pending" }));
    expect(erase).not.toHaveBeenCalled();
  });
});

describe("GET /api/gdpr/requests", () => {
  it("lists only the caller's requests", async () => {
    ownRequests = [{ _id: REQUEST_ID, requestType: "delete", status: "pending", createdAt: new Date("2026-09-01") }];
    const GdprRequest = (await import("@/models/GdprRequest")).default as unknown as { find: jest.Mock };
    const { GET } = await import("@/app/api/gdpr/requests/route");
    const res = await GET(req("/api/gdpr/requests"), noParams);

    expect(GdprRequest.find).toHaveBeenCalledWith({ userId: USER_ID });
    const body = await res.json();
    expect(body.requests).toEqual([expect.objectContaining({ _id: REQUEST_ID, requestType: "delete", status: "pending", completedAt: null })]);
  });
});

describe("PATCH /api/gdpr/requests/[id]", () => {
  const params = { params: Promise.resolve({ id: REQUEST_ID }) };

  it("lets the owner cancel a pending request", async () => {
    const { PATCH } = await import("@/app/api/gdpr/requests/[id]/route");
    const res = await PATCH(req(`/api/gdpr/requests/${REQUEST_ID}`, "PATCH", { action: "cancel" }), params);

    expect(res.status).toBe(200);
    expect(gdprFindOne).toHaveBeenCalledWith({ _id: REQUEST_ID, userId: USER_ID });
    expect(requestDoc.status).toBe("cancelled");
    expect(requestDoc.save).toHaveBeenCalled();
  });

  it("won't cancel once an admin has started", async () => {
    requestDoc.status = "in_progress";
    const { PATCH } = await import("@/app/api/gdpr/requests/[id]/route");
    const res = await PATCH(req(`/api/gdpr/requests/${REQUEST_ID}`, "PATCH", { action: "cancel" }), params);

    expect(res.status).toBe(409);
    expect(requestDoc.save).not.toHaveBeenCalled();
  });

  it("reads someone else's request as not found", async () => {
    ctxUserId = OTHER_ID;
    gdprFindOne.mockImplementation(() => Object.assign(Promise.resolve(null), chain(null)));
    const { PATCH } = await import("@/app/api/gdpr/requests/[id]/route");
    const res = await PATCH(req(`/api/gdpr/requests/${REQUEST_ID}`, "PATCH", { action: "cancel" }), params);

    expect(res.status).toBe(404);
    expect(gdprFindOne).toHaveBeenCalledWith({ _id: REQUEST_ID, userId: OTHER_ID });
  });
});

describe("Admin PATCH /api/admin/gdpr/[id] — completing a deletion request", () => {
  const params = { params: Promise.resolve({ id: REQUEST_ID }) };

  it("claims the request, erases the account, then records completion with only the anonymised identity", async () => {
    ctxRole = "admin";
    requestDoc.status = "pending";
    erase.mockResolvedValue({ anonymizedEmail: `deleted_${USER_ID}@anonymized.mployedin.com` });
    const { PATCH } = await import("@/app/api/admin/gdpr/[id]/route");
    const res = await PATCH(req(`/api/admin/gdpr/${REQUEST_ID}`, "PATCH", { status: "completed" }), params);

    expect(res.status).toBe(200);
    // Claimed first (status still what the admin saw), so the user can no longer cancel it.
    expect(gdprClaim).toHaveBeenCalledWith(
      { _id: REQUEST_ID, status: "pending" },
      { $set: expect.objectContaining({ status: "in_progress" }) },
    );
    expect(erase).toHaveBeenCalledWith(USER_ID);
    expect(gdprUpdateOne).toHaveBeenCalledWith({ _id: REQUEST_ID }, expect.objectContaining({ $set: expect.objectContaining({
      status: "completed",
      userName: "Deleted User",
      userEmail: `deleted_${USER_ID}@anonymized.mployedin.com`,
    }) }));
    expect((await res.json()).request).toMatchObject({ status: "completed", userName: "Deleted User" });
  });

  it("erases the reason the user typed along with the rest of their data", async () => {
    // Free text in the user's own words can name them; the anonymised record
    // keeps only what was done, when and by whom.
    ctxRole = "admin";
    requestDoc.status = "pending";
    (requestDoc as Record<string, unknown>).notes = "Moving to 12 King St, call me on 0501234567";
    erase.mockResolvedValue({ anonymizedEmail: `deleted_${USER_ID}@anonymized.mployedin.com` });
    const { PATCH } = await import("@/app/api/admin/gdpr/[id]/route");
    const res = await PATCH(req(`/api/admin/gdpr/${REQUEST_ID}`, "PATCH", { status: "completed" }), params);

    expect(res.status).toBe(200);
    expect(gdprUpdateOne).toHaveBeenCalledWith({ _id: REQUEST_ID }, expect.objectContaining({ $unset: { notes: 1 } }));
    expect((await res.json()).request.notes).toBeUndefined();
  });

  it("refuses when the request changed underneath (e.g. the user cancelled it)", async () => {
    ctxRole = "admin";
    gdprClaim.mockResolvedValue(null);
    const { PATCH } = await import("@/app/api/admin/gdpr/[id]/route");
    const res = await PATCH(req(`/api/admin/gdpr/${REQUEST_ID}`, "PATCH", { status: "completed" }), params);

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("STALE");
    expect(erase).not.toHaveBeenCalled();
  });

  it("never erases an admin account", async () => {
    ctxRole = "admin";
    subjectRole = "admin";
    requestDoc.status = "in_progress";
    const { PATCH } = await import("@/app/api/admin/gdpr/[id]/route");
    const res = await PATCH(req(`/api/admin/gdpr/${REQUEST_ID}`, "PATCH", { status: "completed" }), params);

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("ADMIN_ACCOUNT");
    expect(gdprClaim).not.toHaveBeenCalled();
    expect(erase).not.toHaveBeenCalled();
    expect(requestDoc.save).not.toHaveBeenCalled();
  });

  it("leaves the request in progress for a retry when erasure fails", async () => {
    ctxRole = "admin";
    requestDoc.status = "in_progress";
    erase.mockRejectedValue(new Error("db down"));
    const { PATCH } = await import("@/app/api/admin/gdpr/[id]/route");
    const res = await PATCH(req(`/api/admin/gdpr/${REQUEST_ID}`, "PATCH", { status: "completed" }), params);

    expect(res.status).toBe(500);
    expect(gdprUpdateOne).not.toHaveBeenCalled();
    expect(requestDoc.save).not.toHaveBeenCalled();
  });
});

describe("/api/user/consent", () => {
  it("GET returns the latest Terms & Privacy and cookie answers, null when never recorded", async () => {
    latestConsents = { terms_and_privacy: { granted: true, createdAt: new Date("2026-09-20T08:00:00Z"), source: "registration" } };
    const { GET } = await import("@/app/api/user/consent/route");
    const body = await (await GET(req("/api/user/consent"), noParams)).json();

    expect(body.consents.terms_and_privacy).toEqual({ granted: true, at: "2026-09-20T08:00:00.000Z", source: "registration" });
    expect(body.consents.cookies).toBeNull();
    expect(body.consents).not.toHaveProperty("marketing");
  });

  it("POST records a cookie change from the privacy page", async () => {
    const { POST } = await import("@/app/api/user/consent/route");
    const res = await POST(req("/api/user/consent", "POST", { consentType: "cookies", granted: false, source: "privacy_settings" }), noParams);

    expect(res.status).toBe(200);
    expect(consentCreate).toHaveBeenCalledWith(expect.objectContaining({ consentType: "cookies", granted: false, source: "privacy_settings" }));
  });

  it("POST won't take Terms & Privacy — that is recorded at sign-up", async () => {
    const { POST } = await import("@/app/api/user/consent/route");
    const res = await POST(req("/api/user/consent", "POST", { consentType: "terms_and_privacy", granted: true }), noParams);

    expect(res.status).toBe(400);
    expect(consentCreate).not.toHaveBeenCalled();
  });
});
