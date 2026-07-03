/**
 * Short relative time ("5 minutes ago" / "قبل ٥ دقائق") via the native
 * Intl.RelativeTimeFormat — locale-correct, no hardcoded strings.
 * Minute/hour/day granularity (dashboard draft cards, activity feeds).
 */
export function relativeTime(iso: string | Date, locale: string): string {
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60_000);
    const rtf = new Intl.RelativeTimeFormat(locale === "ar" ? "ar" : "en", {
      numeric: "auto",
    });
    if (mins < 1) return rtf.format(0, "minute");
    if (mins < 60) return rtf.format(-mins, "minute");
    const hours = Math.floor(mins / 60);
    if (hours < 24) return rtf.format(-hours, "hour");
    return rtf.format(-Math.floor(hours / 24), "day");
  } catch {
    return "";
  }
}
