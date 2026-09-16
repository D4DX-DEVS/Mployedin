/** Default response window offered to a candidate, in milliseconds. */
const DEFAULT_RESPONSE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Expiry to use when the employer does not name one.
 *
 * A flat "now + 7 days" overshoots whenever the job starts sooner than that,
 * producing an offer whose response deadline falls after its own start date —
 * the exact shape `offerCreateSchema` now rejects. Clamping to the start date
 * keeps the default inside the window the schema enforces.
 */
export function defaultOfferExpiry(startDate: Date): Date {
  const window = new Date(Date.now() + DEFAULT_RESPONSE_WINDOW_MS);
  return window > startDate ? new Date(startDate) : window;
}
