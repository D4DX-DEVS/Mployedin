/**
 * @jest-environment node
 *
 * One switch, NEXT_PUBLIC_CAPTCHA_PROVIDER, read by the browser adapter and the
 * server verifier. Both go through this resolver, so they cannot disagree about
 * the value (PECR plan task 11, decision D2: reCAPTCHA stays behind an
 * abstraction until the solicitor decides).
 */
import { CAPTCHA_PROVIDER_IDS, DEFAULT_CAPTCHA_PROVIDER, resolveCaptchaProvider } from "@/lib/captcha/provider";

describe("resolveCaptchaProvider", () => {
  it("lists exactly one provider today and defaults to it", () => {
    expect([...CAPTCHA_PROVIDER_IDS]).toEqual(["recaptcha"]);
    expect(DEFAULT_CAPTCHA_PROVIDER).toBe("recaptcha");
  });

  it.each([undefined, null, "", "   "])("falls back to recaptcha, and counts as recognised, when unset (%p)", (raw) => {
    expect(resolveCaptchaProvider(raw)).toEqual({ id: "recaptcha", recognised: true, raw: "" });
  });

  it("accepts recaptcha in any case and ignores surrounding space", () => {
    expect(resolveCaptchaProvider("recaptcha")).toEqual({ id: "recaptcha", recognised: true, raw: "recaptcha" });
    expect(resolveCaptchaProvider("  ReCaptcha ")).toEqual({ id: "recaptcha", recognised: true, raw: "ReCaptcha" });
  });

  it("falls back to recaptcha for a value it does not know, and says it was not recognised", () => {
    expect(resolveCaptchaProvider("turnstile")).toEqual({ id: "recaptcha", recognised: false, raw: "turnstile" });
  });
});
