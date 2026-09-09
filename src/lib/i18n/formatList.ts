/**
 * Joins items the way the locale writes a list: "a, b, and c" in English,
 * "a وb وc" in Arabic. Falls back to comma-joining where Intl.ListFormat is
 * missing (very old runtimes) or the locale tag is unknown.
 */
export function formatList(items: readonly string[], locale: string): string {
  if (items.length === 0) return "";
  if (typeof Intl !== "undefined" && "ListFormat" in Intl) {
    try {
      return new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(items);
    } catch {
      // fall through to the plain join below
    }
  }
  return items.join(", ");
}
