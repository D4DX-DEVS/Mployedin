/**
 * @jest-environment node
 */
import { NextRequest, NextResponse } from "next/server";
import { WhatsAppApiError } from "@/lib/communications/whatsapp/errors";

let ctxRole = "admin";
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
const logActivity = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/audit/log", () => ({ logActivity: (...a: unknown[]) => logActivity(...a), actorFromCtx: () => ({ userId: "admin1", userRole: "admin" }) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) => async (req: NextRequest) => {
    try { return await handler(req, { userId: "admin1", role: ctxRole, locale: "en" }); } catch (err) { if (err instanceof NextResponse) return err; throw err; }
  },
}));
const aggregate = jest.fn();
const find = jest.fn();
const countDocuments = jest.fn().mockResolvedValue(2);
jest.mock("@/models/WhatsAppMessageLog", () => {
  // The enum lists are the model's own; only the collection methods are faked.
  const actual = jest.requireActual("@/models/WhatsAppMessageLog");
  return {
    __esModule: true,
    WHATSAPP_MESSAGE_STATUSES: actual.WHATSAPP_MESSAGE_STATUSES,
    WHATSAPP_SOURCES: actual.WHATSAPP_SOURCES,
    default: { aggregate: (...a: unknown[]) => aggregate(...a), find: (...a: unknown[]) => find(...a), countDocuments: (...a: unknown[]) => countDocuments(...a) },
  };
});
const getWhatsAppSettings = jest.fn(async () => ({ enabled: true, dailyCapPerUser: 3, automations: {} }));
jest.mock("@/models/SystemConfig", () => ({ getWhatsAppSettings: () => getWhatsAppSettings() }));
const userFind = jest.fn();
jest.mock("@/models/User", () => ({ __esModule: true, default: { find: (...a: unknown[]) => userFind(...a) } }));
/** What `User.find(...).select(...).lean()` resolves to. */
const accounts = (rows: unknown[]) => ({ select: () => ({ lean: async () => rows }) });
const isWhatsAppEnabled = jest.fn(() => true);
jest.mock("@/lib/communications/whatsapp/config", () => ({ isWhatsAppEnabled: () => isWhatsAppEnabled(), whatsAppMode: () => (isWhatsAppEnabled() ? "live" : "mock") }));
const getPhoneNumberInfo = jest.fn().mockResolvedValue({ verifiedName: "MPLOYEDIN", qualityRating: "GREEN" });
jest.mock("@/lib/communications/whatsapp/cloudApi", () => ({ getPhoneNumberInfo: () => getPhoneNumberInfo() }));
const sendWhatsAppTemplate = jest.fn().mockResolvedValue({ status: "sent", messageId: "wamid.t" });
jest.mock("@/lib/communications/whatsapp/send", () => ({ sendWhatsAppTemplate: (...a: unknown[]) => sendWhatsAppTemplate(...a) }));
const checkRateLimit = jest.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 1000 });
const isNumberSuppressed = jest.fn().mockResolvedValue(false);
jest.mock("@/models/WhatsAppSuppression", () => ({ __esModule: true, isNumberSuppressed: (...a: unknown[]) => isNumberSuppressed(...a) }));
jest.mock("@/lib/security/rateLimit", () => ({ checkRateLimit: (...a: unknown[]) => checkRateLimit(...a) }));

import { GET as STATUS } from "@/app/api/admin/whatsapp/status/route";
import { GET as LOGS } from "@/app/api/admin/whatsapp/logs/route";
import { POST as TEST } from "@/app/api/admin/whatsapp/test/route";

const noParams = { params: Promise.resolve({}) };
const skip = jest.fn();
const limit = jest.fn();
const sort = jest.fn();
const lean = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  ctxRole = "admin";
  isWhatsAppEnabled.mockReturnValue(true);
  aggregate.mockReset();
  aggregate
    .mockResolvedValueOnce([{ _id: "sent", count: 4 }, { _id: "failed", count: 1 }])
    .mockResolvedValueOnce([{ _id: "daily_cap", count: 3 }]);
  lean.mockResolvedValue([{ to: "+971" }]);
  limit.mockReturnValue({ lean });
  skip.mockReturnValue({ limit });
  sort.mockReturnValue({ skip });
  find.mockReturnValue({ sort });
  userFind.mockReturnValue(accounts([]));
  isNumberSuppressed.mockResolvedValue(false);
  getWhatsAppSettings.mockImplementation(async () => ({ enabled: true, dailyCapPerUser: 3, automations: {} }));
});

describe("GET /api/admin/whatsapp/status", () => {
  const get = () => STATUS(new NextRequest("http://x/api/admin/whatsapp/status"), noParams);

  it("combines config, Meta phone info and 24 h counters", async () => {
    const res = await get();
    const body = await res.json();
    expect(body).toEqual({
      configured: true, mode: "live", enabled: true,
      phone: { verifiedName: "MPLOYEDIN", qualityRating: "GREEN" }, phoneError: null,
      last24h: { sent: 4, delivered: 0, read: 0, failed: 1, skipped: 0, mock: 0 },
      skipReasons: [{ reason: "daily_cap", count: 3 }],
    });
  });
  it("reports the Meta error instead of failing when the phone lookup breaks", async () => {
    getPhoneNumberInfo.mockRejectedValueOnce(new Error("Invalid OAuth access token"));
    const body = await (await get()).json();
    expect(body.phone).toBeNull();
    expect(body.phoneError).toMatch(/OAuth/);
  });
  it("skips the Meta call in mock mode", async () => {
    isWhatsAppEnabled.mockReturnValue(false);
    const body = await (await get()).json();
    expect(getPhoneNumberInfo).not.toHaveBeenCalled();
    expect(body.mode).toBe("mock");
    expect(body.configured).toBe(false);
    expect(body.phone).toBeNull();
    expect(body.phoneError).toBeNull();
  });
  it("403s non-admins before touching the database or Meta", async () => {
    ctxRole = "super_agent";
    expect((await get()).status).toBe(403);
    expect(aggregate).not.toHaveBeenCalled();
    expect(getPhoneNumberInfo).not.toHaveBeenCalled();
  });
  it("gives a Graph error as a short classified message with its kind, not Meta's text", async () => {
    getPhoneNumberInfo.mockRejectedValueOnce(new WhatsAppApiError({ code: 190, message: "Error validating access token: Session has expired", httpStatus: 401 }));
    const body = await (await get()).json();
    expect(body.phone).toBeNull();
    expect(body.phoneErrorKind).toBe("auth");
    expect(body.phoneError).toBe("Meta API error (auth, code 190, HTTP 401)");
    expect(JSON.stringify(body)).not.toMatch(/Session has expired/);
  });
  it("leaves phoneErrorKind off when the failure is not a Graph answer", async () => {
    getPhoneNumberInfo.mockRejectedValueOnce(new Error("The operation was aborted due to timeout"));
    const body = await (await get()).json();
    expect(body.phoneError).toBe("The operation was aborted due to timeout");
    expect(body).not.toHaveProperty("phoneErrorKind");
  });
  it("redacts a bearer token that a fetch TypeError echoed back", async () => {
    getPhoneNumberInfo.mockRejectedValueOnce(new TypeError('Headers.append: "Bearer EAABsecret123token" is an invalid header value.'));
    const body = await (await get()).json();
    expect(body.phoneError).not.toMatch(/EAABsecret123token/);
    expect(body.phoneError).toMatch(/invalid header value/);
  });
  it("counts only known statuses and labels a skip with no reason", async () => {
    aggregate.mockReset();
    aggregate
      .mockResolvedValueOnce([{ _id: "read", count: 2 }, { _id: "bounced", count: 9 }, { _id: null, count: 1 }])
      .mockResolvedValueOnce([{ _id: null, count: 2 }, { _id: "invalid_phone", count: 1 }]);
    const body = await (await get()).json();
    expect(body.last24h).toEqual({ sent: 0, delivered: 0, read: 2, failed: 0, skipped: 0, mock: 0 });
    expect(body.skipReasons).toEqual([{ reason: "unknown", count: 2 }, { reason: "invalid_phone", count: 1 }]);
  });
  it("windows both aggregates to the last 24 hours", async () => {
    const before = Date.now();
    await get();
    const [counts, skips] = aggregate.mock.calls.map((c) => c[0] as Array<Record<string, { sentAt?: { $gte: Date }; status?: string }>>);
    for (const since of [counts[0].$match.sentAt!.$gte, skips[0].$match.sentAt!.$gte]) {
      expect(before - since.getTime()).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 5);
      expect(before - since.getTime()).toBeLessThan(24 * 60 * 60 * 1000 + 5000);
    }
    expect(skips[0].$match.status).toBe("skipped");
  });
});

describe("GET /api/admin/whatsapp/logs", () => {
  const get = (qs = "") => LOGS(new NextRequest(`http://x/api/admin/whatsapp/logs${qs}`), noParams);

  it("403s non-admins and paginates with filters", async () => {
    ctxRole = "agent";
    expect((await get()).status).toBe(403);
    expect(find).not.toHaveBeenCalled();
    ctxRole = "admin";
    const res = await get("?page=2&limit=10&status=failed&source=broadcast");
    const body = await res.json();
    expect(find).toHaveBeenCalledWith({ status: "failed", source: "broadcast" });
    expect(body.pagination).toEqual({ page: 2, limit: 10, total: 2, totalPages: 1 });
    expect(body.logs).toHaveLength(1);
    expect(body.success).toBe(true);
  });
  it("sorts newest first and turns page and limit into skip and limit", async () => {
    await get("?page=3&limit=20");
    expect(sort).toHaveBeenCalledWith({ sentAt: -1 });
    expect(skip).toHaveBeenCalledWith(40);
    expect(limit).toHaveBeenCalledWith(20);
  });
  it("caps the page so a huge value cannot force an unbounded skip", async () => {
    const res = await get("?page=99999999&limit=30");
    expect(skip).toHaveBeenLastCalledWith((10_000 - 1) * 30);
    expect((await res.json()).pagination.page).toBe(10_000);
    await get("?page=10000&limit=100");
    expect(skip).toHaveBeenLastCalledWith(9_999 * 100);
  });
  it("caps the limit and falls back on junk paging values", async () => {
    await get("?limit=100000&page=0");
    expect(limit).toHaveBeenLastCalledWith(100);
    expect(skip).toHaveBeenLastCalledWith(0);
    await get("?limit=abc&page=-4");
    expect(limit).toHaveBeenLastCalledWith(30);
    expect(skip).toHaveBeenLastCalledWith(0);
    await get("?limit=0");
    expect(limit).toHaveBeenLastCalledWith(30);
  });
  it("drops filter values that are not allowed values or an ObjectId, so nothing reaches Mongo as an operator", async () => {
    await get("?status=$ne&source=x&userId=abc");
    await get("?status[$ne]=sent&source[$gt]=&userId[$ne]=1");
    await get(`?status=${encodeURIComponent('{"$ne":"sent"}')}&userId=${encodeURIComponent("{$ne:1}")}`);
    await get("?userId=507f1f77bcf86cd79943901");
    expect(find.mock.calls).toEqual([[{}], [{}], [{}], [{}]]);
  });
  it("keeps a well-formed userId and every allowed status and source", async () => {
    await get("?userId=507f1f77bcf86cd799439011&status=skipped&source=auto_reply");
    expect(find).toHaveBeenLastCalledWith({ userId: "507f1f77bcf86cd799439011", status: "skipped", source: "auto_reply" });
    for (const status of ["sent", "delivered", "read", "failed", "skipped", "mock"]) {
      await get(`?status=${status}`);
      expect(find).toHaveBeenLastCalledWith({ status });
    }
    for (const source of ["orchestrator", "broadcast", "schedule", "test", "auto_reply"]) {
      await get(`?source=${source}`);
      expect(find).toHaveBeenLastCalledWith({ source });
    }
  });
  it("counts with the same filter and reports at least one page when empty", async () => {
    countDocuments.mockResolvedValueOnce(0);
    lean.mockResolvedValueOnce([]);
    const body = await (await get("?status=failed")).json();
    expect(countDocuments).toHaveBeenCalledWith({ status: "failed" });
    expect(body.pagination).toEqual({ page: 1, limit: 30, total: 0, totalPages: 1 });
    expect(body.logs).toEqual([]);
  });
  it("scrubs a token out of a stored errorMessage and leaves other rows as they are", async () => {
    lean.mockResolvedValueOnce([
      { to: "+971501234567", status: "failed", errorMessage: 'Headers.append: "Bearer EAABsecret123token" is an invalid header value.' },
      { to: "+971507654321", status: "failed", errorMessage: "(#132001) Template name does not exist" },
      { to: "+971509999999", status: "sent" },
    ]);
    const { logs } = await (await get()).json();
    expect(JSON.stringify(logs)).not.toContain("EAABsecret123token");
    expect(logs[0].errorMessage).toBe('Headers.append: "Bearer [redacted]" is an invalid header value.');
    expect(logs[1].errorMessage).toBe("(#132001) Template name does not exist");
    expect(logs[2]).toEqual({ to: "+971509999999", status: "sent" });
  });
  it("rounds the page count up", async () => {
    countDocuments.mockResolvedValueOnce(61);
    const body = await (await get("?limit=30")).json();
    expect(body.pagination.totalPages).toBe(3);
  });
});

describe("POST /api/admin/whatsapp/test", () => {
  const post = (body: unknown) => TEST(new NextRequest("http://x/api/admin/whatsapp/test", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }), noParams);

  it("sends the chosen template to the number and audits with a masked phone", async () => {
    const res = await post({ to: "+971501234567", templateName: "hello_world", language: "en_US" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ outcome: { status: "sent", messageId: "wamid.t" } });
    expect(sendWhatsAppTemplate).toHaveBeenCalledWith({ to: "+971501234567", templateName: "hello_world", language: "en_US", params: [], source: "test", category: "system", userId: "admin1" });
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.whatsapp.test_send", resource: "notifications", changes: { after: { to: "+9715••••••67", templateName: "hello_world", status: "sent" } } }));
    expect(JSON.stringify(logActivity.mock.calls)).not.toContain("501234567");
  });
  it("defaults the template and language when the admin only types a number", async () => {
    await post({ to: "+971501234567" });
    expect(sendWhatsAppTemplate).toHaveBeenCalledWith(expect.objectContaining({ templateName: "hello_world", language: "en_US", params: [] }));
  });
  it("passes template params through", async () => {
    await post({ to: "+971501234567", templateName: "order_update", language: "ar", params: ["Sara", "42"] });
    expect(sendWhatsAppTemplate).toHaveBeenCalledWith(expect.objectContaining({ templateName: "order_update", language: "ar", params: ["Sara", "42"] }));
  });
  it("answers mock-mode sends as a success", async () => {
    sendWhatsAppTemplate.mockResolvedValueOnce({ status: "mock", messageId: "mock-1" });
    const res = await post({ to: "+971501234567" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ outcome: { status: "mock", messageId: "mock-1" } });
  });
  it("surfaces Meta's error as 502", async () => {
    sendWhatsAppTemplate.mockResolvedValueOnce({ status: "failed", error: new Error("(#132001) Template name does not exist"), errorKind: "template_error" });
    const res = await post({ to: "+971501234567", templateName: "nope", language: "en" });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Meta rejected the message: (#132001) Template name does not exist", errorKind: "template_error" });
  });
  it("audits a failed send too, with the failed status", async () => {
    sendWhatsAppTemplate.mockResolvedValueOnce({ status: "failed", error: new Error("nope"), errorKind: "unknown" });
    await post({ to: "+971501234567" });
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ changes: { after: expect.objectContaining({ status: "failed" }) } }));
  });
  it("omits errorKind from a 502 when the failure was not a Graph answer", async () => {
    sendWhatsAppTemplate.mockResolvedValueOnce({ status: "failed", error: new Error("Recipient phone is not a valid international number") });
    const res = await post({ to: "+971501234567" });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Meta rejected the message: Recipient phone is not a valid international number" });
  });
  it("redacts a bearer token that a fetch TypeError echoed back", async () => {
    sendWhatsAppTemplate.mockResolvedValueOnce({ status: "failed", error: new TypeError('Headers.append: "Bearer EAABsecret123token" is an invalid header value.') });
    const res = await post({ to: "+971501234567" });
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("EAABsecret123token");
  });
  it("rate limits", async () => {
    checkRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() + 1000 });
    expect((await post({ to: "+971501234567" })).status).toBe(429);
    expect(sendWhatsAppTemplate).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });
  it("budgets ten test sends per admin per ten minutes", async () => {
    await post({ to: "+971501234567" });
    expect(checkRateLimit).toHaveBeenCalledWith("whatsapp-test:admin1", { limit: 10, windowSec: 600, prefix: "wa-test" });
  });
  it("403s non-admins before spending rate-limit budget or sending", async () => {
    ctxRole = "agent";
    expect((await post({ to: "+971501234567" })).status).toBe(403);
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(sendWhatsAppTemplate).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });
  describe("a number that opted out by STOP", () => {
    it("refuses with 409 opted_out and sends nothing", async () => {
      userFind.mockReturnValue(accounts([{ whatsapp: { optOutAt: new Date("2026-09-29T10:00:00Z") } }]));
      const res = await post({ to: "+971501234567" });
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "opted_out" });
      expect(sendWhatsAppTemplate).not.toHaveBeenCalled();
      // Nothing was sent, so there is nothing to audit.
      expect(logActivity).not.toHaveBeenCalled();
    });
    it("looks the number up the way STOP does: digit-tolerant phone pattern or Meta's wa_id", async () => {
      await post({ to: "+971 50 123 4567" });
      expect(userFind).toHaveBeenCalledWith({ $or: [{ phone: expect.any(RegExp) }, { "whatsapp.waId": "971501234567" }] });
      const pattern = userFind.mock.calls[0][0].$or[0].phone as RegExp;
      expect(pattern.test("+971 (0) 50 123 4567")).toBe(true);
    });
    it("refuses when any one of the accounts sharing the number opted out", async () => {
      userFind.mockReturnValue(accounts([{ whatsapp: {} }, { whatsapp: { optOutAt: new Date() } }]));
      expect((await post({ to: "+971501234567" })).status).toBe(409);
      expect(sendWhatsAppTemplate).not.toHaveBeenCalled();
    });
    it("sends when the accounts have not opted out, or opted back in after a STOP", async () => {
      userFind.mockReturnValue(accounts([{ whatsapp: { optOutAt: new Date("2026-09-01T00:00:00Z"), optInAt: new Date("2026-09-02T00:00:00Z") } }, {}]));
      expect((await post({ to: "+971501234567" })).status).toBe(200);
      expect(sendWhatsAppTemplate).toHaveBeenCalledTimes(1);
    });
    it("refuses a number on the suppression list even when no account opted out (409, nothing sent or audited)", async () => {
      // The account re-ticked the channel after the STOP; the number's own STOP still stands.
      userFind.mockReturnValue(accounts([{ whatsapp: { optOutAt: new Date("2026-09-01T00:00:00Z"), optInAt: new Date("2026-09-02T00:00:00Z") } }]));
      isNumberSuppressed.mockResolvedValue(true);
      const res = await post({ to: "+971 50 123 4567" });
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "opted_out" });
      expect(isNumberSuppressed).toHaveBeenCalledWith("+971501234567");
      expect(sendWhatsAppTemplate).not.toHaveBeenCalled();
      expect(logActivity).not.toHaveBeenCalled();
    });
    it("answers 409 opted_out when the send itself skipped the number (listed in between)", async () => {
      sendWhatsAppTemplate.mockResolvedValueOnce({ status: "skipped", reason: "opted_out" });
      const res = await post({ to: "+971501234567" });
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "opted_out" });
    });
    it("the master switch does not block a test send (admins test before switching it on)", async () => {
      // The route never reads the settings; if it did, it would see the switch off.
      getWhatsAppSettings.mockImplementation(async () => ({ enabled: false, dailyCapPerUser: 3, automations: {} }));
      expect((await post({ to: "+971501234567" })).status).toBe(200);
      expect(sendWhatsAppTemplate).toHaveBeenCalledTimes(1);
    });
    it("is not gated by START verification: admins test against allow-listed numbers no account verified", async () => {
      // No account verified this number, or none carries it at all: the test send still goes out.
      userFind.mockReturnValue(accounts([{ whatsapp: { optInAt: new Date("2026-09-02T00:00:00Z") } }]));
      expect((await post({ to: "+971501234567" })).status).toBe(200);
      userFind.mockReturnValue(accounts([]));
      expect((await post({ to: "+971507654321" })).status).toBe(200);
      expect(sendWhatsAppTemplate).toHaveBeenCalledTimes(2);
    });
  });
  it("rejects a body that fails validation without sending or auditing", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ to: "+971501234567", templateName: "Bad Name!" })).status).toBe(400);
    expect((await post({ to: "+971501234567", language: "english" })).status).toBe(400);
    expect(sendWhatsAppTemplate).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });
});
