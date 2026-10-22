/**
 * @jest-environment node
 *
 * Data requests record what the team did: an outcome, the reason a request was
 * refused or only partly done, and internal notes. The user's own deletion
 * reason (`notes`) is never overwritten, a refusal needs a reason, and the
 * user's own request list carries the reason but never the internal notes.
 */
import { NextRequest, NextResponse } from "next/server";

const ADMIN_ID = "64d000000000000000000001";
const SUBJECT_ID = "64d000000000000000000003";
const REQUEST_ID = "64d000000000000000000002";
const USER_REASON = "Moving abroad, please delete everything";
const INTERNAL = "Spoke to legal, keep the invoices for 6 years";

let ctxRole = "admin";
let ctxUserId = ADMIN_ID;

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
const logActivity = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ actorId: ctx.userId, actorRole: ctx.role })),
  logActivity: (...a: unknown[]) => logActivity(...a),
}));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
jest.mock("@/lib/auth/withAuth", () => ({
  // The options are kept on the handler so a test can read the permission gate.
  withAuth: (
    handler: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => Promise<Response>,
    options?: unknown,
  ) => {
    const wrapped = async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
      const params = context ? await context.params : {};
      try {
        return await handler(req, { userId: ctxUserId, role: ctxRole, locale: "en" }, params);
      } catch (err) {
        if (err instanceof NextResponse) return err;
        throw err;
      }
    };
    (wrapped as unknown as { gate: unknown }).gate = options;
    return wrapped;
  },
}));

const erase = jest.fn();
jest.mock("@/lib/gdpr/erasure", () => ({ eraseUserPersonalData: (...a: unknown[]) => erase(...a) }));

function chain(result: unknown) {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["sort", "skip", "limit", "select", "populate"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn().mockResolvedValue(result);
  return c;
}

let requestDoc: Record<string, unknown> & { save: jest.Mock };
let ownRows: unknown[] = [];
let listChain: ReturnType<typeof chain>;
const gdprFindById = jest.fn(async () => requestDoc);
const gdprClaim = jest.fn();
const gdprUpdateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
const gdprUpdateMany = jest.fn().mockResolvedValue({ modifiedCount: 0 });
jest.mock("@/models/GdprRequest", () => ({
  __esModule: true,
  ...jest.requireActual("@/models/GdprRequest"),
  default: {
    find: jest.fn(() => listChain),
    findById: (...a: unknown[]) => gdprFindById(...(a as [])),
    findOneAndUpdate: (...a: unknown[]) => gdprClaim(...a),
    updateOne: (...a: unknown[]) => gdprUpdateOne(...a),
    updateMany: (...a: unknown[]) => gdprUpdateMany(...a),
  },
}));

let subjectRole = "job_seeker";
// Set when the account was already erased (a failed erasure leaves the request in progress).
let subjectDeletedAt: Date | undefined;
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { findById: jest.fn(() => chain({ _id: SUBJECT_ID, role: subjectRole, deletedAt: subjectDeletedAt })) },
}));

const patchReq = (body: unknown) =>
  new NextRequest(`http://localhost/api/admin/gdpr/${REQUEST_ID}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const params = { params: Promise.resolve({ id: REQUEST_ID }) };
const noParams = { params: Promise.resolve({}) };

beforeEach(() => {
  jest.clearAllMocks();
  ctxRole = "admin";
  ctxUserId = ADMIN_ID;
  subjectRole = "job_seeker";
  subjectDeletedAt = undefined;
  ownRows = [];
  listChain = chain(ownRows);
  gdprClaim.mockImplementation(async () => requestDoc);
  requestDoc = {
    _id: REQUEST_ID,
    userId: SUBJECT_ID,
    userName: "Sara Ahmed",
    userEmail: "sara@example.com",
    requestType: "export",
    status: "in_progress",
    notes: USER_REASON,
    createdAt: new Date("2026-08-01T10:00:00Z"),
    save: jest.fn().mockResolvedValue(undefined),
  };
});

describe("Admin PATCH /api/admin/gdpr/[id] — rejecting needs a reason", () => {
  it("answers 400 in plain words when a request is rejected without a reason, and changes nothing", async () => {
    const { PATCH } = await import("@/app/api/admin/gdpr/[id]/route");
    const res = await PATCH(patchReq({ status: "rejected" }), params);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body)).toMatch(/couldn't/i);
    expect(JSON.stringify(body)).not.toMatch(/failed to/i);
    expect(body.details).toEqual([expect.objectContaining({ path: "outcomeReason" })]);
    expect(gdprFindById).not.toHaveBeenCalled();
    expect(requestDoc.save).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });

  it.each([["an empty reason", ""], ["a blank reason", "   \n  "]])("answers 400 for %s", async (_label, outcomeReason) => {
    const { PATCH } = await import("@/app/api/admin/gdpr/[id]/route");
    const res = await PATCH(patchReq({ status: "rejected", outcomeReason }), params);

    expect(res.status).toBe(400);
    expect(requestDoc.save).not.toHaveBeenCalled();
  });

  it("stores the reason when a request is rejected with one, and keeps the user's own words", async () => {
    const { PATCH } = await import("@/app/api/admin/gdpr/[id]/route");
    const res = await PATCH(
      patchReq({ status: "rejected", outcomeReason: "  We could not confirm who you are.  ", adminNotes: INTERNAL }),
      params,
    );

    expect(res.status).toBe(200);
    expect(requestDoc).toMatchObject({
      status: "rejected",
      outcomeReason: "We could not confirm who you are.",
      adminNotes: INTERNAL,
      handledBy: ADMIN_ID,
      notes: USER_REASON,
    });
    expect(requestDoc.save).toHaveBeenCalledTimes(1);
    const payload = await res.json();
    expect(payload.request).toMatchObject({ status: "rejected", outcomeReason: "We could not confirm who you are." });
  });

  it.each(["in_progress", "pending"])("records when a %s request was refused (completedAt is the decision date) and returns it", async (from) => {
    requestDoc.status = from;
    const before = Date.now();
    const { PATCH } = await import("@/app/api/admin/gdpr/[id]/route");
    const res = await PATCH(patchReq({ status: "rejected", outcomeReason: "We could not verify you." }), params);

    expect(res.status).toBe(200);
    expect(requestDoc.completedAt).toBeInstanceOf(Date);
    expect((requestDoc.completedAt as Date).getTime()).toBeGreaterThanOrEqual(before);
    expect(requestDoc.save).toHaveBeenCalledTimes(1);
    expect((await res.json()).request.completedAt).toBeTruthy();
  });

  it("refuses to reject a deletion request whose account was already erased: the erasure must be finished instead", async () => {
    requestDoc.requestType = "delete";
    subjectDeletedAt = new Date("2026-10-20T10:00:00Z");
    const { PATCH } = await import("@/app/api/admin/gdpr/[id]/route");
    const res = await PATCH(patchReq({ status: "rejected", outcomeReason: "We could not verify you." }), params);

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("ERASURE_STARTED");
    expect(requestDoc.save).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });

  it("does not ask for a reason on the other moves", async () => {
    requestDoc.status = "pending";
    const { PATCH } = await import("@/app/api/admin/gdpr/[id]/route");
    const res = await PATCH(patchReq({ status: "in_progress" }), params);
    expect(res.status).toBe(200);
  });
});

describe("Admin PATCH /api/admin/gdpr/[id] — completing records what was done", () => {
  it("stores the outcome, the reason and the internal notes", async () => {
    const { PATCH } = await import("@/app/api/admin/gdpr/[id]/route");
    const res = await PATCH(
      patchReq({
        status: "completed",
        outcome: "Sent the data export by email",
        outcomeReason: "Invoices were kept: the law requires it",
        adminNotes: INTERNAL,
      }),
      params,
    );

    expect(res.status).toBe(200);
    expect(requestDoc).toMatchObject({
      status: "completed",
      outcome: "Sent the data export by email",
      outcomeReason: "Invoices were kept: the law requires it",
      adminNotes: INTERNAL,
      notes: USER_REASON,
    });
    expect(requestDoc.completedAt).toBeInstanceOf(Date);
  });

  it("completes with none of the three, and stores no empty fields", async () => {
    const { PATCH } = await import("@/app/api/admin/gdpr/[id]/route");
    const res = await PATCH(patchReq({ status: "completed", outcome: "  ", adminNotes: "" }), params);

    expect(res.status).toBe(200);
    expect(requestDoc.status).toBe("completed");
    expect(requestDoc).not.toHaveProperty("outcome");
    expect(requestDoc).not.toHaveProperty("outcomeReason");
    expect(requestDoc).not.toHaveProperty("adminNotes");
  });

  it.each([
    ["outcome", 1001],
    ["outcomeReason", 1001],
    ["adminNotes", 2001],
  ])("refuses %s longer than the model allows", async (field, length) => {
    const { PATCH } = await import("@/app/api/admin/gdpr/[id]/route");
    const res = await PATCH(patchReq({ status: "completed", [field]: "x".repeat(length) }), params);

    expect(res.status).toBe(400);
    expect(requestDoc.save).not.toHaveBeenCalled();
  });

  it("takes the longest values the model allows", async () => {
    const { PATCH } = await import("@/app/api/admin/gdpr/[id]/route");
    const res = await PATCH(
      patchReq({ status: "completed", outcome: "x".repeat(1000), outcomeReason: "y".repeat(1000), adminNotes: "z".repeat(2000) }),
      params,
    );
    expect(res.status).toBe(200);
  });

  it("can never change the user's own reason: a client-sent notes field is stripped", async () => {
    const { PATCH } = await import("@/app/api/admin/gdpr/[id]/route");
    const res = await PATCH(patchReq({ status: "completed", notes: "Overwritten by an admin" }), params);

    expect(res.status).toBe(200);
    expect(requestDoc.notes).toBe(USER_REASON);
    expect((await res.json()).request.notes).toBe(USER_REASON);
  });

  it("strips notes on a rejection too", async () => {
    const { PATCH } = await import("@/app/api/admin/gdpr/[id]/route");
    await PATCH(patchReq({ status: "rejected", outcomeReason: "No", notes: "Overwritten by an admin" }), params);

    expect(requestDoc.notes).toBe(USER_REASON);
  });
});

describe("Admin PATCH /api/admin/gdpr/[id] — the audit entry", () => {
  it("carries the outcome text and reason, and says only that internal notes were set", async () => {
    const { PATCH } = await import("@/app/api/admin/gdpr/[id]/route");
    await PATCH(
      patchReq({ status: "completed", outcome: "Sent the export", outcomeReason: "Kept the invoices", adminNotes: INTERNAL }),
      params,
    );

    expect(logActivity).toHaveBeenCalledTimes(1);
    const entry = logActivity.mock.calls[0][0] as { action: string; changes: { before: unknown; after: Record<string, unknown> } };
    expect(entry.action).toBe("gdpr.request.status_changed");
    expect(entry.changes.before).toEqual({ status: "in_progress" });
    expect(entry.changes.after).toEqual({
      status: "completed",
      outcome: "Sent the export",
      outcomeReason: "Kept the invoices",
      adminNotesSet: true,
    });
    // The internal notes text itself is never written to the immutable log.
    expect(JSON.stringify(entry)).not.toContain(INTERNAL);
  });

  it("stays as before when nothing was recorded", async () => {
    const { PATCH } = await import("@/app/api/admin/gdpr/[id]/route");
    await PATCH(patchReq({ status: "completed" }), params);

    const entry = logActivity.mock.calls[0][0] as { changes: { after: Record<string, unknown> } };
    expect(entry.changes.after).toEqual({ status: "completed" });
  });
});

describe("Admin PATCH /api/admin/gdpr/[id] — erasure and the permission gate", () => {
  it("still erases the account, audits it, and now records the outcome beside the anonymised identity", async () => {
    requestDoc.requestType = "delete";
    requestDoc.status = "pending";
    erase.mockResolvedValue({ anonymizedEmail: `deleted_${SUBJECT_ID}@anonymized.mployedin.com` });
    const { PATCH } = await import("@/app/api/admin/gdpr/[id]/route");
    const res = await PATCH(
      patchReq({ status: "completed", outcome: "Account erased", outcomeReason: "Invoices kept", adminNotes: INTERNAL, notes: "ignored" }),
      params,
    );

    expect(res.status).toBe(200);
    expect(gdprClaim).toHaveBeenCalledWith(
      { _id: REQUEST_ID, status: "pending" },
      { $set: expect.objectContaining({ status: "in_progress" }) },
    );
    expect(erase).toHaveBeenCalledWith(SUBJECT_ID);
    expect(gdprUpdateOne).toHaveBeenCalledWith(
      { _id: REQUEST_ID },
      {
        $set: expect.objectContaining({
          status: "completed",
          userName: "Deleted User",
          userEmail: `deleted_${SUBJECT_ID}@anonymized.mployedin.com`,
          outcome: "Account erased",
          outcomeReason: "Invoices kept",
          adminNotes: INTERNAL,
        }),
        // The user's own words and the address they filed from go with the rest of their data, whatever a client sends.
        $unset: { notes: 1, ipAddress: 1 },
      },
    );
    expect(((gdprUpdateOne.mock.calls[0][1] as { $set: Record<string, unknown> }).$set)).not.toHaveProperty("notes");
    const entry = logActivity.mock.calls[0][0] as { meta: Record<string, unknown>; changes: { after: Record<string, unknown> } };
    expect(entry.meta).toMatchObject({ requestType: "delete", erasurePerformed: true });
    expect(entry.changes.after).toMatchObject({ status: "completed", outcome: "Account erased", adminNotesSet: true });
    expect(JSON.stringify(entry)).not.toContain(INTERNAL);
    const payload = await res.json();
    expect(payload.request).toMatchObject({ status: "completed", userName: "Deleted User", outcome: "Account erased" });
    expect(payload.request.notes).toBeUndefined();
  });

  it("completes an erasure with no outcome fields exactly as before", async () => {
    requestDoc.requestType = "delete";
    erase.mockResolvedValue({ anonymizedEmail: "deleted_x@anonymized.mployedin.com" });
    const { PATCH } = await import("@/app/api/admin/gdpr/[id]/route");
    const res = await PATCH(patchReq({ status: "completed" }), params);

    expect(res.status).toBe(200);
    const [, update] = gdprUpdateOne.mock.calls[0] as [unknown, { $set: Record<string, unknown>; $unset: unknown }];
    expect(Object.keys(update.$set).sort()).toEqual(["completedAt", "handledBy", "status", "userEmail", "userName"]);
    // Deliberately changed: the erasure also unsets the stored IP address (Art 17).
    expect(update.$unset).toEqual({ notes: 1, ipAddress: 1 });
  });

  it("anonymises the person's other requests too: name, e-mail, their own words and IP address", async () => {
    requestDoc.requestType = "delete";
    erase.mockResolvedValue({ anonymizedEmail: `deleted_${SUBJECT_ID}@anonymized.mployedin.com` });
    const { PATCH } = await import("@/app/api/admin/gdpr/[id]/route");
    const res = await PATCH(patchReq({ status: "completed", outcome: "Account erased" }), params);

    expect(res.status).toBe(200);
    expect(gdprUpdateMany).toHaveBeenCalledTimes(1);
    expect(gdprUpdateMany).toHaveBeenCalledWith(
      { userId: SUBJECT_ID, _id: { $ne: REQUEST_ID } },
      {
        $set: { userName: "Deleted User", userEmail: `deleted_${SUBJECT_ID}@anonymized.mployedin.com` },
        $unset: { notes: 1, ipAddress: 1 },
      },
    );
    // Only the identity and the person's own data: the other rows keep status, outcome and the admin's record.
    const update = gdprUpdateMany.mock.calls[0][1] as { $set: Record<string, unknown> };
    expect(Object.keys(update.$set).sort()).toEqual(["userEmail", "userName"]);
  });

  it("keeps this request's own outcome, reason and internal notes through an erasure", async () => {
    requestDoc.requestType = "delete";
    erase.mockResolvedValue({ anonymizedEmail: "deleted_x@anonymized.mployedin.com" });
    const { PATCH } = await import("@/app/api/admin/gdpr/[id]/route");
    await PATCH(patchReq({ status: "completed", outcome: "Erased", outcomeReason: "Invoices kept", adminNotes: INTERNAL }), params);

    const [, update] = gdprUpdateOne.mock.calls[0] as [unknown, { $set: Record<string, unknown>; $unset: Record<string, unknown> }];
    expect(update.$set).toMatchObject({ outcome: "Erased", outcomeReason: "Invoices kept", adminNotes: INTERNAL });
    expect(update.$unset).not.toHaveProperty("outcome");
    expect(update.$unset).not.toHaveProperty("adminNotes");
  });

  it("touches no other request when the request is only rejected", async () => {
    requestDoc.requestType = "delete";
    const { PATCH } = await import("@/app/api/admin/gdpr/[id]/route");
    await PATCH(patchReq({ status: "rejected", outcomeReason: "We could not verify you." }), params);

    expect(gdprUpdateMany).not.toHaveBeenCalled();
  });

  it("never erases when the request is only rejected, and needs no erasure to record the reason", async () => {
    requestDoc.requestType = "delete";
    const { PATCH } = await import("@/app/api/admin/gdpr/[id]/route");
    const res = await PATCH(patchReq({ status: "rejected", outcomeReason: "We could not verify you." }), params);

    expect(res.status).toBe(200);
    expect(erase).not.toHaveBeenCalled();
    expect(requestDoc.outcomeReason).toBe("We could not verify you.");
    expect(requestDoc.notes).toBe(USER_REASON);
  });

  it("still never erases an admin account", async () => {
    requestDoc.requestType = "delete";
    subjectRole = "admin";
    const { PATCH } = await import("@/app/api/admin/gdpr/[id]/route");
    const res = await PATCH(patchReq({ status: "completed", outcome: "Done" }), params);

    expect(res.status).toBe(409);
    expect(erase).not.toHaveBeenCalled();
    expect(gdprUpdateOne).not.toHaveBeenCalled();
    expect(gdprUpdateMany).not.toHaveBeenCalled();
  });

  it("leaves the request in progress for a retry when anonymising the other requests fails: no completion, no audit", async () => {
    requestDoc.requestType = "delete";
    erase.mockResolvedValue({ anonymizedEmail: "deleted_x@anonymized.mployedin.com" });
    gdprUpdateMany.mockRejectedValueOnce(new Error("db down"));
    const { PATCH } = await import("@/app/api/admin/gdpr/[id]/route");
    const res = await PATCH(patchReq({ status: "completed", outcome: "Account erased" }), params);

    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe("ERASURE_FAILED");
    // The request is only claimed (in_progress); it was never marked completed, so an admin can run it again.
    expect(gdprClaim).toHaveBeenCalledTimes(1);
    expect(gdprUpdateOne).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });

  it("anonymises the other requests before it marks this one completed", async () => {
    requestDoc.requestType = "delete";
    erase.mockResolvedValue({ anonymizedEmail: "deleted_x@anonymized.mployedin.com" });
    const { PATCH } = await import("@/app/api/admin/gdpr/[id]/route");
    await PATCH(patchReq({ status: "completed" }), params);

    expect(gdprUpdateMany.mock.invocationCallOrder[0]).toBeLessThan(gdprUpdateOne.mock.invocationCallOrder[0]);
  });

  it("keeps the permission gate: users:update, admins only", async () => {
    const { PATCH } = await import("@/app/api/admin/gdpr/[id]/route");
    expect((PATCH as unknown as { gate: unknown }).gate).toEqual({ resource: "users", action: "update" });

    ctxRole = "super_agent";
    const res = await PATCH(patchReq({ status: "rejected", outcomeReason: "No" }), params);
    expect(res.status).toBe(403);
    expect(gdprFindById).not.toHaveBeenCalled();
  });
});

describe("GET /api/gdpr/requests — the user's own list", () => {
  const row = (over: Record<string, unknown>) => ({
    _id: REQUEST_ID,
    requestType: "delete",
    createdAt: new Date("2026-08-01"),
    completedAt: new Date("2026-08-03"),
    outcome: "Account erased",
    outcomeReason: "Invoices were kept: the law requires it",
    adminNotes: INTERNAL,
    ...over,
  });

  const list = async () => {
    ctxRole = "job_seeker";
    ctxUserId = SUBJECT_ID;
    const { GET } = await import("@/app/api/gdpr/requests/route");
    const res = await GET(new NextRequest("http://localhost/api/gdpr/requests"), noParams);
    return { res, text: await res.clone().text(), body: await res.json() };
  };

  it("returns the outcome and the reason for a rejected request, and never the internal notes", async () => {
    listChain = chain([row({ status: "rejected", outcome: undefined, outcomeReason: "We could not verify who you are." })]);
    const { body, text } = await list();

    expect(body.requests[0]).toMatchObject({ status: "rejected", outcomeReason: "We could not verify who you are." });
    expect(text).not.toContain(INTERNAL);
    expect(body.requests[0]).not.toHaveProperty("adminNotes");
  });

  it("returns them for a completed request that has them", async () => {
    listChain = chain([row({ status: "completed" })]);
    const { body } = await list();

    expect(body.requests[0]).toMatchObject({
      outcome: "Account erased",
      outcomeReason: "Invoices were kept: the law requires it",
    });
  });

  it("asks the database for neither the internal notes nor anything it does not show", async () => {
    listChain = chain([row({ status: "completed" })]);
    await list();

    const selected = listChain.select.mock.calls.map((c) => String(c[0])).join(" ");
    expect(selected).toContain("outcome");
    expect(selected).toContain("outcomeReason");
    expect(selected).not.toContain("adminNotes");
  });

  it("returns null for a request that is not finished: nothing half-written is shown", async () => {
    listChain = chain([row({ status: "in_progress" })]);
    const { body } = await list();

    expect(body.requests[0].outcome).toBeNull();
    expect(body.requests[0].outcomeReason).toBeNull();
  });

  it("returns null when nothing was recorded", async () => {
    listChain = chain([row({ status: "completed", outcome: undefined, outcomeReason: undefined })]);
    const { body } = await list();

    expect(body.requests[0].outcome).toBeNull();
    expect(body.requests[0].outcomeReason).toBeNull();
  });
});
