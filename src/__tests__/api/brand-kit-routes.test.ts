/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import { MPLOYEDIN_BRAND_KIT } from "@/lib/brand/brandKit";

const ctx: { userId: string; role: string } = { userId: "user_emp", role: "employer" };

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, c: unknown) => Promise<Response>) => (req: NextRequest) =>
    handler(req, { ...ctx, locale: "en" }),
}));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn(), actorFromCtx: jest.fn(() => ({})) }));

const Employer = { findOne: jest.fn(), updateOne: jest.fn() };
jest.mock("@/models/Employer", () => ({ __esModule: true, Employer }));
const SystemSettings = { findOneAndUpdate: jest.fn() };
jest.mock("@/models/SystemSettings", () => ({ __esModule: true, SystemSettings }));

const getEmployerBrandKit = jest.fn();
const getPlatformBrandKit = jest.fn();
jest.mock("@/lib/brand/brandKit.server", () => ({
  getEmployerBrandKit: (...a: unknown[]) => getEmployerBrandKit(...a),
  getPlatformBrandKit: (...a: unknown[]) => getPlatformBrandKit(...a),
  getPosterContact: async () => ({ email: "support@mployedin.com", phone: "" }),
}));

const ROUTE = { params: Promise.resolve({}) };

function lean<T>(value: T) {
  return { select: () => ({ lean: () => Promise.resolve(value) }) };
}

function req(method: string, body?: unknown) {
  return new NextRequest("http://localhost/api/x", {
    method,
    ...(body ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  ctx.role = "employer";
  Employer.findOne.mockReturnValue(lean({ _id: "emp_1" }));
  getEmployerBrandKit.mockResolvedValue({ kit: MPLOYEDIN_BRAND_KIT, isCustom: false });
  getPlatformBrandKit.mockResolvedValue(MPLOYEDIN_BRAND_KIT);
});

describe("/api/employers/brand-kit", () => {
  it("saves a valid kit on the caller's own company", async () => {
    const { PUT } = await import("@/app/api/employers/brand-kit/route");
    const kit = { ...MPLOYEDIN_BRAND_KIT, primary: "#aa2200", logoUrl: "" };
    const res = await PUT(req("PUT", kit), ROUTE);
    expect(res.status).toBe(200);
    expect(Employer.findOne).toHaveBeenCalledWith({ userId: "user_emp" });
    const [filter, update] = Employer.updateOne.mock.calls[0];
    expect(filter).toEqual({ _id: "emp_1" });
    expect(update.$set.brandKit.primary).toBe("#aa2200");
    expect(update.$set.brandKit).not.toHaveProperty("logoUrl");
  });

  it("rejects a kit with a bad colour and writes nothing", async () => {
    const { PUT } = await import("@/app/api/employers/brand-kit/route");
    const res = await PUT(req("PUT", { ...MPLOYEDIN_BRAND_KIT, accent: "blue" }), ROUTE);
    expect(res.status).toBe(400);
    expect(Employer.updateOne).not.toHaveBeenCalled();
  });

  it("resets to the Mployedin kit by removing the company's own", async () => {
    const { DELETE } = await import("@/app/api/employers/brand-kit/route");
    const res = await DELETE(req("DELETE"), ROUTE);
    expect(res.status).toBe(200);
    expect(Employer.updateOne).toHaveBeenCalledWith({ _id: "emp_1" }, { $unset: { brandKit: 1 } });
  });

  it("answers 404 for a role without a company", async () => {
    ctx.role = "job_seeker";
    const { GET } = await import("@/app/api/employers/brand-kit/route");
    expect((await GET(req("GET"), ROUTE)).status).toBe(404);
  });
});

describe("/api/admin/brand-kit", () => {
  it("lets only admins change the Mployedin kit", async () => {
    ctx.role = "employer";
    const { PUT } = await import("@/app/api/admin/brand-kit/route");
    const res = await PUT(req("PUT", MPLOYEDIN_BRAND_KIT), ROUTE);
    expect(res.status).toBe(403);
    expect(SystemSettings.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("saves the Mployedin kit for an admin, keeping the default logo when none is given", async () => {
    ctx.role = "admin";
    const { PUT } = await import("@/app/api/admin/brand-kit/route");
    const res = await PUT(req("PUT", { ...MPLOYEDIN_BRAND_KIT, logoUrl: "", primary: "#003399" }), ROUTE);
    expect(res.status).toBe(200);
    const [, update] = SystemSettings.findOneAndUpdate.mock.calls[0];
    expect(update.$set.brandKit).toMatchObject({ primary: "#003399", logoUrl: "/mployedin-logo.png" });
  });

  it("saves the poster contact line for an admin and rejects a bad email or phone", async () => {
    ctx.role = "admin";
    const { PATCH } = await import("@/app/api/admin/brand-kit/route");
    expect((await PATCH(req("PATCH", { email: "not-an-email", phone: "" }), ROUTE)).status).toBe(400);
    expect((await PATCH(req("PATCH", { email: "", phone: "call <script>" }), ROUTE)).status).toBe(400);
    const ok = await PATCH(req("PATCH", { email: "jobs@mployedin.com", phone: "+91 9747 224 335" }), ROUTE);
    expect(ok.status).toBe(200);
    const [, update] = SystemSettings.findOneAndUpdate.mock.calls.at(-1);
    expect(update.$set.posterContact).toEqual({ email: "jobs@mployedin.com", phone: "+91 9747 224 335" });
  });

  it("lets only admins change the poster contact line", async () => {
    ctx.role = "employer";
    const { PATCH } = await import("@/app/api/admin/brand-kit/route");
    expect((await PATCH(req("PATCH", { email: "x@y.co", phone: "" }), ROUTE)).status).toBe(403);
  });
});
