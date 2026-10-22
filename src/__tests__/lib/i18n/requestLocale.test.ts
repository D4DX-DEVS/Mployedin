/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import { localeFromPath } from "@/lib/i18n/localePath";
import { resolveCallbackLocale, resolveRequestLocale } from "@/lib/i18n/requestLocale";
import { CONSENT_COOKIE, serializeConsent } from "@/lib/consent/state";

const ORIGIN = "http://localhost:3888";

function request(headers: Record<string, string> = {}) {
  return new NextRequest(`${ORIGIN}/api/auth/job-seeker-register`, { method: "POST", headers });
}

function jar(values: Record<string, string>) {
  return { get: (name: string) => (name in values ? { value: values[name] } : undefined) };
}

/** The mpl_consent cookie value for a stored choice about preferences. */
function consent(preferences: boolean): string {
  return serializeConsent({ v: 1, id: "x", preferences, media: false, at: "2026-10-20T00:00:00.000Z" });
}

const savedEnv = { ...process.env };
afterEach(() => {
  process.env = { ...savedEnv };
});

describe("localeFromPath", () => {
  it.each([
    ["/ar", "ar"],
    ["/ar/", "ar"],
    ["/ar/job-seeker/jobs?x=1", "ar"],
    ["/en/login", "en"],
  ])("%s -> %s", (path, expected) => {
    expect(localeFromPath(path)).toBe(expected);
  });

  it.each(["", "/", "/arabic", "/fr/login", "ar/login", "//ar/login", "/api/ar"])("%j is no locale path", (path) => {
    expect(localeFromPath(path)).toBeNull();
  });
});

describe("resolveRequestLocale", () => {
  it("takes the locale from the same-origin Referer path (an /ar page)", () => {
    expect(resolveRequestLocale(request({ referer: `${ORIGIN}/ar/register?ref=abc` }))).toBe("ar");
  });

  it("takes English from an /en Referer even when NEXT_LOCALE says Arabic (the page is the truth)", () => {
    expect(resolveRequestLocale(request({ referer: `${ORIGIN}/en/register`, cookie: "NEXT_LOCALE=ar" }))).toBe("en");
  });

  it("matches the Referer against the forwarded host behind a proxy", () => {
    const req = new NextRequest("http://localhost:8080/api/auth/resend-verification", {
      method: "POST",
      headers: { referer: "https://mployedin.example/ar/verify-email", "x-forwarded-host": "mployedin.example" },
    });
    expect(resolveRequestLocale(req)).toBe("ar");
  });

  it("matches the Referer against the configured public URL", () => {
    process.env.NEXT_PUBLIC_BASE_URL = "https://mployedin.example";
    const req = new NextRequest("http://localhost:8080/api/auth/resend-verification", {
      method: "POST",
      headers: { referer: "https://mployedin.example/ar/verify-email" },
    });
    expect(resolveRequestLocale(req)).toBe("ar");
  });

  it("ignores a Referer from another origin, even one with an /ar path", () => {
    expect(resolveRequestLocale(request({ referer: "https://evil.example/ar/register" }))).toBe("en");
    expect(resolveRequestLocale(request({ referer: "https://evil.example/ar/register", cookie: "NEXT_LOCALE=ar" }))).toBe("ar"); // the cookie answers
    expect(resolveRequestLocale(request({ referer: `http://localhost:9999/ar/register` }))).toBe("en"); // another port is another origin
  });

  it("ignores a Referer that is only an origin (cross-origin policy) and falls back to the cookie", () => {
    expect(resolveRequestLocale(request({ referer: `${ORIGIN}/`, cookie: "NEXT_LOCALE=ar" }))).toBe("ar");
    expect(resolveRequestLocale(request({ referer: ORIGIN }))).toBe("en");
  });

  it("uses a valid NEXT_LOCALE cookie when there is no Referer", () => {
    expect(resolveRequestLocale(request({ cookie: "NEXT_LOCALE=ar" }))).toBe("ar");
    expect(resolveRequestLocale(request({ cookie: "NEXT_LOCALE=en" }))).toBe("en");
  });

  it("defaults to English when there is neither", () => {
    expect(resolveRequestLocale(request())).toBe("en");
  });

  describe("NEXT_LOCALE is a preference cookie: honoured only while preferences are allowed", () => {
    it("ignores NEXT_LOCALE=ar once the visitor refused preferences, and falls back to the default", () => {
      const cookie = `NEXT_LOCALE=ar; ${CONSENT_COOKIE}=${consent(false)}`;
      expect(resolveRequestLocale(request({ cookie }))).toBe("en");
    });

    it("ignores NEXT_LOCALE=ar once refused, and still takes the language from the Referer", () => {
      const cookie = `NEXT_LOCALE=ar; ${CONSENT_COOKIE}=${consent(false)}`;
      expect(resolveRequestLocale(request({ cookie, referer: `${ORIGIN}/ar/register` }))).toBe("ar");
      expect(resolveRequestLocale(request({ cookie, referer: `${ORIGIN}/en/register` }))).toBe("en");
    });

    it("uses NEXT_LOCALE=ar when preferences were accepted", () => {
      const cookie = `NEXT_LOCALE=ar; ${CONSENT_COOKIE}=${consent(true)}`;
      expect(resolveRequestLocale(request({ cookie }))).toBe("ar");
    });

    it("uses NEXT_LOCALE=ar when no choice was made yet (preferences allowed until the visitor objects)", () => {
      expect(resolveRequestLocale(request({ cookie: "NEXT_LOCALE=ar" }))).toBe("ar");
    });
  });

  it.each(["fr", "AR", "", "ar,en", "../ar", "javascript:alert(1)"])("ignores the garbage cookie %j", (value) => {
    expect(resolveRequestLocale(request({ cookie: `NEXT_LOCALE=${encodeURIComponent(value)}` }))).toBe("en");
  });

  it.each(["not a url", "javascript:alert(1)", "//ar/register", "/ar/register", ""])("ignores the garbage Referer %j", (referer) => {
    expect(resolveRequestLocale(request({ referer }))).toBe("en");
  });
});

describe("resolveCallbackLocale: NEXT_LOCALE only while preferences are allowed", () => {
  const OWN = ["localhost:3888"];

  it("ignores NEXT_LOCALE=ar once preferences were refused", () => {
    expect(resolveCallbackLocale(jar({ NEXT_LOCALE: "ar", [CONSENT_COOKIE]: consent(false) }), OWN)).toBe("en");
  });

  it("still reads the locale of the callback URL once preferences were refused", () => {
    const cookies = jar({
      NEXT_LOCALE: "en",
      [CONSENT_COOKIE]: consent(false),
      "authjs.callback-url": `${ORIGIN}/ar/login`,
    });
    expect(resolveCallbackLocale(cookies, OWN)).toBe("ar");
  });

  it("uses NEXT_LOCALE=ar when preferences were accepted", () => {
    expect(resolveCallbackLocale(jar({ NEXT_LOCALE: "ar", [CONSENT_COOKIE]: consent(true) }), OWN)).toBe("ar");
  });
});

describe("resolveCallbackLocale (OAuth sign-in callback)", () => {
  const OWN = ["localhost:3888"];
  const POST_LOGIN = `${ORIGIN}/api/auth/post-login-redirect`;
  const withCallback = (path: string) => `${POST_LOGIN}?callbackUrl=${encodeURIComponent(path)}`;

  it("reads the locale of the page the sign-in forwards to (the usual login/register callback)", () => {
    expect(resolveCallbackLocale(jar({ "authjs.callback-url": withCallback("/ar/employer/jobs") }), OWN)).toBe("ar");
    expect(resolveCallbackLocale(jar({ "authjs.callback-url": withCallback("/en/employer/jobs") }), OWN)).toBe("en");
  });

  it("reads the locale of the callback path itself", () => {
    expect(resolveCallbackLocale(jar({ "authjs.callback-url": `${ORIGIN}/ar/job-seeker` }), OWN)).toBe("ar");
  });

  it("reads a relative callback URL", () => {
    expect(resolveCallbackLocale(jar({ "authjs.callback-url": "/ar/login" }), OWN)).toBe("ar");
  });

  it("reads the __Secure- cookie that Auth.js uses on https, and prefers it", () => {
    const cookies = jar({
      "__Secure-authjs.callback-url": "https://mployedin.example/ar/login",
      "authjs.callback-url": "https://mployedin.example/en/login",
    });
    expect(resolveCallbackLocale(cookies, ["mployedin.example"])).toBe("ar");
    expect(resolveCallbackLocale(jar({ "__Secure-authjs.callback-url": "https://mployedin.example/ar/login" }), ["mployedin.example"])).toBe("ar");
  });

  it("accepts the host as a URL or a Host header value, and ignores empty ones", () => {
    const cookies = jar({ "authjs.callback-url": `${ORIGIN}/ar/login` });
    expect(resolveCallbackLocale(cookies, [null, undefined, "", "other.example"])).toBe("en"); // none of them is this site
    expect(resolveCallbackLocale(cookies, [null, undefined, "", ORIGIN])).toBe("ar");
    expect(resolveCallbackLocale(cookies, ["localhost:3888, proxy.internal"])).toBe("ar"); // first of a forwarded list
    expect(resolveCallbackLocale(cookies, ["LOCALHOST:3888"])).toBe("ar");
  });

  it("reads a callback URL that is still percent-encoded", () => {
    expect(resolveCallbackLocale(jar({ "authjs.callback-url": encodeURIComponent(`${ORIGIN}/ar/login`) }), OWN)).toBe("ar");
    expect(resolveCallbackLocale(jar({ "authjs.callback-url": encodeURIComponent("/ar/login") }), OWN)).toBe("ar");
  });

  it("ignores an absolute URL on another host, then uses NEXT_LOCALE", () => {
    expect(resolveCallbackLocale(jar({ "authjs.callback-url": "https://evil.example/ar/login" }), OWN)).toBe("en");
    expect(resolveCallbackLocale(jar({ "authjs.callback-url": "https://evil.example/ar/login", NEXT_LOCALE: "ar" }), OWN)).toBe("ar");
    // The nested parameter of a foreign URL does not count either.
    expect(resolveCallbackLocale(jar({ "authjs.callback-url": `https://evil.example/x?callbackUrl=${encodeURIComponent("/ar/x")}` }), OWN)).toBe("en");
  });

  it("ignores a protocol-relative or backslash callback and a nested one that is not a path", () => {
    expect(resolveCallbackLocale(jar({ "authjs.callback-url": "//localhost:3888/ar/login" }), OWN)).toBe("en");
    expect(resolveCallbackLocale(jar({ "authjs.callback-url": "/\\ar/login" }), OWN)).toBe("en");
    expect(resolveCallbackLocale(jar({ "authjs.callback-url": `${POST_LOGIN}?callbackUrl=${encodeURIComponent("https://evil.example/ar/x")}` }), OWN)).toBe("en");
    expect(resolveCallbackLocale(jar({ "authjs.callback-url": `${POST_LOGIN}?callbackUrl=${encodeURIComponent("//evil.example/ar/x")}` }), OWN)).toBe("en");
  });

  it("falls back to NEXT_LOCALE when the callback URL names no locale (plain post-login-redirect)", () => {
    expect(resolveCallbackLocale(jar({ "authjs.callback-url": POST_LOGIN, NEXT_LOCALE: "ar" }), OWN)).toBe("ar");
    expect(resolveCallbackLocale(jar({ "authjs.callback-url": POST_LOGIN }), OWN)).toBe("en");
  });

  it("defaults to English with no cookies", () => {
    expect(resolveCallbackLocale(jar({}), OWN)).toBe("en");
  });

  it.each(["", "garbage", "http://", "javascript:alert(1)", "%E0%A4%A", "ftp://localhost:3888/ar/x"])("survives the garbage callback cookie %j", (value) => {
    expect(resolveCallbackLocale(jar({ "authjs.callback-url": value }), OWN)).toBe("en");
    expect(resolveCallbackLocale(jar({ "authjs.callback-url": value, NEXT_LOCALE: "ar" }), OWN)).toBe("ar");
  });

  it("ignores a garbage NEXT_LOCALE", () => {
    expect(resolveCallbackLocale(jar({ NEXT_LOCALE: "fr" }), OWN)).toBe("en");
  });
});

/*
 * A page with no callback path sends OAuth to plain /api/auth/post-login-redirect,
 * which names no language. The login and register pages therefore add
 * `locale=<page locale>` to that URL, and the callback-URL cookie keeps it, so a
 * visitor who refused display settings (no NEXT_LOCALE to fall back on) still
 * gets the language of the page they started from.
 */
describe("resolveCallbackLocale: the locale query parameter", () => {
  const OWN = ["localhost:3888"];
  const POST_LOGIN = `${ORIGIN}/api/auth/post-login-redirect`;
  const cookie = (value: string) => jar({ "authjs.callback-url": value });
  const refused = (extra: Record<string, string> = {}) => ({ [CONSENT_COOKIE]: consent(false), ...extra });

  it("reads ?locale=ar from the plain post-login-redirect URL", () => {
    expect(resolveCallbackLocale(cookie(`${POST_LOGIN}?locale=ar`), OWN)).toBe("ar");
    expect(resolveCallbackLocale(cookie(`${POST_LOGIN}?locale=en`), OWN)).toBe("en");
  });

  it("reads it from a relative callback URL and a percent-encoded cookie value", () => {
    expect(resolveCallbackLocale(cookie("/api/auth/post-login-redirect?locale=ar"), OWN)).toBe("ar");
    expect(resolveCallbackLocale(cookie(encodeURIComponent(`${POST_LOGIN}?locale=ar`)), OWN)).toBe("ar");
  });

  it("reads the cookie value exactly as Auth.js writes it (an absolute, percent-encoded URL; captured from a real sign-in start)", () => {
    const plain = "http%3A%2F%2Flocalhost%3A3888%2Fapi%2Fauth%2Fpost-login-redirect%3Flocale%3Dar";
    const withCallback =
      "http%3A%2F%2Flocalhost%3A3888%2Fapi%2Fauth%2Fpost-login-redirect%3FcallbackUrl%3D%252Far%252Fjobs%252Fabc%26locale%3Dar";
    const unsupported = "http%3A%2F%2Flocalhost%3A3888%2Fapi%2Fauth%2Fpost-login-redirect%3Flocale%3Dfr";
    expect(resolveCallbackLocale(cookie(plain), OWN)).toBe("ar");
    expect(resolveCallbackLocale(cookie(withCallback), OWN)).toBe("ar");
    expect(resolveCallbackLocale(cookie(unsupported), OWN)).toBe("en");
  });

  it("reads it next to a callbackUrl that names no locale", () => {
    const url = `${POST_LOGIN}?callbackUrl=${encodeURIComponent("/jobs/abc")}&locale=ar`;
    expect(resolveCallbackLocale(cookie(url), OWN)).toBe("ar");
  });

  it("keeps the language for a visitor who refused display settings (the point of the parameter)", () => {
    expect(resolveCallbackLocale(jar(refused({ "authjs.callback-url": `${POST_LOGIN}?locale=ar` })), OWN)).toBe("ar");
    // Without the parameter there is nothing to read: the refused NEXT_LOCALE is not used.
    expect(resolveCallbackLocale(jar(refused({ "authjs.callback-url": POST_LOGIN, NEXT_LOCALE: "ar" })), OWN)).toBe("en");
  });

  it("reads it from the __Secure- cookie used on https", () => {
    const secure = jar({ "__Secure-authjs.callback-url": "https://mployedin.example/api/auth/post-login-redirect?locale=ar" });
    expect(resolveCallbackLocale(secure, ["mployedin.example"])).toBe("ar");
  });

  describe("precedence: path > nested callbackUrl > locale parameter > NEXT_LOCALE > en", () => {
    it("the callback path beats the parameter", () => {
      expect(resolveCallbackLocale(cookie(`${ORIGIN}/ar/login?locale=en`), OWN)).toBe("ar");
      expect(resolveCallbackLocale(cookie("/en/login?locale=ar"), OWN)).toBe("en");
    });

    it("the nested callbackUrl beats the parameter", () => {
      const ar = `${POST_LOGIN}?callbackUrl=${encodeURIComponent("/ar/employer")}&locale=en`;
      const en = `${POST_LOGIN}?callbackUrl=${encodeURIComponent("/en/employer")}&locale=ar`;
      expect(resolveCallbackLocale(cookie(ar), OWN)).toBe("ar");
      expect(resolveCallbackLocale(cookie(en), OWN)).toBe("en");
    });

    it("the parameter beats NEXT_LOCALE while preferences are allowed", () => {
      expect(resolveCallbackLocale(jar({ "authjs.callback-url": `${POST_LOGIN}?locale=en`, NEXT_LOCALE: "ar" }), OWN)).toBe("en");
      expect(resolveCallbackLocale(jar({ "authjs.callback-url": `${POST_LOGIN}?locale=ar`, NEXT_LOCALE: "en" }), OWN)).toBe("ar");
    });

    it("NEXT_LOCALE (if allowed) is next, then English", () => {
      expect(resolveCallbackLocale(jar({ "authjs.callback-url": POST_LOGIN, NEXT_LOCALE: "ar" }), OWN)).toBe("ar");
      expect(resolveCallbackLocale(jar({ "authjs.callback-url": POST_LOGIN }), OWN)).toBe("en");
    });
  });

  describe("only a supported locale counts", () => {
    it.each(["fr", "AR", "ar,en", "", "../ar", "ar/../en", "javascript:alert(1)", "%00", "a r", "arabic"])(
      "ignores ?locale=%j and falls back",
      (value) => {
        const url = `${POST_LOGIN}?locale=${encodeURIComponent(value)}`;
        expect(resolveCallbackLocale(cookie(url), OWN)).toBe("en");
        expect(resolveCallbackLocale(jar({ "authjs.callback-url": url, NEXT_LOCALE: "ar" }), OWN)).toBe("ar");
      },
    );

    it("takes the first of a repeated parameter, and still validates it", () => {
      expect(resolveCallbackLocale(cookie(`${POST_LOGIN}?locale=ar&locale=en`), OWN)).toBe("ar");
      expect(resolveCallbackLocale(cookie(`${POST_LOGIN}?locale=fr&locale=ar`), OWN)).toBe("en");
    });
  });

  describe("an absolute URL on another host is still ignored, parameter included", () => {
    it("ignores ?locale=ar on a foreign host and uses NEXT_LOCALE / en", () => {
      const foreign = "https://evil.example/api/auth/post-login-redirect?locale=ar";
      expect(resolveCallbackLocale(cookie(foreign), OWN)).toBe("en");
      expect(resolveCallbackLocale(jar({ "authjs.callback-url": foreign, NEXT_LOCALE: "en" }), OWN)).toBe("en");
    });

    it("ignores a protocol-relative or backslash URL carrying the parameter", () => {
      expect(resolveCallbackLocale(cookie("//localhost:3888/api/auth/post-login-redirect?locale=ar"), OWN)).toBe("en");
      expect(resolveCallbackLocale(cookie("/\\evil.example?locale=ar"), OWN)).toBe("en");
    });

    it("ignores a locale parameter that sits inside a nested callbackUrl (it is only a path there)", () => {
      const nested = `${POST_LOGIN}?callbackUrl=${encodeURIComponent("https://evil.example/x?locale=ar")}`;
      expect(resolveCallbackLocale(cookie(nested), OWN)).toBe("en");
    });
  });
});
