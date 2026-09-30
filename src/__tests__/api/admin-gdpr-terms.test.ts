/**
 * @jest-environment node
 */
/**
 * Admin GDPR page → the Terms version card: how many users accepted the
 * version in force, and starting a new one after a material change.
 */
import { NextRequest, NextResponse } from "next/server";

const ADMIN_ID = "64d000000000000000000001";
let ctxRole = "admin";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
const logActivity = jest.fn();
jest.mock("@/lib/audit/log", () => ({
  logActivity: (...a: unknown[]) => logActivity(...a),
  actorFromCtx: (ctx: { userId: string; role: string }) => ({ actorId: ctx.userId, actorRole: ctx.role }),
}));
const getCurrentTermsVersion = jest.fn();
const bumpTermsVersion = jest.fn();
jest.mock("@/lib/gdpr/termsVersion", () => ({
  TERMS_BASELINE_VERSION: "2026-09-29",
  getCurrentTermsVersion: () => getCurrentTermsVersion(),
  bumpTermsVersion: () => bumpTermsVersion(),
}));
const countDocuments = jest.fn();
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { countDocuments: (...a: unknown[]) => countDocuments(...a) },
}));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) =>
    async (req: NextRequest) => {
      try {
        return await handler(req, { userId: ADMIN_ID, role: ctxRole, locale: "en" });
      } catch (err) {
        if (err instanceof NextResponse) return err;
        throw err;
      }
    },
}));

const url = "http://localhost:3000/api/admin/gdpr/terms";
const post = (body: unknown) =>
  new NextRequest(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  jest.clearAllMocks();
  ctxRole = "admin";
  getCurrentTermsVersion.mockResolvedValue("2026-09-29");
  countDocuments.mockImplementation(async (filter: Record<string, unknown>) => ("termsAcceptedVersion" in filter ? 3 : 40));
});

describe("GET /api/admin/gdpr/terms", () => {
  it("reports the version and how many non-admin users accepted it", async () => {
    const { GET } = await import("@/app/api/admin/gdpr/terms/route");
    const res = await GET(new NextRequest(url), { params: Promise.resolve({}) });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ version: "2026-09-29", isBaseline: true, acceptedUsers: 3, totalUsers: 40 });
    expect(countDocuments).toHaveBeenCalledWith({ role: { $ne: "admin" }, isActive: true });
    expect(countDocuments).toHaveBeenCalledWith({ role: { $ne: "admin" }, isActive: true, termsAcceptedVersion: "2026-09-29" });
  });

  it("is admin-only", async () => {
    ctxRole = "super_agent";
    const { GET } = await import("@/app/api/admin/gdpr/terms/route");
    const res = await GET(new NextRequest(url), { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });
});

describe("POST /api/admin/gdpr/terms", () => {
  it("starts a new version and records who did it", async () => {
    bumpTermsVersion.mockResolvedValue("2026-10-02T08:00:00.000Z");
    const { POST } = await import("@/app/api/admin/gdpr/terms/route");

    const res = await POST(post({ confirm: true }), { params: Promise.resolve({}) });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(expect.objectContaining({ version: "2026-10-02T08:00:00.000Z", isBaseline: false }));
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({
      actorId: ADMIN_ID,
      action: "gdpr.terms.new_version",
      changes: { before: { termsVersion: "2026-09-29" }, after: { termsVersion: "2026-10-02T08:00:00.000Z" } },
    }));
  });

  it("needs an explicit confirm", async () => {
    const { POST } = await import("@/app/api/admin/gdpr/terms/route");
    const res = await POST(post({}), { params: Promise.resolve({}) });
    expect(res.status).toBe(400);
    expect(bumpTermsVersion).not.toHaveBeenCalled();
  });

  it("is admin-only", async () => {
    ctxRole = "employer";
    const { POST } = await import("@/app/api/admin/gdpr/terms/route");
    const res = await POST(post({ confirm: true }), { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
    expect(bumpTermsVersion).not.toHaveBeenCalled();
  });
});
