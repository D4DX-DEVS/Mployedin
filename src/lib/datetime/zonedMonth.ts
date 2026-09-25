/**
 * Calendar months as a person in `timeZone` sees them.
 *
 * "This month" on a dashboard has to mean the viewer's month: at 01:00 on the
 * 1st in Kolkata the server (UTC) is still in the previous month, and a
 * UTC-based cut-off would credit the first hours of the new month to the old
 * one.
 */

interface ZonedParts {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

/** How far `timeZone`'s wall clock runs ahead of UTC at instant `date`, in ms. */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wallAsUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * The instant local midnight on the 1st falls, `monthsBack` months before the
 * month `now` is in (0 = this month).
 */
export function monthStartInZone(timeZone: string, now: Date, monthsBack = 0): Date {
  const p = zonedParts(now, timeZone);
  const localMidnight = new Date(Date.UTC(p.year, p.month - 1 - monthsBack, 1));
  return new Date(localMidnight.getTime() - zoneOffsetMs(localMidnight, timeZone));
}

/**
 * "YYYY-MM" keys for the last `count` months ending with `now`'s month, oldest
 * first — the same format MongoDB's `$dateToString: "%Y-%m"` produces.
 */
export function recentMonthKeys(timeZone: string, now: Date, count: number): string[] {
  const p = zonedParts(now, timeZone);
  const keys: string[] = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    const d = new Date(Date.UTC(p.year, p.month - 1 - back, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}
