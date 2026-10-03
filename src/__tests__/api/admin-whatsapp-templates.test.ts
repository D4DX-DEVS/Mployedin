/**
 * @jest-environment node
 */
import { NextRequest, NextResponse } from "next/server";
import { WhatsAppApiError } from "@/lib/communications/whatsapp/errors";

let ctxRole = "admin";
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
const logActivity = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/audit/log", () => ({ logActivity: (...a: unknown[]) => logActivity(...a), actorFromCtx: () => ({ userId: "admin1", userRole: "admin" }) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() } }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) => async (req: NextRequest) => {
    try { return await handler(req, { userId: "admin1", role: ctxRole, locale: "en" }); } catch (err) { if (err instanceof NextResponse) return err; throw err; }
  },
}));
const find = jest.fn();
jest.mock("@/models/WhatsAppTemplate", () => ({ __esModule: true, default: { find: (...a: unknown[]) => find(...a) } }));
const syncTemplatesFromMeta = jest.fn().mockResolvedValue({ total: 3, upserted: 3, retired: 0 });
jest.mock("@/lib/communications/whatsapp/templateSync", () => ({ syncTemplatesFromMeta: (...a: unknown[]) => syncTemplatesFromMeta(...a) }));
const isWhatsAppEnabled = jest.fn(() => true);
let businessAccountId = "123456789";
jest.mock("@/lib/communications/whatsapp/config", () => ({
  isWhatsAppEnabled: () => isWhatsAppEnabled(),
  readWhatsAppEnv: () => ({ businessAccountId }),
}));

import { GET } from "@/app/api/admin/whatsapp/templates/route";
import { POST } from "@/app/api/admin/whatsapp/templates/sync/route";

const noParams = { params: Promise.resolve({}) };
const chain = (rows: unknown) => ({ sort: () => ({ lean: async () => rows }) });
const syncReq = () => new NextRequest("http://x/api/admin/whatsapp/templates/sync", { method: "POST" });

beforeEach(() => {
  jest.clearAllMocks();
  ctxRole = "admin";
  businessAccountId = "123456789";
});

describe("GET /api/admin/whatsapp/templates", () => {
  it("403s non-admins", async () => {
    ctxRole = "super_agent";
    expect((await GET(new NextRequest("http://x/api/admin/whatsapp/templates"), noParams)).status).toBe(403);
    expect(find).not.toHaveBeenCalled();
  });
  it("filters by status", async () => {
    find.mockReturnValue(chain([{ name: "a" }]));
    const res = await GET(new NextRequest("http://x/api/admin/whatsapp/templates?status=APPROVED"), noParams);
    expect(res.status).toBe(200);
    expect(find).toHaveBeenCalledWith({ status: "APPROVED" });
    expect((await res.json()).templates).toEqual([{ name: "a" }]);
  });
  it("lists everything without a status, and ignores a status that is not an upper-case word", async () => {
    find.mockReturnValue(chain([]));
    await GET(new NextRequest("http://x/api/admin/whatsapp/templates"), noParams);
    await GET(new NextRequest("http://x/api/admin/whatsapp/templates?status=approved"), noParams);
    await GET(new NextRequest("http://x/api/admin/whatsapp/templates?status[$ne]=APPROVED"), noParams);
    expect(find.mock.calls).toEqual([[{}], [{}], [{}]]);
  });
});

describe("POST /api/admin/whatsapp/templates/sync", () => {
  it("syncs and audits", async () => {
    const res = await POST(syncReq(), noParams);
    expect(res.status).toBe(200);
    expect(syncTemplatesFromMeta).toHaveBeenCalledTimes(1);
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.whatsapp.template.sync", resource: "notifications" }));
    expect((await res.json()).result).toEqual({ total: 3, upserted: 3, retired: 0 });
  });
  it("403s non-admins without syncing", async () => {
    ctxRole = "agent";
    expect((await POST(syncReq(), noParams)).status).toBe(403);
    expect(syncTemplatesFromMeta).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });
  it("refuses in mock mode", async () => {
    isWhatsAppEnabled.mockReturnValueOnce(false);
    const res = await POST(syncReq(), noParams);
    expect(res.status).toBe(409);
    expect(syncTemplatesFromMeta).not.toHaveBeenCalled();
  });
  it("refuses with a clear reason when the business account id is not set", async () => {
    businessAccountId = "";
    const res = await POST(syncReq(), noParams);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/WHATSAPP_BUSINESS_ACCOUNT_ID/);
    expect(syncTemplatesFromMeta).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });
  it("answers 502 with Meta's reason when the Graph API rejects the call, and does not audit", async () => {
    syncTemplatesFromMeta.mockRejectedValueOnce(new WhatsAppApiError({ code: 190, message: "Invalid OAuth access token", httpStatus: 401 }));
    const res = await POST(syncReq(), noParams);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("Meta rejected the template sync: Invalid OAuth access token");
    expect(logActivity).not.toHaveBeenCalled();
  });
  it("scrubs a bearer token out of the Graph message it relays", async () => {
    syncTemplatesFromMeta.mockRejectedValueOnce(new WhatsAppApiError({ code: 190, message: 'Bad header "Bearer EAABsecret123token" rejected', httpStatus: 401 }));
    const res = await POST(syncReq(), noParams);
    expect(res.status).toBe(502);
    const { error } = await res.json();
    expect(error).toBe('Meta rejected the template sync: Bad header "Bearer [redacted]" rejected');
    expect(error).not.toContain("EAABsecret123token");
  });
  it("answers 500 without leaking the message when the failure is ours, not Meta's", async () => {
    syncTemplatesFromMeta.mockRejectedValueOnce(new Error("E11000 duplicate key collection: mployedin.whatsapptemplates"));
    const res = await POST(syncReq(), noParams);
    expect(res.status).toBe(500);
    const { error } = await res.json();
    expect(error).toBe("We couldn't sync the templates. Please try again.");
    expect(logActivity).not.toHaveBeenCalled();
  });
});
