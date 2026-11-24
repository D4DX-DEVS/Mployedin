import type { RangePreset, ReportRange } from "./types";

/**
 * The report's date range, read from the page address (`?range=&from=&to=`).
 * Pure: the page and the API read it the same way, so a shared link opens
 * the same numbers. Default = this year.
 */

export const RANGE_PRESETS: RangePreset[] = ["this_month", "last_month", "last_90", "this_year", "all", "custom"];
export const DEFAULT_PRESET: RangePreset = "this_year";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function iso(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function validIso(s: string | null | undefined): s is string {
  if (!s || !ISO.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && iso(d) === s;
}

export function presetRange(preset: Exclude<RangePreset, "custom">, now: Date = new Date()): ReportRange {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const today = iso(now);
  switch (preset) {
    case "this_month":
      return { preset, from: iso(new Date(Date.UTC(y, m, 1))), to: today };
    case "last_month":
      return { preset, from: iso(new Date(Date.UTC(y, m - 1, 1))), to: iso(new Date(Date.UTC(y, m, 0))) };
    case "last_90":
      return { preset, from: iso(new Date(now.getTime() - 89 * 86_400_000)), to: today };
    case "all":
      return { preset, from: null, to: today };
    case "this_year":
    default:
      return { preset: "this_year", from: iso(new Date(Date.UTC(y, 0, 1))), to: today };
  }
}

/** Read a range from query values; anything invalid falls back to this year. */
export function parseRange(
  input: { range?: string | null; from?: string | null; to?: string | null },
  now: Date = new Date(),
): ReportRange {
  const preset = (RANGE_PRESETS as string[]).includes(input.range ?? "") ? (input.range as RangePreset) : DEFAULT_PRESET;
  if (preset !== "custom") return presetRange(preset, now);
  const to = validIso(input.to) ? input.to : iso(now);
  const from = validIso(input.from) ? input.from : null;
  if (from && from > to) return { preset: "custom", from: to, to: from };
  return { preset: "custom", from, to };
}

/** The range as Date bounds: `from` at 00:00 UTC (null = no lower bound), `to` at the end of that day. */
export function rangeBounds(range: ReportRange): { from: Date | null; to: Date } {
  return {
    from: range.from ? new Date(`${range.from}T00:00:00.000Z`) : null,
    to: new Date(`${range.to}T23:59:59.999Z`),
  };
}

/** A Mongo date condition for the range, e.g. `{ createdAt: dateIn(bounds) }`. */
export function dateIn(bounds: { from: Date | null; to: Date }): Record<string, Date> {
  return bounds.from ? { $gte: bounds.from, $lte: bounds.to } : { $lte: bounds.to };
}

/** Query string for a range (what the page writes to its address and sends to the API). */
export function rangeQuery(range: ReportRange): string {
  const p = new URLSearchParams({ range: range.preset });
  if (range.preset === "custom") {
    if (range.from) p.set("from", range.from);
    p.set("to", range.to);
  }
  return p.toString();
}
