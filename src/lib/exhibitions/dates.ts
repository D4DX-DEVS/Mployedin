/**
 * AG-05: exhibition dates — reject unparseable dates, an end before the start,
 * and (on create) a start more than a year in the past.
 */
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

type DateInput = string | number | Date | null | undefined;

function parse(v: DateInput): Date | null | "invalid" {
  if (v === undefined || v === null || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? "invalid" : d;
}

export function validateExhibitionDates(
  start: DateInput,
  end: DateInput,
  opts: { isCreate?: boolean; now?: Date } = {},
): string | null {
  const s = parse(start);
  const e = parse(end);
  if (s === "invalid") return "Invalid event start date";
  if (e === "invalid") return "Invalid event end date";
  if (s && e && e.getTime() < s.getTime()) return "Event end date cannot be before the start date";
  if (opts.isCreate && s) {
    const now = opts.now ?? new Date();
    if (s.getTime() < now.getTime() - ONE_YEAR_MS) return "Event start date is more than a year in the past";
  }
  return null;
}
