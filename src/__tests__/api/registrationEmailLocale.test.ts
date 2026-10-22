/**
 * @jest-environment node
 *
 * The language of the verification e-mail (and of the link in it) comes from the
 * page the form was posted from, not only from NEXT_LOCALE: that cookie is a
 * preference cookie, so a visitor who just opened /ar, or who objected to
 * preferences, has none.
 */
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
  RATE_LIMIT_CONFIGS: { auth: {} },
}));
jest.mock("@/lib/security/clientIp", () => ({ getClientIp: () => "10.0.0.1" }));
jest.mock("@/lib/validators", () => ({ validateBody: jest.fn(async (req: NextRequest) => req.json()) }));
jest.mock("@/lib/validators/misc", () => ({ agentRegisterSchema: {}, jobSeekerRegisterSchema: {} }));
jest.mock("bcryptjs", () => ({ __esModule: true, default: { hash: jest.fn().mockResolvedValue("hash") } }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/subscription/autoAssign", () => ({ autoAssignDefaultPlan: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/gdpr/consent", () => ({ recordRegistrationConsents: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/referrals/attachJobSeeker", () => ({ attachJobSeekerReferral: jest.fn() }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn() } }));
jest.mock("@/lib/auth/config", () => ({ auth: jest.fn().mockResolvedValue(null) }));

const verifyEmailOtp = jest.fn((...args: unknown[]) => {
  void args;
  return { subject: "s", html: "h" };
});
jest.mock("@/lib/communications/email", () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  EmailTemplates: {
    verifyEmailOtp: (...args: unknown[]) => verifyEmailOtp(...args),
    jobSeekerWelcome: () => ({ subject: "w", html: "" }),
  },
}));

// The register routes import User as the default export, the resend route as a named one.
const userFindOne = jest.fn();
jest.mock("@/models/User", () => {
  const model = {
    findOne: (...args: unknown[]) => userFindOne(...args),
    create: jest.fn(async () => ({ _id: { toString: () => "u1" } })),
    findByIdAndDelete: jest.fn().mockResolvedValue(null),
  };
  return { __esModule: true, default: model, User: model };
});
jest.mock("@/models/JobSeeker", () => ({ __esModule: true, default: { create: jest.fn(async () => ({ _id: "js" })) } }));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { create: jest.fn(async () => ({ _id: "a1" })) } }));

import { POST as jobSeekerRegister } from "@/app/api/auth/job-seeker-register/route";
import { POST as agentRegister } from "@/app/api/auth/agent-register/route";
import { POST as resendVerification } from "@/app/api/auth/resend-verification/route";

const ORIGIN = "http://localhost:3888";

function post(route: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${ORIGIN}/api/auth/${route}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const jobSeeker = (headers?: Record<string, string>) =>
  jobSeekerRegister(post("job-seeker-register", { name: "Sara", email: "sara@example.com", password: "Str0ng!Passw0rd#2026", termsAccepted: true }, headers));
const agent = (headers?: Record<string, string>) =>
  agentRegister(post("agent-register", { fullName: "Test Agent", email: "agent@example.com", password: "Str0ng!Passw0rd", country: "AE", city: "Dubai" }, headers));
const resend = (headers?: Record<string, string>) => {
  userFindOne.mockReturnValue({
    select: jest.fn().mockResolvedValue({
      _id: { toString: () => "u1" },
      email: "sara@example.com",
      name: "Sara",
      save: jest.fn().mockResolvedValue(undefined),
    }),
  });
  return resendVerification(post("resend-verification", { email: "sara@example.com" }, headers));
};

/** The verify link handed to the e-mail template by the last request. */
function verifyUrl(): string {
  const call = verifyEmailOtp.mock.calls.at(-1);
  expect(call).toBeDefined();
  return String(call![2]);
}

const ROUTES = [
  ["job-seeker-register", jobSeeker, 201],
  ["agent-register", agent, 200],
  ["resend-verification", resend, 200],
] as const;

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = "test-secret";
});
beforeEach(() => {
  verifyEmailOtp.mockClear();
  userFindOne.mockReset().mockResolvedValue(null);
});

describe.each(ROUTES)("%s: language of the verification link", (_name, call, status) => {
  it("is Arabic when the form was posted from an /ar page and there is no NEXT_LOCALE", async () => {
    const res = await call({ referer: `${ORIGIN}/ar/register` });
    expect(res.status).toBe(status);
    expect(verifyUrl()).toContain("/ar/verify-email?");
  });

  it("is English when the form was posted from an /en page, whatever NEXT_LOCALE says", async () => {
    await call({ referer: `${ORIGIN}/en/register`, cookie: "NEXT_LOCALE=ar" });
    expect(verifyUrl()).toContain("/en/verify-email?");
  });

  it("falls back to NEXT_LOCALE without a usable Referer", async () => {
    await call({ cookie: "NEXT_LOCALE=ar" });
    expect(verifyUrl()).toContain("/ar/verify-email?");
  });

  it("ignores a Referer from another site and falls back to English", async () => {
    await call({ referer: "https://evil.example/ar/register" });
    expect(verifyUrl()).toContain("/en/verify-email?");
  });

  it("is English with no signal at all", async () => {
    await call();
    expect(verifyUrl()).toContain("/en/verify-email?");
  });
});

describe("no registration or sign-in code reads NEXT_LOCALE on its own any more", () => {
  const FILES = [
    ["src/app/api/auth/agent-register/route.ts", "resolveRequestLocale"],
    ["src/app/api/auth/employer-register/route.ts", "resolveRequestLocale"],
    ["src/app/api/auth/job-seeker-register/route.ts", "resolveRequestLocale"],
    ["src/app/api/auth/resend-verification/route.ts", "resolveRequestLocale"],
    ["src/lib/auth/config.ts", "resolveCallbackLocale"],
  ] as const;

  it.each(FILES)("%s uses the shared helper", (file, helper) => {
    const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    expect(source).toContain(`${helper}(`);
    expect(source).not.toContain("NEXT_LOCALE\")?.value");
    expect(source).not.toMatch(/get\(["']NEXT_LOCALE["']\)/);
  });
});
