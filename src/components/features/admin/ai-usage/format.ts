import { formatCount } from "@/lib/ui/intlFormat";

/** USD for totals: cents, or four places for sub-cent amounts so a call never reads as $0.00. */
export function usd(value: number, locale: string): string {
  const small = value > 0 && value < 0.01;
  return formatCount(value, { style: "currency", currency: "USD", minimumFractionDigits: small ? 4 : 2, maximumFractionDigits: small ? 4 : 2 }, locale);
}

export function compact(value: number, locale: string): string {
  return formatCount(value, { notation: "compact", maximumFractionDigits: 1 }, locale);
}

/** Percentage change against last month, or "new" when there was no spend to compare with. */
export function changePct(current: number, previous: number): number | "new" | 0 {
  if (previous <= 0) return current > 0 ? "new" : 0;
  const pct = Math.round(((current - previous) / previous) * 100);
  return pct;
}

/** Stable colour per feature for charts; lightness differs, not just hue. */
export const FEATURE_COLOURS: Record<string, string> = {
  job_assistant: "#0242ce",
  cv_reading: "#9a4a05",
  job_matching: "#f59e0b",
  poster: "#1d6b3a",
  copilot: "#6b95ee",
  market_report: "#7c3aed",
  lead_tools: "#0b5c8a",
  interview: "#be185d",
  search: "#64748b",
  embeddings: "#94a3b8",
  other: "#b8c2d3",
};

export function featureColour(feature: string): string {
  return FEATURE_COLOURS[feature] ?? FEATURE_COLOURS.other;
}
