import { CONSENT_COOKIE, allowed, parseConsent } from "./state";

export const LOCALE_COOKIE = "NEXT_LOCALE";
/** 12 months, matching the registry row and what the language switcher writes. */
export const LOCALE_COOKIE_MAX_AGE_S = 31536000;

/**
 * Whether the proxy may let next-intl read and refresh NEXT_LOCALE for this request.
 *
 * NEXT_LOCALE is a preference cookie, so a visit must never create it: the proxy only
 * uses next-intl's cookie handling when the request already carries one (the visitor
 * picked a language with the switcher) and the visitor has not objected to preferences.
 * Pure on purpose (no browser APIs) so the Edge proxy can import it.
 */
export function localeCookieEnabled(cookies: { get(name: string): { value: string } | undefined }): boolean {
  if (!cookies.get(LOCALE_COOKIE)?.value) return false;
  return allowed(parseConsent(cookies.get(CONSENT_COOKIE)?.value), "preferences");
}
