/**
 * @jest-environment node
 */
/**
 * POST /api/contact — the captcha gate.
 *
 * The route used to re-implement Google's siteverify inline. It now goes through
 * the same verifier as quick-apply (lib/security/captcha) and must keep its
 * contract exactly:
 * - not configured (no secret): no check, no call to Google;
 * - configured: fails closed. Missing token -> 403 "CAPTCHA verification
 *   required"; refused (score < 0.3, wrong action, host not allowed) -> 403
 *   "CAPTCHA verification failed"; Google unreachable -> 503;
 * - the action is "contact".
 * Google's siteverify is mocked: nothing here reaches the network.
 */
import { NextRequest } from "next/server";

const mockCreate = jest.fn();
const mockCheckRateLimit = jest.fn();
const mockNotify = jest.fn();

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/security/rateLimit", () => ({ checkRateLimit: (...a: unknown[]) => mockCheckRateLimit(...a) }));
jest.mock("@/lib/security/clientIp", () => ({ getClientIp: () => "203.0.113.9" }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/notifications/trigger", () => ({
  notifyAdminsContactSubmission: (...a: unknown[]) => mockNotify(...a),
}));
jest.mock("@/models/ContactSubmission", () => ({
  __esModule: true,
  default: { create: (...a: unknown[]) => mockCreate(...a) },
}));
jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const fetchMock = jest.fn();
const ORIGINAL_ENV = { ...process.env };

const VALID = { name: "Sara Ali", email: "sara@example.com", phone: "", subject: "Hello", message: "Question about plans" };
const GOOD = { success: true, score: 0.9, action: "contact", hostname: "localhost" };

function contactReq(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function googleSays(data: Record<string, unknown>) {
  fetchMock.mockResolvedValue({ ok: true, json: async () => data });
}

describe("POST /api/contact captcha gate", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeAll(async () => {
    POST = (await import("@/app/api/contact/route")).POST;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockReset();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockCreate.mockResolvedValue({ _id: "sub-1" });
    mockNotify.mockResolvedValue(undefined);
    delete process.env.NEXT_PUBLIC_CAPTCHA_PROVIDER;
    process.env.RECAPTCHA_SECRET_KEY = "secret";
    process.env.RECAPTCHA_ALLOWED_HOSTS = "localhost";
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("without a secret configured, takes the message and never calls Google", async () => {
    process.env.RECAPTCHA_SECRET_KEY = "";

    const res = await POST(contactReq(VALID));

    expect(res.status).toBe(201);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("fails closed when configured and the form sent no token: 403, nothing stored, Google not asked", async () => {
    const res = await POST(contactReq(VALID));

    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("CAPTCHA verification required");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("stores the message when Google approves the token for action 'contact'", async () => {
    googleSays(GOOD);

    const res = await POST(contactReq({ ...VALID, captchaToken: "tok-contact" }));

    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://www.google.com/recaptcha/api/siteverify");
    const sent = new URLSearchParams(String(init.body));
    expect(sent.get("secret")).toBe("secret");
    expect(sent.get("response")).toBe("tok-contact");
  });

  it("accepts a score of exactly 0.3 and refuses anything below it", async () => {
    googleSays({ ...GOOD, score: 0.3 });
    expect((await POST(contactReq({ ...VALID, captchaToken: "t" }))).status).toBe(201);

    googleSays({ ...GOOD, score: 0.29 });
    const low = await POST(contactReq({ ...VALID, captchaToken: "t" }));
    expect(low.status).toBe(403);
    expect((await low.json()).error).toBe("CAPTCHA verification failed");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a token minted for another action", { ...GOOD, action: "quick_apply" }],
    ["a token minted on another host", { ...GOOD, hostname: "attacker.example" }],
    ["a response with no hostname", { success: true, score: 0.9, action: "contact" }],
    ["Google saying success: false", { ...GOOD, success: false }],
  ])("refuses %s with 403", async (_label, data) => {
    googleSays(data);

    const res = await POST(contactReq({ ...VALID, captchaToken: "t" }));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("CAPTCHA verification failed");
    expect(body.code).toBe("CAPTCHA_FAILED");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("answers 503 and stores nothing when Google cannot be reached (still fails closed)", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));

    const res = await POST(contactReq({ ...VALID, captchaToken: "t" }));

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("CAPTCHA verification is temporarily unavailable");
    expect(body.code).toBe("CAPTCHA_UNAVAILABLE");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("also answers 503 when Google replies with an error status", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

    const res = await POST(contactReq({ ...VALID, captchaToken: "t" }));

    expect(res.status).toBe(503);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("tags the missing-token refusal with its code so the form can say it in the visitor's language", async () => {
    const res = await POST(contactReq(VALID));
    expect((await res.json()).code).toBe("CAPTCHA_REQUIRED");
  });

  it("does not reject a long token on length alone (the cap matches quick-apply's 4096)", async () => {
    googleSays(GOOD);

    const res = await POST(contactReq({ ...VALID, captchaToken: "x".repeat(3000) }));

    expect(res.status).toBe(201);
  });

  it("still enforces the rate limit before it looks at the captcha", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false });

    const res = await POST(contactReq({ ...VALID, captchaToken: "t" }));

    expect(res.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
