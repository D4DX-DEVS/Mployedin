import { LOCALE_COOKIE, localeCookieEnabled } from "@/lib/consent/localeCookie";
import { publicOrigin } from "@/lib/http/publicOrigin";
import { LOCALE_QUERY_PARAM, isSupportedLocale, localeFromPath, type RequestLocale } from "@/lib/i18n/localePath";
import { POST_LOGIN_REDIRECT_PATH, REFERRAL_QUERY_PARAM } from "@/lib/auth/oauthRedirect";
import { normalizeReferralCode } from "@/lib/referrals/url";

/*
 * The language of a request that has no locale in its own URL (an API route, an
 * OAuth callback). NEXT_LOCALE alone is not enough: it is a preference cookie,
 * so a visitor who just landed on /ar, or who objected to preferences, has none.
 * The page the visitor was on carries the language, so that comes first.
 * (`RequestLocale` and `localeFromPath` live in ./localePath, which the browser
 * helper clientLocale.ts also imports; this file is server-only.)
 */

type CookieJar = { get(name: string): { value: string } | undefined };

const DEFAULT_LOCALE: RequestLocale = "en";

/** A path on this site: one slash, not protocol-relative ("//host") and no backslash tricks. */
function isRelativePath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\");
}

/** Lower-cased host (with port) from a URL or from a bare Host header value; "" when there is none. */
function hostOf(value: string | null | undefined): string {
  const first = (value ?? "").split(",")[0].trim().toLowerCase();
  if (!first) return "";
  if (!first.includes("://")) return first;
  try {
    return new URL(first).host.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * NEXT_LOCALE is a preference cookie: it is honoured only while preferences are
 * allowed, by the same rule the proxy uses (localeCookieEnabled), so a visitor
 * who objected is not sorted into a language by a cookie we should not be using.
 */
function cookieLocale(jar: CookieJar): RequestLocale | null {
  if (!localeCookieEnabled(jar)) return null;
  const value = jar.get(LOCALE_COOKIE)?.value;
  return value === "ar" || value === "en" ? value : null;
}

/** The locale of the Referer's path, if the Referer is a page of this site. */
function localeFromReferer(req: { url: string; headers: Headers }): RequestLocale | null {
  const referer = req.headers.get("referer");
  if (!referer) return null;
  let url: URL;
  try {
    url = new URL(referer);
  } catch {
    return null;
  }
  // This site's own host: as the proxy forwarded it, as the request names it, and the configured public URL.
  const own = new Set(
    [req.headers.get("x-forwarded-host"), req.headers.get("host"), req.url, publicOrigin(req)].map(hostOf).filter(Boolean),
  );
  if (!own.has(url.host.toLowerCase())) return null;
  return localeFromPath(url.pathname);
}

/**
 * Language for a route handler that e-mails or redirects the visitor: the locale
 * prefix of the same-origin Referer (the page that posted the form), else a
 * valid NEXT_LOCALE cookie (only while preferences are allowed), else "en".
 * The Referer is only read when it names this site; the site sends
 * `Referrer-Policy: strict-origin-when-cross-origin`, so same-origin requests
 * carry the full path and cross-origin ones carry none.
 */
export function resolveRequestLocale(req: { url: string; headers: Headers; cookies: CookieJar }): RequestLocale {
  return localeFromReferer(req) ?? cookieLocale(req.cookies) ?? DEFAULT_LOCALE;
}

/** Auth.js's callback-URL cookie: the name gains `__Secure-` when the site is on https. */
const CALLBACK_URL_COOKIES = ["__Secure-authjs.callback-url", "authjs.callback-url"] as const;

/** A cookie value Auth.js wrote percent-encoded may arrive still encoded. */
function decodedCookie(value: string): string {
  if (!/^(https?%3A|%2F)/i.test(value)) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * A callback URL as a URL object: a path on this site, or an absolute http(s) URL
 * whose host is one of `ownHosts`. Anything else (another site, "//host", a
 * backslash trick, a non-http scheme) is null and is never read.
 */
function ownCallbackUrl(raw: string, ownHosts: Set<string>): URL | null {
  try {
    if (isRelativePath(raw)) return new URL(raw, "http://relative.invalid");
    const url = new URL(raw);
    if (!/^https?:$/.test(url.protocol) || !ownHosts.has(url.host.toLowerCase())) return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * The locale named by a callback URL, in this order: its own path, the page it
 * forwards to (`?callbackUrl=/ar/...`), then its `?locale=ar|en` parameter. The
 * login and register pages send OAuth through
 * `/api/auth/post-login-redirect?callbackUrl=/ar/...&locale=ar`: the nested
 * parameter is there when the visitor was heading somewhere, and `locale` is
 * there always, so a plain sign-in from /ar still says Arabic. Only "en" and
 * "ar" count; anything else is ignored. A URL on another host is ignored whole.
 */
function localeFromCallbackUrl(raw: string, ownHosts: Set<string>): RequestLocale | null {
  const url = ownCallbackUrl(raw, ownHosts);
  if (!url) return null;
  const direct = localeFromPath(url.pathname);
  if (direct) return direct;
  const nested = url.searchParams.get("callbackUrl");
  const fromNested = nested && isRelativePath(nested) ? localeFromPath(nested) : null;
  if (fromNested) return fromNested;
  const param = url.searchParams.get(LOCALE_QUERY_PARAM);
  return isSupportedLocale(param) ? param : null;
}

/**
 * Language for the sign-in callback of an OAuth provider (LinkedIn, Apple). The
 * request comes from the provider, so its Referer says nothing. Use the callback
 * URL the visitor started from (Auth.js stores it in a cookie), then NEXT_LOCALE,
 * then "en". `ownHosts` are this site's hosts or URLs (the request's Host,
 * x-forwarded-host, the configured public URL): an absolute callback URL is read
 * only when it names one of them.
 */
export function resolveCallbackLocale(jar: CookieJar, ownHosts: ReadonlyArray<string | null | undefined>): RequestLocale {
  const hosts = new Set(ownHosts.map(hostOf).filter(Boolean));
  for (const name of CALLBACK_URL_COOKIES) {
    const value = jar.get(name)?.value;
    if (!value) continue;
    const locale = localeFromCallbackUrl(decodedCookie(value), hosts);
    if (locale) return locale;
  }
  return cookieLocale(jar) ?? DEFAULT_LOCALE;
}

/**
 * The referral code a LinkedIn / Apple sign-up started with, for the
 * consent_required bounce. The login page puts it in the post-login-redirect URL
 * (oauthRedirectUrl), Auth.js keeps that URL in its callback-url cookie, and a
 * new account is bounced back to the login page with the code so the page can
 * ask for the Terms tick and start again with the code in mpl_signup_consent.
 *
 * Same rules as resolveCallbackLocale: a relative URL, or an absolute one on one
 * of `ownHosts`; anything else is ignored. Only the post-login-redirect URL
 * counts (not any page that happens to carry `ref`), and only a value shaped
 * like a referral code is returned, so it is safe to put in a redirect.
 * "" when there is none.
 */
export function resolveCallbackReferral(jar: CookieJar, ownHosts: ReadonlyArray<string | null | undefined>): string {
  const hosts = new Set(ownHosts.map(hostOf).filter(Boolean));
  for (const name of CALLBACK_URL_COOKIES) {
    const value = jar.get(name)?.value;
    if (!value) continue;
    const url = ownCallbackUrl(decodedCookie(value), hosts);
    if (url?.pathname !== POST_LOGIN_REDIRECT_PATH) continue;
    const ref = normalizeReferralCode(url.searchParams.get(REFERRAL_QUERY_PARAM));
    if (ref) return ref;
  }
  return "";
}
