import { formatCount } from "@/lib/ui/intlFormat";

/**
 * A profit amount in its target's currency, in whole units: a target is set in
 * round amounts and a dashboard does not need fils. `compact` is for tight
 * spots such as phone-width tiles and chart ticks.
 */
export function formatProfit(
  value: number | null | undefined,
  currency: string | null | undefined,
  locale?: string,
  notation: "standard" | "compact" = "standard",
): string {
  if (!currency) return formatCount(value, notation === "compact" ? { notation, maximumFractionDigits: 1 } : undefined, locale);
  // minimumFractionDigits pinned: Node's ICU otherwise keeps the currency's
  // default minimum (clamped to 1) and renders "AED 0.0" where browsers render
  // "AED 0" — a hydration mismatch.
  return formatCount(value, { style: "currency", currency, notation, minimumFractionDigits: 0, maximumFractionDigits: notation === "compact" ? 1 : 0 }, locale);
}

/** Whole-number share of a target, or null when no target is set. */
export function shareOf(achieved: number, target: number): number | null {
  return target > 0 ? Math.round((achieved / target) * 100) : null;
}

/** Short month name in the viewer's language; `month` is 1–12. */
export function monthName(month: number, locale?: string): string {
  return new Date(Date.UTC(2000, month - 1, 1)).toLocaleDateString(locale ?? "en-US", { month: "short", timeZone: "UTC" });
}
