/**
 * @jest-environment node
 *
 * A referral code (`?ref=`) that reaches a LinkedIn / Apple sign-up through the
 * LOGIN page, where the first attempt has no mpl_signup_consent cookie yet:
 *
 *   a. oauthRedirectUrl(locale, callback, ref) puts the code in the
 *      post-login-redirect URL the OAuth start sends,
 *   b. Auth.js keeps that URL in its callback-url cookie, and
 *      resolveCallbackReferral reads the code back for the consent_required bounce,
 *   c. the login page puts it in memory and in mpl_signup_consent (see
 *      app/loginReferral.test.tsx),
 *   d. post-login-redirect claims it (api/post-login-redirect-referral.test.ts).
 *
 * The code is only ever written or read when it has the shape of a code.
 */
import { oauthRedirectUrl, POST_LOGIN_REDIRECT_PATH } from "@/lib/auth/oauthRedirect";
import { resolveCallbackLocale, resolveCallbackReferral } from "@/lib/i18n/requestLocale";

const ORIGIN = "http://localhost:3888";
const OWN = ["localhost:3888"];
const CODE = "MPL-1A2B3C4D5E6F7A8B";

function jar(values: Record<string, string>) {
  return { get: (name: string) => (name in values ? { value: values[name] } : undefined) };
}
const cookie = (value: string, name = "authjs.callback-url") => jar({ [name]: value });

describe("oauthRedirectUrl with a referral code", () => {
  it("adds ref after the locale, with and without a callback", () => {
    expect(oauthRedirectUrl("en", null, CODE)).toBe(`${POST_LOGIN_REDIRECT_PATH}?locale=en&ref=${CODE}`);
    expect(oauthRedirectUrl("ar", "/ar/jobs/abc", CODE)).toBe(
      `${POST_LOGIN_REDIRECT_PATH}?callbackUrl=%2Far%2Fjobs%2Fabc&locale=ar&ref=${CODE}`,
    );
  });

  it("is unchanged without a code", () => {
    expect(oauthRedirectUrl("en", null)).toBe(`${POST_LOGIN_REDIRECT_PATH}?locale=en`);
    expect(oauthRedirectUrl("en", null, "")).toBe(`${POST_LOGIN_REDIRECT_PATH}?locale=en`);
    expect(oauthRedirectUrl("en", null, null)).toBe(`${POST_LOGIN_REDIRECT_PATH}?locale=en`);
  });

  it("never writes a code that is not shaped like one", () => {
    expect(oauthRedirectUrl("en", null, "<script>")).toBe(`${POST_LOGIN_REDIRECT_PATH}?locale=en`);
    expect(oauthRedirectUrl("en", null, "MPL-1")).toBe(`${POST_LOGIN_REDIRECT_PATH}?locale=en`);
    expect(oauthRedirectUrl("en", null, "x&evil=1")).toBe(`${POST_LOGIN_REDIRECT_PATH}?locale=en`);
  });

  it("upper-cases a lower-case code and starts the query when the locale is unsupported", () => {
    expect(oauthRedirectUrl("en", null, CODE.toLowerCase())).toBe(`${POST_LOGIN_REDIRECT_PATH}?locale=en&ref=${CODE}`);
    expect(oauthRedirectUrl("fr", null, CODE)).toBe(`${POST_LOGIN_REDIRECT_PATH}?ref=${CODE}`);
  });
});

describe("resolveCallbackReferral (the consent_required bounce)", () => {
  const url = oauthRedirectUrl("en", "/en/jobs/abc", CODE);

  it("reads the code back from the callback-url cookie, absolute or relative, plain or encoded", () => {
    expect(resolveCallbackReferral(cookie(`${ORIGIN}${url}`), OWN)).toBe(CODE);
    expect(resolveCallbackReferral(cookie(url), OWN)).toBe(CODE);
    expect(resolveCallbackReferral(cookie(encodeURIComponent(`${ORIGIN}${url}`)), OWN)).toBe(CODE);
    expect(resolveCallbackReferral(cookie(`https://mployedin.example${url}`, "__Secure-authjs.callback-url"), ["mployedin.example"])).toBe(CODE);
  });

  it("is empty when there is no code, no cookie, or no signal at all", () => {
    expect(resolveCallbackReferral(cookie(`${ORIGIN}${oauthRedirectUrl("en", null)}`), OWN)).toBe("");
    expect(resolveCallbackReferral(jar({}), OWN)).toBe("");
    expect(resolveCallbackReferral(jar({ NEXT_LOCALE: "ar" }), OWN)).toBe("");
  });

  it("ignores a callback URL on another site", () => {
    expect(resolveCallbackReferral(cookie(`https://evil.example${url}`), OWN)).toBe("");
    expect(resolveCallbackReferral(cookie(`//localhost:3888${url}`), OWN)).toBe("");
    expect(resolveCallbackReferral(cookie(`/\\evil.example${url}`), OWN)).toBe("");
  });

  it("only reads the post-login-redirect URL, not any page that happens to carry ref", () => {
    expect(resolveCallbackReferral(cookie(`${ORIGIN}/en/jobs/abc?ref=${CODE}`), OWN)).toBe("");
    expect(resolveCallbackReferral(cookie(`${ORIGIN}/en/register?ref=${CODE}`), OWN)).toBe("");
  });

  it("never reflects a code that is not shaped like one", () => {
    expect(resolveCallbackReferral(cookie(`${ORIGIN}${POST_LOGIN_REDIRECT_PATH}?locale=en&ref=%3Cscript%3E`), OWN)).toBe("");
    expect(resolveCallbackReferral(cookie(`${ORIGIN}${POST_LOGIN_REDIRECT_PATH}?ref=MPL-1`), OWN)).toBe("");
    expect(resolveCallbackReferral(cookie(`${ORIGIN}${POST_LOGIN_REDIRECT_PATH}?ref=${CODE}%0d%0aSet-Cookie:x`), OWN)).toBe("");
  });

  it("reads a lower-case code as upper case", () => {
    expect(resolveCallbackReferral(cookie(`${ORIGIN}${POST_LOGIN_REDIRECT_PATH}?ref=${CODE.toLowerCase()}`), OWN)).toBe(CODE);
  });

  it("takes the first ref when there are several, and the first valid cookie", () => {
    const a = `${ORIGIN}${POST_LOGIN_REDIRECT_PATH}?ref=${CODE}&ref=MPL-OTHER000000`;
    expect(resolveCallbackReferral(cookie(a), OWN)).toBe(CODE);
    const both = jar({
      "__Secure-authjs.callback-url": `${ORIGIN}${POST_LOGIN_REDIRECT_PATH}?locale=en`,
      "authjs.callback-url": `${ORIGIN}${POST_LOGIN_REDIRECT_PATH}?ref=${CODE}`,
    });
    expect(resolveCallbackReferral(both, OWN)).toBe(CODE);
  });

  it("leaves the locale reading alone", () => {
    expect(resolveCallbackLocale(cookie(`${ORIGIN}${oauthRedirectUrl("ar", null, CODE)}`), OWN)).toBe("ar");
  });
});
