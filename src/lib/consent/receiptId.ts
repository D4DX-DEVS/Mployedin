/**
 * The choice reference: the random id `writeConsent()` puts in the `mpl_consent`
 * cookie, one fresh id per Reject all / Accept all / Save choices. RFC 4122
 * shape, 36 characters. The visitor sees it in Cookie settings as "Your choice
 * reference"; the receipt route, the admin consent routes and the admin lookup
 * box all validate it with this one pattern.
 *
 * Client-safe (no server imports) so the admin lookup input can use it too.
 */
export const RECEIPT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True only for a full reference: no spaces, no prefix, nothing a query could smuggle in. */
export function isReceiptId(value: unknown): value is string {
  return typeof value === "string" && RECEIPT_ID_PATTERN.test(value);
}
