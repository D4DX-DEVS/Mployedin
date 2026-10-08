/**
 * @jest-environment node
 */
import { NextRequest, NextResponse } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));

const logActivity = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/audit/log", () => ({ logActivity: (...a: unknown[]) => logActivity(...a) }));

const checkRateLimit = jest.fn();
jest.mock("@/lib/security/rateLimit", () => ({ checkRateLimit: (...a: unknown[]) => checkRateLimit(...a) }));

// Session fallback: null → unauthenticated (withAuth's 401), else the given role.
let sessionRole: string | null = null;
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: unknown, ctx: unknown, params: unknown) => Promise<Response>) =>
    async (req: unknown, context: { params: Promise<Record<string, string>> }) => {
      const { NextResponse: NR } = jest.requireActual("next/server");
      if (!sessionRole) return NR.json({ error: "Unauthorized" }, { status: 401 });
      return handler(req, { userId: "65f0000000000000000000aa", role: sessionRole, locale: "en" }, await context.params);
    },
}));

const findOneLean = jest.fn();
const updateOneExec = jest.fn().mockResolvedValue({});
jest.mock("@/models/PlatformApiKey", () => {
  const actual = jest.requireActual("@/models/PlatformApiKey");
  const model = {
    findOne: jest.fn(() => ({ select: () => ({ lean: () => findOneLean() }) })),
    updateOne: jest.fn(() => ({ exec: updateOneExec })),
  };
  return {
    __esModule: true,
    default: model,
    PlatformApiKey: model,
    PLATFORM_API_KEY_PATTERN: actual.PLATFORM_API_KEY_PATTERN,
    hashPlatformApiKey: actual.hashPlatformApiKey,
    generatePlatformApiKey: actual.generatePlatformApiKey,
  };
});

import { withInsightsKey } from "@/lib/insights/auth";
import { generatePlatformApiKey } from "@/models/PlatformApiKey";

const route = withInsightsKey(async (_req, ctx) => NextResponse.json({ pii: ctx.pii, via: ctx.via, keyId: ctx.keyId ?? null }));
const call = (headers: Record<string, string> = {}) =>
  route(new NextRequest("http://localhost/api/insights/overview?x=1", { headers }), { params: Promise.resolve({}) });

const { key: VALID_KEY, keyHash: VALID_HASH, keyPrefix } = generatePlatformApiKey();
const keyRow = (over: Record<string, unknown> = {}) => ({
  _id: "65f0000000000000000000bb",
  keyHash: VALID_HASH,
  keyPrefix,
  scopes: ["insights:read"],
  isActive: true,
  rateLimitPerMin: 120,
  createdBy: "65f0000000000000000000aa",
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  sessionRole = null;
  checkRateLimit.mockResolvedValue({ allowed: true, remaining: 119, resetAt: Date.now() + 60_000 });
});

describe("withInsightsKey — API key auth", () => {
  it("401 missing_key when no key and no session", async () => {
    const res = await call();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: expect.any(String), code: "missing_key" });
  });

  it("401 invalid_key for a malformed key without touching the DB", async () => {
    const res = await call({ authorization: "Bearer mpd_notaplatformkey" });
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("invalid_key");
    expect(findOneLean).not.toHaveBeenCalled();
  });

  it("401 invalid_key for an unknown well-formed key", async () => {
    findOneLean.mockResolvedValue(null);
    const res = await call({ authorization: `Bearer ${VALID_KEY}` });
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("invalid_key");
  });

  it("403 key_revoked for an inactive key", async () => {
    findOneLean.mockResolvedValue(keyRow({ isActive: false }));
    const res = await call({ authorization: `Bearer ${VALID_KEY}` });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("key_revoked");
  });

  it("403 key_expired for an expired key", async () => {
    findOneLean.mockResolvedValue(keyRow({ expiresAt: new Date(Date.now() - 1000) }));
    const res = await call({ "x-api-key": VALID_KEY });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("key_expired");
  });

  it("403 insufficient_scope without insights:read", async () => {
    findOneLean.mockResolvedValue(keyRow({ scopes: ["pii:read"] }));
    const res = await call({ "x-api-key": VALID_KEY });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("insufficient_scope");
  });

  it("429 rate_limited with Retry-After when the per-key budget is spent", async () => {
    findOneLean.mockResolvedValue(keyRow({ rateLimitPerMin: 10 }));
    checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() + 30_000 });
    const res = await call({ authorization: `Bearer ${VALID_KEY}` });
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("rate_limited");
    expect(res.headers.get("Retry-After")).toBeTruthy();
    expect(checkRateLimit).toHaveBeenCalledWith("65f0000000000000000000bb", expect.objectContaining({ limit: 10, windowSec: 60 }));
  });

  it("200 for a valid key: redacted by default, usage counted, request audited", async () => {
    findOneLean.mockResolvedValue(keyRow());
    const res = await call({ authorization: `Bearer ${VALID_KEY}` });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pii: false, via: "api_key", keyId: "65f0000000000000000000bb" });
    expect(res.headers.get("X-RateLimit-Limit")).toBe("120");
    expect(updateOneExec).toHaveBeenCalled();
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "insights.read",
        resource: "insights",
        resourceId: "65f0000000000000000000bb",
        meta: expect.objectContaining({ endpoint: "/api/insights/overview", keyId: "65f0000000000000000000bb", status: 200, ip: expect.any(String) }),
      }),
    );
  });

  it("pii:read scope un-redacts", async () => {
    findOneLean.mockResolvedValue(keyRow({ scopes: ["insights:read", "pii:read"] }));
    const res = await call({ "x-api-key": VALID_KEY });
    expect((await res.json()).pii).toBe(true);
  });
});

describe("withInsightsKey — admin session fallback", () => {
  it("allows an admin session (for the admin UI 'Try it')", async () => {
    sessionRole = "admin";
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(expect.objectContaining({ via: "admin_session" }));
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "insights.read" }));
  });

  it("403 for a non-admin session", async () => {
    sessionRole = "employer";
    const res = await call();
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("forbidden");
  });
});
