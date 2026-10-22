/**
 * What a ConsentLog `policyVersion` is, so the admin table can word it.
 *
 * Two kinds of value are stored there:
 *   - Terms / Privacy rows: the version is a date or an ISO timestamp
 *     ("2026-09-29", see lib/gdpr/termsVersion);
 *   - cookie rows: "cookie-v<N>", the wording version of the banner and Cookie
 *     settings (COOKIE_POLICY_VERSION).
 * Anything else is shown as stored. Never a dash and never "Invalid Date".
 *
 * Pure and client-safe.
 */
export type PolicyVersionLabel =
  | { kind: "cookie"; version: number }
  | { kind: "date"; date: Date }
  | { kind: "raw"; value: string };

const COOKIE_VERSION = /^cookie-v(\d+)$/;
/**
 * Date-shaped on purpose: Date.parse is lenient enough to read "version 12" as a
 * date in 2001, so the shape is checked first and the parse second.
 */
const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}(?:[T ]\S*)?$/;

export function classifyPolicyVersion(raw: string): PolicyVersionLabel {
  const cookie = COOKIE_VERSION.exec(raw);
  if (cookie) return { kind: "cookie", version: Number(cookie[1]) };

  if (DATE_SHAPE.test(raw)) {
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) return { kind: "date", date };
  }
  return { kind: "raw", value: raw };
}
