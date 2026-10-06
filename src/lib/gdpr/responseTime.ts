const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export type ResponseTimeUnit = "minutes" | "hours" | "days";

export interface ResponseTimeParts {
  unit: ResponseTimeUnit;
  /** Already rounded for display: whole minutes, one decimal for hours and days. */
  value: string;
}

const oneDecimal = (n: number): number => Math.round(n * 10) / 10;

/**
 * How long requests took to answer, in the unit that reads best. A same-day
 * answer used to print as "0 days", which says nothing; this picks minutes,
 * hours or days and rolls over at the boundary so it never shows "60 min" or
 * "24 hrs". `null` means no request has been handled yet.
 */
export function responseTimeParts(ms: number | null): ResponseTimeParts | null {
  if (ms === null) return null;

  const minutes = Math.round(ms / MINUTE_MS);
  if (minutes < 60) return { unit: "minutes", value: String(Math.max(1, minutes)) };

  const hours = oneDecimal(ms / HOUR_MS);
  if (hours < 24) return { unit: "hours", value: String(hours) };

  return { unit: "days", value: String(oneDecimal(ms / DAY_MS)) };
}
