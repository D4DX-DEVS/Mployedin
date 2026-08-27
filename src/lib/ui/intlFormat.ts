/**
 * Deterministic date/number formatting.
 *
 * `value.toLocaleDateString()` and `value.toLocaleString()` with no locale
 * argument resolve to the *server's* locale during SSR and the *browser's*
 * locale on the client. When the two differ, React throws
 * "Hydration failed because the server rendered HTML didn't match the client"
 * and discards the server tree. This was happening across every dashboard
 * role, most visibly on the interviews and placements pages.
 *
 * Every helper here passes an explicit locale, so server and client always
 * produce the same string.
 */

/**
 * The locale used when a caller does not pass one.
 *
 * Deliberately `en-US`, which is what the explicit call sites in this codebase
 * already used — the point of these helpers is to remove a hydration bug, not
 * to change how dates look.
 *
 * NOTE: for a UK-facing product `en-GB` is arguably the correct default
 * (26/03/2026 rather than 3/26/2026). That is a product decision, not a bug
 * fix, because the platform also serves Gulf and India markets. Change this
 * one constant to switch the whole app.
 */
export const DEFAULT_INTL_LOCALE = "en-US";

/** Arabic gets a real Arabic locale; anything else falls back to the default. */
export function resolveIntlLocale(locale?: string): string {
  if (!locale) return DEFAULT_INTL_LOCALE;
  if (locale === "ar" || locale.startsWith("ar-")) return "ar-SA";
  return locale.includes("-") ? locale : DEFAULT_INTL_LOCALE;
}

type DateInput = Date | string | number | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date only. Returns an em dash for missing or unparseable input. */
export function formatDate(
  value: DateInput,
  options?: Intl.DateTimeFormatOptions,
  locale?: string
): string {
  const d = toDate(value);
  if (!d) return "—";
  return d.toLocaleDateString(resolveIntlLocale(locale), options);
}

/** Date and time together. */
export function formatDateTime(
  value: DateInput,
  options?: Intl.DateTimeFormatOptions,
  locale?: string
): string {
  const d = toDate(value);
  if (!d) return "—";
  return d.toLocaleString(resolveIntlLocale(locale), options);
}

/** Time only. */
export function formatTime(
  value: DateInput,
  options?: Intl.DateTimeFormatOptions,
  locale?: string
): string {
  const d = toDate(value);
  if (!d) return "—";
  return d.toLocaleTimeString(resolveIntlLocale(locale), options);
}

/**
 * Numbers — thousands separators differ by locale exactly like dates do, so a
 * bare `count.toLocaleString()` is the same hydration hazard.
 *
 * Distinct from `lib/formatNumber.ts`, which requires a locale and renders
 * Arabic-Indic digits; this one is the safe default for call sites that have
 * no locale in scope.
 */
export function formatCount(
  value: number | null | undefined,
  options?: Intl.NumberFormatOptions,
  locale?: string
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString(resolveIntlLocale(locale), options);
}
