/**
 * Format a number using locale-appropriate digits.
 * Arabic locale → Arabic-Indic numerals (٠١٢٣٤٥٦٧٨٩)
 */
export function formatNumber(n: number, locale: string): string {
  return n.toLocaleString(locale === "ar" ? "ar-EG" : "en-US");
}
