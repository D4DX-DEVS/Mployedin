/**
 * Locale-prefixed app paths for links that leave the request's own context —
 * notification rows and the emails built from them.
 *
 * A link hardcoded as "/en/…" dropped Arabic readers into the English UI. The
 * bell swaps the segment for the reader's active locale at render time
 * (`localizeActionUrl`), but the email is built from the stored link as-is, so
 * the stored link has to carry the *recipient's* locale, not the sender's.
 */

export type AppLocale = "en" | "ar";

export function normalizeLocale(locale: string | null | undefined): AppLocale {
  return locale === "ar" ? "ar" : "en";
}

/** `localePath("ar", "/job-seeker/offers")` → "/ar/job-seeker/offers". */
export function localePath(locale: string | null | undefined, path: string): string {
  const bare = path.replace(/^\/(?:en|ar)(?=\/|$)/, "");
  const withSlash = bare.startsWith("/") ? bare : `/${bare}`;
  return `/${normalizeLocale(locale)}${withSlash === "/" ? "" : withSlash}`;
}

/**
 * The locale a user reads in (`User.locale`), defaulting to English. Never
 * throws: a link in the wrong language beats failing the action that sent it.
 */
export async function getUserLocale(userId: unknown): Promise<AppLocale> {
  if (!userId) return "en";
  try {
    const { default: User } = await import("@/models/User");
    const user = (await User.findById(String(userId)).select("locale").lean()) as { locale?: string } | null;
    return normalizeLocale(user?.locale);
  } catch {
    return "en";
  }
}

/** `localePath` in the recipient's own locale. */
export async function userLocalePath(userId: unknown, path: string): Promise<string> {
  return localePath(await getUserLocale(userId), path);
}
