/**
 * @jest-environment node
 *
 * Public, unauthenticated response endpoint reached from the invitation email.
 * It replaces mail-client RSVP (which would post an iTIP reply into a mailbox
 * nobody reads) and must behave itself without a session:
 *
 *  - only POST mutates, because scanners prefetch links in email
 *  - the token is validated by shape before it reaches a query
 *  - a wrong token is indistinguishable from a missing interview
 *  - answering twice is not an error, but it does not rewrite history
 */
import { NextRequest } from "next/server";

const TOKEN = "abcdefghijklmnopqrstuvwxyz012345";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));

jest.mock("@/lib/security/rateLimit", () => ({
  withRateLimit: (handler: Function) => handler,
  checkRateLimitDual: jest.fn(async () => ({ allowed: true, remaining: 9, resetAt: Date.now() + 1000 })),
  RATE_LIMIT_CONFIGS: { default: { maxRequests: 10, windowMs: 60000 } },
}));

jest.mock("@/lib/audit/log", () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
  actorFromCtx: jest.fn(() => ({})),
}));

jest.mock("@/lib/notifications/trigger", () => ({ notify: jest.fn().mockResolvedValue(undefined) }));

jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

let interviewRow: Record<string, unknown> | null = null;

jest.mock("@/models/Interview", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({
      select: () => ({ populate: () => ({ lean: async () => interviewRow }), lean: async () => interviewRow }),
      populate: () => ({ lean: async () => interviewRow }),
      lean: async () => interviewRow,
    })),
    // Declared inside the factory: jest hoists `jest.mock` above the imports,
    // so a const from the module scope is still in its TDZ when this runs.
    updateOne: jest.fn(async () => ({ modifiedCount: 1 })),
  },
}));

import { GET, POST } from "@/app/api/interviews/response/[token]/route";
import Interview from "@/models/Interview";

const updateOne = (Interview as unknown as { updateOne: jest.Mock }).updateOne;

function post(token: string, body: unknown) {
  const req = new NextRequest(`http://localhost/api/interviews/response/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(req, { params: Promise.resolve({ token }) } as never);
}

const FUTURE = new Date(Date.now() + 7 * 24 * 3600_000);

describe("POST /api/interviews/response/[token]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    interviewRow = {
      _id: "iv_1",
      scheduledAt: FUTURE,
      status: "scheduled",
      candidateResponse: "pending",
    };
  });

  it("records a confirmation", async () => {
    const res = await post(TOKEN, { response: "confirmed" });
    expect(res.status).toBe(200);
    expect(updateOne).toHaveBeenCalledWith(
      { _id: "iv_1" },
      expect.objectContaining({
        $set: expect.objectContaining({ candidateResponse: "confirmed" }),
      }),
    );
  });

  it("records a decline", async () => {
    const res = await post(TOKEN, { response: "declined" });
    expect(res.status).toBe(200);
    expect(updateOne.mock.calls[0][1].$set.candidateResponse).toBe("declined");
  });

  it("carries a reschedule note", async () => {
    const res = await post(TOKEN, { response: "reschedule_requested", note: "I am away that week" });
    expect(res.status).toBe(200);
    expect(updateOne.mock.calls[0][1].$set.candidateRescheduleNote).toBe("I am away that week");
  });

  it("rejects a response value it does not know", async () => {
    const res = await post(TOKEN, { response: "maybe" });
    expect(res.status).toBe(400);
    expect(updateOne).not.toHaveBeenCalled();
  });

  it("rejects a malformed token before touching the database", async () => {
    const Interview = (await import("@/models/Interview")).default as never as { findOne: jest.Mock };
    const res = await post("../../etc/passwd", { response: "confirmed" });
    expect(res.status).toBe(404);
    expect(Interview.findOne).not.toHaveBeenCalled();
  });

  it("gives the same answer for an unknown token as for a deleted interview", async () => {
    interviewRow = null;
    const res = await post(TOKEN, { response: "confirmed" });
    expect(res.status).toBe(404);
    expect(updateOne).not.toHaveBeenCalled();
  });

  it("refuses a cancelled interview", async () => {
    interviewRow = { _id: "iv_1", scheduledAt: FUTURE, status: "cancelled", candidateResponse: "pending" };
    const res = await post(TOKEN, { response: "confirmed" });
    expect(res.status).toBe(409);
    expect(updateOne).not.toHaveBeenCalled();
  });

  it("refuses an interview that already happened", async () => {
    interviewRow = {
      _id: "iv_1",
      scheduledAt: new Date(Date.now() - 3600_000),
      status: "scheduled",
      candidateResponse: "pending",
    };
    const res = await post(TOKEN, { response: "confirmed" });
    expect(res.status).toBe(409);
    expect(updateOne).not.toHaveBeenCalled();
  });

  it("lets a candidate change their mind", async () => {
    interviewRow = { _id: "iv_1", scheduledAt: FUTURE, status: "scheduled", candidateResponse: "confirmed" };
    const res = await post(TOKEN, { response: "declined" });
    expect(res.status).toBe(200);
    expect(updateOne.mock.calls[0][1].$set.candidateResponse).toBe("declined");
  });
});

function get(token: string) {
  const req = new NextRequest(`http://localhost/api/interviews/response/${token}`);
  return GET(req, { params: Promise.resolve({ token }) } as never);
}

describe("GET /api/interviews/response/[token]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    interviewRow = {
      _id: "iv_1",
      scheduledAt: FUTURE,
      status: "scheduled",
      candidateResponse: "pending",
      duration: 30,
    };
  });

  it("previews the invitation without writing anything", async () => {
    const res = await get(TOKEN);
    expect(res.status).toBe(200);
    expect(updateOne).not.toHaveBeenCalled();
  });

  it("never leaks the token back to the page", async () => {
    const res = await get(TOKEN);
    expect(JSON.stringify(await res.json())).not.toContain(TOKEN);
  });

  it("404s an unknown token", async () => {
    interviewRow = null;
    expect((await get(TOKEN)).status).toBe(404);
  });

  it("404s a malformed token without querying", async () => {
    const I = (await import("@/models/Interview")).default as never as { findOne: jest.Mock };
    expect((await get("nope")).status).toBe(404);
    expect(I.findOne).not.toHaveBeenCalled();
  });

  it("reports an interview that can no longer be answered rather than failing", async () => {
    interviewRow = { _id: "iv_1", scheduledAt: FUTURE, status: "cancelled", candidateResponse: "pending" };
    const res = await get(TOKEN);
    expect(res.status).toBe(200);
    expect((await res.json()).answerable).toBe(false);
  });
});
