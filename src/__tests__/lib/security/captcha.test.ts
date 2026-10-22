/**
 * @jest-environment node
 *
 * verifyCaptcha() / isCaptchaConfigured() — the server half of the swappable
 * captcha provider. The switch is the same NEXT_PUBLIC_CAPTCHA_PROVIDER the
 * browser reads, so the two cannot disagree. With one provider they delegate to
 * verifyRecaptcha unchanged; Google's siteverify is mocked, never called.
 */
// A module, not a global script: keeps `Mod`, `load` and `fetchMock` out of the project-wide scope.
export {};

const warn = jest.fn();
jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: { warn: (...a: unknown[]) => warn(...a), error: jest.fn(), info: jest.fn() },
}));

type Mod = typeof import("@/lib/security/captcha");

function load(): Mod {
  let mod!: Mod;
  jest.isolateModules(() => {
    mod = require("@/lib/security/captcha") as Mod;
  });
  return mod;
}

const fetchMock = jest.fn();
const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  warn.mockReset();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  delete process.env.NEXT_PUBLIC_CAPTCHA_PROVIDER;
  process.env.RECAPTCHA_SECRET_KEY = "";
  process.env.RECAPTCHA_ALLOWED_HOSTS = "localhost";
});
afterAll(() => {
  process.env = ORIGINAL_ENV;
});

const opts = { action: "contact", hostname: "localhost" };
const good = { success: true, score: 0.9, action: "contact", hostname: "localhost" };

describe("server captcha verifier", () => {
  it("is not configured, and skips, without a secret (environments without keys keep working)", async () => {
    const { isCaptchaConfigured, verifyCaptcha } = load();
    expect(isCaptchaConfigured()).toBe(false);
    await expect(verifyCaptcha(undefined, opts)).resolves.toEqual({ ok: true, skipped: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is configured when the provider's secret is set, and then requires a token (fail closed)", async () => {
    process.env.RECAPTCHA_SECRET_KEY = "secret";
    const { isCaptchaConfigured, verifyCaptcha } = load();
    expect(isCaptchaConfigured()).toBe(true);
    await expect(verifyCaptcha(undefined, opts)).resolves.toEqual({ ok: false, status: 403, error: "CAPTCHA_REQUIRED" });
  });

  it("verifies through the reCAPTCHA adapter and passes the options on (action, min score)", async () => {
    process.env.RECAPTCHA_SECRET_KEY = "secret";
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ...good, score: 0.5 }) });
    const { verifyCaptcha } = load();
    await expect(verifyCaptcha("tok", opts)).resolves.toEqual({ ok: true, skipped: false, score: 0.5 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://www.google.com/recaptcha/api/siteverify");
    await expect(verifyCaptcha("tok", { ...opts, minScore: 0.7 })).resolves.toMatchObject({ ok: false, error: "CAPTCHA_FAILED" });
  });

  it("answers 503 CAPTCHA_UNAVAILABLE when the verifier cannot be reached", async () => {
    process.env.RECAPTCHA_SECRET_KEY = "secret";
    fetchMock.mockRejectedValue(new Error("offline"));
    const { verifyCaptcha } = load();
    await expect(verifyCaptcha("tok", opts)).resolves.toEqual({ ok: false, status: 503, error: "CAPTCHA_UNAVAILABLE" });
  });

  it("reads the same switch as the browser: an unknown value falls back to reCAPTCHA and is logged once", async () => {
    process.env.NEXT_PUBLIC_CAPTCHA_PROVIDER = "turnstile";
    process.env.RECAPTCHA_SECRET_KEY = "secret";
    fetchMock.mockResolvedValue({ ok: true, json: async () => good });
    const { isCaptchaConfigured, verifyCaptcha } = load();

    expect(isCaptchaConfigured()).toBe(true);
    await expect(verifyCaptcha("tok", opts)).resolves.toMatchObject({ ok: true });
    await verifyCaptcha("tok", opts);

    const unknownWarnings = warn.mock.calls.filter(([ctx]) => (ctx as { provider?: string })?.provider === "turnstile");
    expect(unknownWarnings).toHaveLength(1);
  });

  it("does not log anything for the default or a known provider", async () => {
    process.env.NEXT_PUBLIC_CAPTCHA_PROVIDER = "recaptcha";
    const { verifyCaptcha } = load();
    await verifyCaptcha("tok", opts);
    expect(warn).not.toHaveBeenCalled();
  });
});
