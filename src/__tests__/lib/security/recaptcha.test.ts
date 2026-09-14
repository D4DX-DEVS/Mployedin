/**
 * @jest-environment node
 *
 * verifyRecaptcha() — the server half of the invisible reCAPTCHA v3 gate on
 * /api/auth/apply-otp/start. Policy mirrors /api/contact: skipped when no
 * secret is configured, mandatory and fail-closed when one is. Stricter than
 * the contact form: score + action are required (a v2 / demo key returns
 * neither), and the default allowed host comes from the configured site URL,
 * never from the request's Host header.
 */
import { verifyRecaptcha, isRecaptchaConfigured, recaptchaAllowedHosts } from "@/lib/security/recaptcha";

jest.mock("@/lib/logger", () => ({ __esModule: true, default: { warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));

const ENV_KEYS = [
  "RECAPTCHA_SECRET_KEY",
  "RECAPTCHA_ALLOWED_HOSTS",
  "NEXTAUTH_URL",
  "NEXT_PUBLIC_BASE_URL",
  "NEXT_PUBLIC_APP_URL",
] as const;
const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};
const originalFetch = global.fetch;

function googleSays(body: Record<string, unknown>, ok = true) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 502,
    json: async () => body,
  }) as unknown as typeof fetch;
}

const human = { success: true, score: 0.9, action: "quick_apply", hostname: "mployedin.com" };
const opts = { action: "quick_apply", hostname: "mployedin.com" };

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  global.fetch = originalFetch;
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("verifyRecaptcha — not configured", () => {
  test("skips the check entirely and never calls Google", async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    expect(isRecaptchaConfigured()).toBe(false);
    await expect(verifyRecaptcha(undefined, opts)).resolves.toEqual({ ok: true, skipped: true });
    await expect(verifyRecaptcha("anything", opts)).resolves.toEqual({ ok: true, skipped: true });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("verifyRecaptcha — configured", () => {
  beforeEach(() => {
    process.env.RECAPTCHA_SECRET_KEY = "secret-key";
  });

  test("a missing token is refused with 403 CAPTCHA_REQUIRED before contacting Google", async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    await expect(verifyRecaptcha(undefined, opts)).resolves.toEqual({ ok: false, status: 403, error: "CAPTCHA_REQUIRED" });
    await expect(verifyRecaptcha("", opts)).resolves.toEqual({ ok: false, status: 403, error: "CAPTCHA_REQUIRED" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("posts secret + token to siteverify as a form body", async () => {
    googleSays(human);

    await verifyRecaptcha("tok-abc", opts);

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("https://www.google.com/recaptcha/api/siteverify");
    expect(init.method).toBe("POST");
    const body = new URLSearchParams(init.body as string);
    expect(body.get("secret")).toBe("secret-key");
    expect(body.get("response")).toBe("tok-abc");
  });

  test("passes a human-looking v3 response", async () => {
    googleSays(human);
    await expect(verifyRecaptcha("tok", opts)).resolves.toEqual({ ok: true, skipped: false, score: 0.9 });
  });

  test.each([
    ["success=false", { ...human, success: false }],
    ["score below 0.3", { ...human, score: 0.2 }],
    ["no score at all (v2 key, incl. Google's public demo pair)", { success: true, action: "quick_apply", hostname: "mployedin.com" }],
    ["no action at all", { success: true, score: 0.9, hostname: "mployedin.com" }],
    ["wrong action (token minted for another form)", { ...human, action: "contact" }],
    ["wrong hostname (token minted on another site)", { ...human, hostname: "evil.example" }],
    ["Google's demo-key hostname", { success: true, hostname: "testkey.google.com" }],
    ["no hostname at all", { success: true, score: 0.9, action: "quick_apply" }],
  ])("refuses with 403 CAPTCHA_FAILED: %s", async (_label, body) => {
    googleSays(body);
    await expect(verifyRecaptcha("tok", opts)).resolves.toEqual({ ok: false, status: 403, error: "CAPTCHA_FAILED" });
  });

  test("honours a custom minScore", async () => {
    googleSays({ ...human, score: 0.5 });
    await expect(verifyRecaptcha("tok", { ...opts, minScore: 0.7 })).resolves.toMatchObject({ ok: false, error: "CAPTCHA_FAILED" });
  });

  test("Google unreachable → 503 CAPTCHA_UNAVAILABLE (fail closed, but distinguishable from a bot verdict)", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("ECONNRESET")) as unknown as typeof fetch;
    await expect(verifyRecaptcha("tok", opts)).resolves.toEqual({ ok: false, status: 503, error: "CAPTCHA_UNAVAILABLE" });
  });

  test("Google answers non-2xx → 503 CAPTCHA_UNAVAILABLE", async () => {
    googleSays({}, false);
    await expect(verifyRecaptcha("tok", opts)).resolves.toEqual({ ok: false, status: 503, error: "CAPTCHA_UNAVAILABLE" });
  });
});

describe("allowed hostnames", () => {
  test("with nothing configured, falls back to the request hostname", () => {
    expect(recaptchaAllowedHosts("Localhost")).toEqual(["localhost"]);
  });

  test("the configured site URL wins over the request's Host header (which a caller controls)", async () => {
    process.env.RECAPTCHA_SECRET_KEY = "secret-key";
    process.env.NEXTAUTH_URL = "https://mployedin.com";
    expect(recaptchaAllowedHosts("attacker.example")).toEqual(["mployedin.com"]);

    // Token minted on our site, request arrives with a forged Host: fine.
    googleSays(human);
    await expect(verifyRecaptcha("tok", { ...opts, hostname: "attacker.example" })).resolves.toMatchObject({ ok: true });

    // Token minted on the attacker's site, Host forged to match it: refused.
    googleSays({ ...human, hostname: "attacker.example" });
    await expect(verifyRecaptcha("tok", { ...opts, hostname: "attacker.example" })).resolves.toMatchObject({ ok: false, error: "CAPTCHA_FAILED" });
  });

  test("collects every configured site URL, de-duplicated, ignoring unparsable ones", () => {
    process.env.NEXTAUTH_URL = "https://www.mployedin.com";
    process.env.NEXT_PUBLIC_BASE_URL = "https://www.mployedin.com";
    process.env.NEXT_PUBLIC_APP_URL = "not a url";
    expect(recaptchaAllowedHosts("localhost")).toEqual(["www.mployedin.com"]);
  });

  test("RECAPTCHA_ALLOWED_HOSTS overrides everything (comma list, case-insensitive)", async () => {
    process.env.RECAPTCHA_SECRET_KEY = "secret-key";
    process.env.NEXTAUTH_URL = "https://mployedin.com";
    process.env.RECAPTCHA_ALLOWED_HOSTS = "Localhost, testkey.google.com";
    expect(recaptchaAllowedHosts("whatever")).toEqual(["localhost", "testkey.google.com"]);

    googleSays({ ...human, hostname: "LOCALHOST" });
    await expect(verifyRecaptcha("tok", { ...opts, hostname: "localhost" })).resolves.toMatchObject({ ok: true });
  });
});
