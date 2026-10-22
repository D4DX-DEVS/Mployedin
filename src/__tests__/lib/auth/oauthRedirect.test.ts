/**
 * @jest-environment node
 *
 * Every OAuth start (LinkedIn, Apple) on the login and register pages builds its
 * callback URL here, so both pages carry the page language the same way. The
 * language rides as `locale=<en|ar>`; the callback-URL cookie keeps it, and
 * resolveCallbackLocale (the reader) turns it back into a locale for a visitor
 * who refused display settings and so has no NEXT_LOCALE cookie.
 */
import { oauthRedirectUrl, POST_LOGIN_REDIRECT_PATH } from "@/lib/auth/oauthRedirect";
import { resolveCallbackLocale } from "@/lib/i18n/requestLocale";
import { CONSENT_COOKIE, serializeConsent } from "@/lib/consent/state";

const ORIGIN = "http://localhost:3888";

function jar(values: Record<string, string>) {
  return { get: (name: string) => (name in values ? { value: values[name] } : undefined) };
}

function params(url: string): URLSearchParams {
  return new URL(url, "http://relative.invalid").searchParams;
}

describe("oauthRedirectUrl", () => {
  it("is the post-login-redirect route", () => {
    expect(POST_LOGIN_REDIRECT_PATH).toBe("/api/auth/post-login-redirect");
  });

  it("adds only the locale when there is no callback", () => {
    expect(oauthRedirectUrl("ar")).toBe("/api/auth/post-login-redirect?locale=ar");
    expect(oauthRedirectUrl("en", null)).toBe("/api/auth/post-login-redirect?locale=en");
    expect(oauthRedirectUrl("ar", undefined)).toBe("/api/auth/post-login-redirect?locale=ar");
    expect(oauthRedirectUrl("ar", "")).toBe("/api/auth/post-login-redirect?locale=ar");
  });

  it("keeps the callback (encoded) and adds the locale after it", () => {
    expect(oauthRedirectUrl("ar", "/ar/jobs/abc")).toBe("/api/auth/post-login-redirect?callbackUrl=%2Far%2Fjobs%2Fabc&locale=ar");
    expect(oauthRedirectUrl("en", "/en/jobs/abc")).toBe("/api/auth/post-login-redirect?callbackUrl=%2Fen%2Fjobs%2Fabc&locale=en");
  });

  it("keeps a callback that has its own query intact and separate from the locale", () => {
    const url = oauthRedirectUrl("ar", "/ar/jobs/abc?x=1&locale=en#top");
    const query = params(url);
    expect(query.get("callbackUrl")).toBe("/ar/jobs/abc?x=1&locale=en#top");
    expect(query.get("locale")).toBe("ar");
    expect([...query.keys()]).toEqual(["callbackUrl", "locale"]);
  });

  it.each(["fr", "", "AR", "ar&callbackUrl=//evil.example", "ar,en", "../ar", "javascript:alert(1)", "arabic"])(
    "never writes the unsupported locale %j",
    (locale) => {
      expect(oauthRedirectUrl(locale)).toBe("/api/auth/post-login-redirect");
      expect(oauthRedirectUrl(locale, "/en/jobs/abc")).toBe("/api/auth/post-login-redirect?callbackUrl=%2Fen%2Fjobs%2Fabc");
    },
  );

  it("never lets the locale add a second parameter or change the path", () => {
    for (const locale of ["ar", "en"]) {
      const url = oauthRedirectUrl(locale, "/ar/x");
      expect(new URL(url, ORIGIN).pathname).toBe("/api/auth/post-login-redirect");
      expect([...params(url).keys()]).toEqual(["callbackUrl", "locale"]);
    }
  });
});

describe("what the helper writes is what resolveCallbackLocale reads", () => {
  const OWN = ["localhost:3888"];
  const refused = { [CONSENT_COOKIE]: serializeConsent({ v: 1, id: "x", preferences: false, media: false, at: "2026-10-20T00:00:00.000Z" }) };

  it.each([
    ["ar", null],
    ["en", null],
    ["ar", "/ar/jobs/abc"],
    ["en", "/en/employer/jobs"],
  ] as const)("%s with callback %j round-trips, as an absolute or a relative cookie value", (locale, callback) => {
    const url = oauthRedirectUrl(locale, callback);
    expect(resolveCallbackLocale(jar({ "authjs.callback-url": `${ORIGIN}${url}` }), OWN)).toBe(locale);
    expect(resolveCallbackLocale(jar({ "authjs.callback-url": url }), OWN)).toBe(locale);
  });

  it("gives an Arabic page that refused display settings Arabic, not English", () => {
    const url = `${ORIGIN}${oauthRedirectUrl("ar", null)}`;
    expect(resolveCallbackLocale(jar({ ...refused, "authjs.callback-url": url }), OWN)).toBe("ar");
  });
});
