"use client";

import { readConsent } from "./client";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE_S } from "./localeCookie";
import { allowed } from "./state";

const LOCALES = ["en", "ar"] as const;

/**
 * Remember a language the visitor picked (the signed-in LanguageSwitcher and the
 * public header's language links) in NEXT_LOCALE, a preference cookie: written
 * only while preferences are allowed. The choice is read from the cookie at the
 * click, not from state kept since mount, so an objection made in another tab
 * counts. Switching language never depends on this: the URL carries it.
 * Returns whether the cookie was written.
 */
export function rememberLocaleChoice(locale: string): boolean {
  if (!(LOCALES as readonly string[]).includes(locale)) return false;
  if (!allowed(readConsent(), "preferences")) return false;
  document.cookie = `${LOCALE_COOKIE}=${locale};path=/;max-age=${LOCALE_COOKIE_MAX_AGE_S};SameSite=Lax`;
  return true;
}
