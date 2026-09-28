import { formatCurrency } from "@/lib/currency";
import { formatCount } from "@/lib/ui/intlFormat";

/** How a chart value is written out; passed as data so server components can choose it. */
export type ValueFormat = { kind: "count" } | { kind: "currency"; currency: string };

export function formatValue(value: number, format: ValueFormat = { kind: "count" }): string {
  return format.kind === "currency" ? formatCurrency(value, format.currency, "code") : formatCount(value);
}

/** "1.2k", "3.4M" for axis ticks; locale-independent so server and client agree. */
export function compactNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(abs >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k`;
  return String(value);
}
