/**
 * getCaptchaToken() / isCaptchaEnabled() — the browser half of the swappable
 * captcha provider. With the one provider we have, they must behave exactly as
 * the reCAPTCHA adapter does: nothing is requested until the visitor taps, and
 * nothing is requested at all when no site key is set.
 */
// A module, not a global script: keeps `Mod` and the helpers below out of the project-wide scope.
export {};

type Mod = typeof import("@/lib/browser/captcha");

const recaptcha = {
  getRecaptchaToken: jest.fn<Promise<string | null>, [string]>(),
  isRecaptchaEnabled: jest.fn<boolean, []>(),
};
jest.mock("@/lib/browser/recaptcha", () => ({
  getRecaptchaToken: (action: string) => recaptcha.getRecaptchaToken(action),
  isRecaptchaEnabled: () => recaptcha.isRecaptchaEnabled(),
}));

function load(provider?: string): Mod {
  if (provider === undefined) delete process.env.NEXT_PUBLIC_CAPTCHA_PROVIDER;
  else process.env.NEXT_PUBLIC_CAPTCHA_PROVIDER = provider;
  let mod!: Mod;
  jest.isolateModules(() => {
    mod = require("@/lib/browser/captcha") as Mod;
  });
  return mod;
}

beforeEach(() => {
  recaptcha.getRecaptchaToken.mockReset().mockResolvedValue("tok-1");
  recaptcha.isRecaptchaEnabled.mockReset().mockReturnValue(true);
});
afterAll(() => {
  delete process.env.NEXT_PUBLIC_CAPTCHA_PROVIDER;
});

describe("browser captcha adapter", () => {
  it("is reCAPTCHA when the switch is unset", () => {
    expect(load().activeCaptchaProvider()).toBe("recaptcha");
  });

  it("hands the action to the provider and returns its token", async () => {
    const { getCaptchaToken } = load();
    await expect(getCaptchaToken("contact")).resolves.toBe("tok-1");
    expect(recaptcha.getRecaptchaToken).toHaveBeenCalledWith("contact");
  });

  it("returns null when the provider gives no token (blocked, offline, no key)", async () => {
    recaptcha.getRecaptchaToken.mockResolvedValue(null);
    const { getCaptchaToken } = load();
    await expect(getCaptchaToken("quick_apply")).resolves.toBeNull();
  });

  it("asks nothing of the provider until a token is requested (no load on page view)", () => {
    const mod = load();
    mod.isCaptchaEnabled();
    mod.getCaptchaNotice();
    expect(recaptcha.getRecaptchaToken).not.toHaveBeenCalled();
  });

  it("follows the provider for 'enabled'", () => {
    const { isCaptchaEnabled } = load();
    expect(isCaptchaEnabled()).toBe(true);
    recaptcha.isRecaptchaEnabled.mockReturnValue(false);
    expect(isCaptchaEnabled()).toBe(false);
  });

  it("falls back to reCAPTCHA for a provider it does not know, rather than switching the check off", async () => {
    const mod = load("turnstile");
    expect(mod.activeCaptchaProvider()).toBe("recaptcha");
    expect(mod.isCaptchaEnabled()).toBe(true);
    await expect(mod.getCaptchaToken("contact")).resolves.toBe("tok-1");
  });

  it("describes the notice for the active provider: message key plus Google's two policy links", () => {
    expect(load().getCaptchaNotice()).toEqual({
      messageKey: "captchaNotice",
      privacy: { href: "https://policies.google.com/privacy", labelKey: "captchaPrivacyLink" },
      terms: { href: "https://policies.google.com/terms", labelKey: "captchaTermsLink" },
    });
  });
});
