/**
 * The locale vocabulary shared by the server helpers (requestLocale.ts) and the
 * browser helper (clientLocale.ts). Deliberately import-free: clientLocale.ts
 * ends up in the root error page and the precached offline page, and must not
 * pull a server module (publicOrigin, process.env) into those bundles. A test
 * (clientLocaleImports.test.ts) walks its imports to keep it that way.
 */

/** The languages the site is served in; the same set as `locales` in src/i18n/routing.ts (a test pins it). */
export type RequestLocale = "ar" | "en";

export const SUPPORTED_LOCALES: readonly RequestLocale[] = ["en", "ar"];

/** The query parameter the login and register pages add to the OAuth callback URL to carry the page language. */
export const LOCALE_QUERY_PARAM = "locale";

/** Exactly "en" or "ar": never a free string, never a different case, never padded. */
export function isSupportedLocale(value: unknown): value is RequestLocale {
  return value === "en" || value === "ar";
}

/** "/ar" or "/ar/jobs?x=1" -> "ar". Only a whole first segment counts: "/arabic" is not a locale. */
export function localeFromPath(pathname: string): RequestLocale | null {
  const match = /^\/(ar|en)(?=[/?#]|$)/.exec(pathname);
  return match ? (match[1] as RequestLocale) : null;
}
