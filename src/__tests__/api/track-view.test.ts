/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));

const authMock = jest.fn();
jest.mock("@/lib/auth/config", () => ({ auth: (...args: unknown[]) => authMock(...args) }));

const rateLimitMock = jest.fn();
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimit: (...args: unknown[]) => rateLimitMock(...args),
}));

// The real in-memory markOnce, wrapped so a test can make it fail.
const markOnceMock = jest.fn();
jest.mock("@/lib/security/markOnce", () => {
  const actual = jest.requireActual("@/lib/security/markOnce");
  markOnceMock.mockImplementation(actual.markOnce);
  return { __esModule: true, ...actual, markOnce: (...args: unknown[]) => markOnceMock(...args) };
});

const updateOneMock = jest.fn();
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: { updateOne: (...args: unknown[]) => updateOneMock(...args) },
}));

const loggerWarn = jest.fn();
jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: {
    warn: (...args: unknown[]) => loggerWarn(...args),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

const JOB_ID = "507f1f77bcf86cd799439011";
const OTHER_JOB_ID = "507f1f77bcf86cd799439012";
const USER_ID = "607f1f77bcf86cd799439021";

/** Matches `jv=` as a cookie name at the start of a Set-Cookie line or after a comma. */
const JV_COOKIE = /(^|,\s*)jv=/;

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost:3000/api/jobs/${JOB_ID}/track-view`, {
    method: "POST",
    headers,
  });
}

async function track(id = JOB_ID, headers: Record<string, string> = {}): Promise<Response> {
  const { POST } = await import("@/app/api/jobs/[id]/track-view/route");
  return POST(makeRequest(headers), { params: Promise.resolve({ id }) });
}

function setCookieHeader(res: Response): string {
  return [res.headers.get("set-cookie") ?? "", ...(res.headers.getSetCookie?.() ?? [])].join(", ");
}

function lastInc(): Record<string, number> {
  const call = updateOneMock.mock.calls[updateOneMock.mock.calls.length - 1];
  return (call[1] as { $inc: Record<string, number> }).$inc;
}

/** The `$inc` of every updateOne call, in order. */
function incs(): Record<string, number>[] {
  return updateOneMock.mock.calls.map((c) => (c[1] as { $inc: Record<string, number> }).$inc);
}

/** Sum of one counter over every updateOne call: what the job ends up with. */
function totalOf(field: string): number {
  return incs().reduce((sum, inc) => sum + (inc[field] ?? 0), 0);
}

describe("POST /api/jobs/[id]/track-view", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    // Fresh route + markOnce modules, so each test starts with an empty dedupe store.
    jest.resetModules();
    delete process.env.TRUSTED_PROXY_HOPS;
    delete process.env.TRUSTED_CLIENT_IP_HEADER;
    delete process.env.VERCEL;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    authMock.mockResolvedValue(null);
    rateLimitMock.mockResolvedValue({ allowed: true, remaining: 29, resetAt: Date.now() + 60_000 });
    updateOneMock.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("no tracking cookie", () => {
    it("sets no jv cookie for an anonymous visitor", async () => {
      const res = await track();

      expect(res.status).toBe(200);
      expect(setCookieHeader(res)).not.toMatch(JV_COOKIE);
      expect(res.headers.get("set-cookie")).toBeNull();
    });

    it("sets no jv cookie for a signed-in visitor", async () => {
      authMock.mockResolvedValue({ user: { id: USER_ID } });

      const res = await track();

      expect(res.status).toBe(200);
      expect(setCookieHeader(res)).not.toMatch(JV_COOKIE);
      expect(res.headers.get("set-cookie")).toBeNull();
    });

    it("ignores an old jv cookie the browser still carries", async () => {
      const res = await track(JOB_ID, { cookie: `jv=${JOB_ID}` });

      expect(res.status).toBe(200);
      expect(setCookieHeader(res)).not.toMatch(JV_COOKIE);
      // An old cookie does not make the visit "not unique"; anonymous never counts unique.
      expect(lastInc()).toEqual({ views: 1 });
    });
  });

  describe("counting", () => {
    it("counts only views for an anonymous visitor, every time", async () => {
      await track();
      await track();

      expect(updateOneMock).toHaveBeenCalledTimes(2);
      for (const call of updateOneMock.mock.calls) {
        expect(call[0]).toEqual({ _id: JOB_ID, status: "active" });
        expect(call[1]).toEqual({ $inc: { views: 1 } });
      }
      expect(markOnceMock).not.toHaveBeenCalled();
    });

    it("counts a signed-in viewer's first visit as a view and a unique viewer", async () => {
      authMock.mockResolvedValue({ user: { id: USER_ID } });

      await track();

      expect(updateOneMock).toHaveBeenCalledTimes(2);
      expect(updateOneMock).toHaveBeenNthCalledWith(1, { _id: JOB_ID, status: "active" }, { $inc: { views: 1 } });
      expect(updateOneMock).toHaveBeenNthCalledWith(2, { _id: JOB_ID }, { $inc: { uniqueViews: 1 } });
    });

    it("counts a signed-in double view as two views but one unique viewer", async () => {
      authMock.mockResolvedValue({ user: { id: USER_ID } });

      await track();
      await track();

      expect(incs()).toEqual([{ views: 1 }, { uniqueViews: 1 }, { views: 1 }]);
      expect(totalOf("views")).toBe(2);
      expect(totalOf("uniqueViews")).toBe(1);
    });

    it("counts the same user again on a different job, and a different user on the same job", async () => {
      authMock.mockResolvedValue({ user: { id: USER_ID } });
      await track(JOB_ID);
      await track(OTHER_JOB_ID);
      authMock.mockResolvedValue({ user: { id: "707f1f77bcf86cd799439031" } });
      await track(JOB_ID);

      expect(totalOf("views")).toBe(3);
      expect(totalOf("uniqueViews")).toBe(3);
    });

    it("does not touch the dedupe store for an unknown or inactive job", async () => {
      authMock.mockResolvedValue({ user: { id: USER_ID } });
      updateOneMock.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

      const res = await track(OTHER_JOB_ID);

      expect(res.status).toBe(200);
      expect(markOnceMock).not.toHaveBeenCalled();
      expect(updateOneMock).toHaveBeenCalledTimes(1);
      expect(updateOneMock).toHaveBeenCalledWith({ _id: OTHER_JOB_ID, status: "active" }, { $inc: { views: 1 } });
    });

    it("marks the viewer only after the job matched, so a repeat is still unique-counted once the job is live", async () => {
      authMock.mockResolvedValue({ user: { id: USER_ID } });
      updateOneMock.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 });

      await track(); // job not active yet: nothing marked
      await track(); // now active: first real visit counts as unique

      expect(markOnceMock).toHaveBeenCalledTimes(1);
      expect(totalOf("uniqueViews")).toBe(1);
    });

    it("dedupes on job + user for 24 hours and stores nothing else about the visitor", async () => {
      authMock.mockResolvedValue({ user: { id: USER_ID } });
      // The header is trusted here, so the key really had the address to leave out.
      process.env.TRUSTED_CLIENT_IP_HEADER = "cf-connecting-ip";

      await track(JOB_ID, { "cf-connecting-ip": "203.0.113.9", "user-agent": "Mozilla/5.0" });

      expect(markOnceMock).toHaveBeenCalledTimes(1);
      const [key, ttl] = markOnceMock.mock.calls[0] as [string, number];
      expect(key).toContain(JOB_ID);
      expect(key).toContain(USER_ID);
      expect(key).not.toContain("203.0.113.9");
      expect(key).not.toContain("Mozilla");
      expect(ttl).toBe(86_400);
    });

    it("still counts the view, but not a unique viewer, when the dedupe store fails", async () => {
      authMock.mockResolvedValue({ user: { id: USER_ID } });
      markOnceMock.mockRejectedValueOnce(new Error("redis down"));

      const res = await track();

      expect(res.status).toBe(200);
      expect(updateOneMock).toHaveBeenCalledTimes(1);
      expect(updateOneMock.mock.calls[0][1]).toEqual({ $inc: { views: 1 } });
    });

    it("logs a warning, and does not throw, when the dedupe store fails", async () => {
      authMock.mockResolvedValue({ user: { id: USER_ID } });
      const failure = new Error("redis down");
      markOnceMock.mockRejectedValueOnce(failure);

      await expect(track()).resolves.toBeDefined();

      expect(loggerWarn).toHaveBeenCalledTimes(1);
      expect(loggerWarn).toHaveBeenCalledWith(
        { err: failure },
        expect.stringContaining("couldn't check whether this viewer was already counted"),
      );
    });

    it("does not warn when the dedupe store works", async () => {
      authMock.mockResolvedValue({ user: { id: USER_ID } });

      await track();

      expect(loggerWarn).not.toHaveBeenCalled();
    });

    it("treats a failing session lookup as an anonymous visitor", async () => {
      authMock.mockRejectedValue(new Error("session store down"));

      const res = await track();

      expect(res.status).toBe(200);
      expect(updateOneMock.mock.calls[0][1]).toEqual({ $inc: { views: 1 } });
      expect(markOnceMock).not.toHaveBeenCalled();
    });

    it("treats a session whose user id is empty as an anonymous visitor", async () => {
      authMock.mockResolvedValue({ user: { id: "" } });

      const res = await track();

      expect(res.status).toBe(200);
      expect(markOnceMock).not.toHaveBeenCalled();
      expect(incs()).toEqual([{ views: 1 }]);
    });

    it("treats a session with no user at all as an anonymous visitor", async () => {
      authMock.mockResolvedValue({ expires: "2026-10-22T00:00:00Z" });

      await track();

      expect(markOnceMock).not.toHaveBeenCalled();
      expect(incs()).toEqual([{ views: 1 }]);
    });
  });

  describe("rate limit", () => {
    it("keys the per-visitor limit on the trusted client IP", async () => {
      process.env.TRUSTED_CLIENT_IP_HEADER = "cf-connecting-ip";
      await track(JOB_ID, { "cf-connecting-ip": "203.0.113.9" });

      expect(rateLimitMock).toHaveBeenCalledWith("203.0.113.9", { limit: 30, windowSec: 60, prefix: "tview" });
    });

    it("never trusts a spoofable x-forwarded-for: with no trusted proxy it uses one global bucket", async () => {
      await track(JOB_ID, { "x-forwarded-for": "198.51.100.77" });

      expect(rateLimitMock).toHaveBeenCalledTimes(1);
      expect(rateLimitMock).toHaveBeenCalledWith("direct", { limit: 600, windowSec: 60, prefix: "tview-global" });
    });

    it("answers 429 and counts nothing when the limit is hit", async () => {
      rateLimitMock.mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000 });

      const res = await track();

      expect(res.status).toBe(429);
      expect(updateOneMock).not.toHaveBeenCalled();
    });
  });

  describe("validation", () => {
    it("answers 400 for an id that is not an ObjectId and counts nothing", async () => {
      const res = await track("not-a-job-id");

      expect(res.status).toBe(400);
      expect(updateOneMock).not.toHaveBeenCalled();
      expect(res.headers.get("set-cookie")).toBeNull();
    });
  });
});
