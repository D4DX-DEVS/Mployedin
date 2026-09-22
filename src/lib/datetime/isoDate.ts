/**
 * Normalise a loosely-typed value to a `YYYY-MM-DD` string, or `undefined`
 * when it is not a parseable date string. Used to sanitise AI-supplied filter
 * values before they reach a query.
 */
export function normalizeDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const d = new Date(value);
  if (isNaN(d.getTime())) return undefined;
  return d.toISOString().split("T")[0];
}
