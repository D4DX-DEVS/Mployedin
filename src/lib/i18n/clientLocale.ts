import { LOCALE_COOKIE, localeCookieEnabled } from "@/lib/consent/localeCookie";
import { localeFromPath, type RequestLocale } from "@/lib/i18n/localePath";

/** document.cookie as the `{ get(name) }` jar that localeCookieEnabled reads. Values stay as stored (not decoded). */
function documentCookies(): { get(name: string): { value: string } | undefined } {
  const values = new Map<string, string>();
  for (const part of document.cookie.split(";")) {
    const at = part.indexOf("=");
    if (at > 0) values.set(part.slice(0, at).trim(), part.slice(at + 1).trim());
  }
  return { get: (name) => (values.has(name) ? { value: values.get(name) as string } : undefined) };
}

/**
 * The language for a page that renders outside the [locale] layouts (the root
 * error boundary, the offline page), in the browser.
 *
 * 1. The URL the visitor is on: `/ar/...` is Arabic, `/en/...` English. It is
 *    always there and is not a preference, so it counts even after an objection.
 * 2. NEXT_LOCALE - a preference cookie - but only while preferences are allowed
 *    (the same rule as the proxy and the server helpers: localeCookieEnabled).
 * 3. The browser's language, then English.
 *
 * On the server (no window) it is English.
 */
export function resolveClientLocale(): RequestLocale {
  if (typeof window === "undefined" || typeof document === "undefined") return "en";

  const fromPath = localeFromPath(window.location.pathname);
  if (fromPath) return fromPath;

  const cookies = documentCookies();
  if (localeCookieEnabled(cookies)) {
    const value = cookies.get(LOCALE_COOKIE)?.value;
    if (value === "ar" || value === "en") return value;
  }

  return typeof navigator !== "undefined" && navigator.language?.startsWith("ar") ? "ar" : "en";
}
