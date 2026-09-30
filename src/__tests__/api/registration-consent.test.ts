/**
 * @jest-environment node
 */
/**
 * New accounts must leave a consent trail on the admin GDPR page.
 *
 * The sign-up Terms/Privacy checkbox was enforced only in the browser and the
 * cookie-banner choice lived only in localStorage, so the Consent Logs never
 * showed either: its one writer was a job seeker changing marketing consent.
 */
import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
  RATE_LIMIT_CONFIGS: { auth: {} },
}));
jest.mock("@/lib/security/clientIp", () => ({ getClientIp: () => "10.0.0.1" }));
jest.mock("bcryptjs", () => ({ __esModule: true, default: { hash: async () => "hashed" } }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/subscription/autoAssign", () => ({ autoAssignDefaultPlan: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/communications/email", () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  EmailTemplates: {
    verifyEmailOtp: () => ({ subject: "v", html: "" }),
    jobSeekerWelcome: () => ({ subject: "w", html: "" }),
  },
}));
jest.mock("@/lib/auth/emailVerification", () => ({ hashOtp: () => "otp" }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn() } }));
jest.mock("@/lib/referrals/attachJobSeeker", () => ({ attachJobSeekerReferral: jest.fn() }));
jest.mock("@/lib/gdpr/termsVersion", () => ({ getCurrentTermsVersion: jest.fn(async () => "2026-09-29") }));

const USER_ID = "64e000000000000000000001";
const userCreate = jest.fn();
const userUpdateOne = jest.fn();
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(async () => null),
    create: (...a: unknown[]) => userCreate(...a),
    updateOne: (...a: unknown[]) => userUpdateOne(...a),
    findById: jest.fn(() => ({ select: () => ({ lean: async () => ({ name: "Sara Ahmed" }) }) })),
    findByIdAndDelete: jest.fn(async () => null),
  },
}));
jest.mock("@/models/JobSeeker", () => ({ __esModule: true, default: { create: jest.fn(async () => ({ _id: "js" })) } }));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { create: jest.fn(async () => ({ _id: "ag" })) } }));

const insertMany = jest.fn();
const consentCreate = jest.fn();
jest.mock("@/models/ConsentLog", () => ({
  __esModule: true,
  default: {
    insertMany: (...a: unknown[]) => insertMany(...a),
    create: (...a: unknown[]) => consentCreate(...a),
  },
}));

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) =>
    async (req: NextRequest) => {
      try {
        return await handler(req, { userId: USER_ID, role: "job_seeker", locale: "en" });
      } catch (err) {
        if (err instanceof NextResponse) return err;
        throw err;
      }
    },
}));

function register(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/auth/job-seeker-register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Sara Ahmed", email: "sara@example.com", password: "Str0ng!Passw0rd#2026", ...body }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  insertMany.mockResolvedValue([]);
  consentCreate.mockResolvedValue({});
  userCreate.mockResolvedValue({ _id: USER_ID });
  userUpdateOne.mockResolvedValue({ modifiedCount: 1 });
});

describe("job-seeker registration", () => {
  it("logs the Terms/Privacy acceptance and the cookie choice", async () => {
    const { POST } = await import("@/app/api/auth/job-seeker-register/route");
    const res = await POST(register({ termsAccepted: true, cookieConsent: "declined" }));

    expect(res.status).toBe(201);
    expect(insertMany).toHaveBeenCalledWith([
      expect.objectContaining({ userId: USER_ID, userName: "Sara Ahmed", consentType: "terms_and_privacy", granted: true, source: "registration", ipAddress: "10.0.0.1", policyVersion: "2026-09-29" }),
      expect.objectContaining({ consentType: "cookies", granted: false, source: "registration" }),
    ]);
  });

  it("stores the accepted version on the user, so they are not asked again", async () => {
    const { POST } = await import("@/app/api/auth/job-seeker-register/route");
    await POST(register({ termsAccepted: true }));
    expect(userUpdateOne).toHaveBeenCalledWith(
      { _id: USER_ID },
      { $set: expect.objectContaining({ termsAcceptedVersion: "2026-09-29", termsAcceptedAt: expect.any(Date) }) },
    );
  });

  it("refuses an account without the Terms/Privacy tick (a direct API call skipped the form)", async () => {
    const { POST } = await import("@/app/api/auth/job-seeker-register/route");
    for (const body of [{}, { termsAccepted: false }, { termsAccepted: "true" }]) {
      const res = await POST(register(body));
      expect(res.status).toBe(400);
    }
    expect(userCreate).not.toHaveBeenCalled();
    expect(insertMany).not.toHaveBeenCalled();
  });

  it("does not store a version when the log row failed", async () => {
    insertMany.mockRejectedValue(new Error("db down"));
    const { POST } = await import("@/app/api/auth/job-seeker-register/route");
    await POST(register({ termsAccepted: true }));
    expect(userUpdateOne).not.toHaveBeenCalled();
  });

  it("still registers when the consent log cannot be written", async () => {
    insertMany.mockRejectedValue(new Error("db down"));
    const { POST } = await import("@/app/api/auth/job-seeker-register/route");
    const res = await POST(register({ termsAccepted: true }));
    expect(res.status).toBe(201);
  });

  it("rejects a made-up cookie choice", async () => {
    const { POST } = await import("@/app/api/auth/job-seeker-register/route");
    const res = await POST(register({ termsAccepted: true, cookieConsent: "maybe" }));
    expect(res.status).toBe(400);
  });
});

describe("agent registration", () => {
  const agentBody = (extra: Record<string, unknown>) =>
    new NextRequest("http://localhost/api/auth/agent-register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fullName: "Ravi Kumar", email: "ravi@example.com", password: "Str0ng!Passw0rd#2026", country: "IN", ...extra }),
    });

  it("refuses an account without the Terms/Privacy tick", async () => {
    const { POST } = await import("@/app/api/auth/agent-register/route");
    const res = await POST(agentBody({}));
    expect(res.status).toBe(400);
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("logs the acceptance and the cookie choice", async () => {
    const { POST } = await import("@/app/api/auth/agent-register/route");
    const res = await POST(agentBody({ termsAccepted: true, cookieConsent: "accepted" }));
    expect(res.status).toBe(200);
    expect(insertMany).toHaveBeenCalledWith([
      expect.objectContaining({ userId: USER_ID, userName: "Ravi Kumar", consentType: "terms_and_privacy", granted: true, source: "registration", policyVersion: "2026-09-29" }),
      expect.objectContaining({ consentType: "cookies", granted: true }),
    ]);
  });
});

// Multipart with eleven collaborators: a source guard, like the other employer-register tests.
describe("employer registration", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/app/api/auth/employer-register/route.ts"), "utf8");

  it("refuses the form without the Terms/Privacy tick, before creating anything", () => {
    const guard = src.indexOf('if (get("termsAccepted") !== "true")');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(src.indexOf("User.create("));
  });

  it("logs consent from the form's termsAccepted and cookieConsent fields", () => {
    expect(src).toMatch(/recordRegistrationConsents\(\{[\s\S]*?termsAccepted: get\("termsAccepted"\) === "true"/);
    expect(src).toMatch(/cookieChoice: parseCookieChoice\(get\("cookieConsent"\)\)/);
  });

  it("logs it only after the rollback block, so a failed signup leaves no consent row", () => {
    expect(src.indexOf("recordRegistrationConsents({")).toBeGreaterThan(src.indexOf("} catch (creationErr) {"));
  });
});

describe("POST /api/user/consent (cookie banner, signed in)", () => {
  const post = (body: unknown) =>
    new NextRequest("http://localhost/api/user/consent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("logs the signed-in user's cookie choice", async () => {
    const { POST } = await import("@/app/api/user/consent/route");
    const res = await POST(post({ consentType: "cookies", granted: true }), { params: Promise.resolve({}) });

    expect(res.status).toBe(200);
    expect(consentCreate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, userName: "Sara Ahmed", consentType: "cookies", granted: true, source: "cookie_banner" })
    );
  });

  it("accepts cookie consent only", async () => {
    const { POST } = await import("@/app/api/user/consent/route");
    const res = await POST(post({ consentType: "marketing", granted: true }), { params: Promise.resolve({}) });
    expect(res.status).toBe(400);
    expect(consentCreate).not.toHaveBeenCalled();
  });
});
