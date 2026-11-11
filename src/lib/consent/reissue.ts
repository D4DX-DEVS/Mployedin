import { CONSENT_COOKIE, CONSENT_MAX_AGE_S, serializeConsent, type ConsentState } from "./state";

/**
 * Seconds a stored choice still has to run: CONSENT_MAX_AGE_S counted from when
 * it was made (`at`), never more than the full period. A date that can't be read,
 * or one in the future, counts as "made now": the cookie is the visitor's own, so
 * the cap is what matters. 0 when the period is over.
 *
 * Pure (no browser or server APIs): the receipt route and the browser both use it.
 */
export function remainingConsentSeconds(state: Pick<ConsentState, "at">, nowMs: number): number {
  const madeAt = Date.parse(state.at);
  const elapsed = Number.isFinite(madeAt) ? Math.max(0, Math.floor((nowMs - madeAt) / 1000)) : 0;
  return Math.max(0, CONSENT_MAX_AGE_S - elapsed);
}

/** The attributes `mpl_consent` always carries; readable by the page (no HttpOnly), which is where every consent check runs. */
export function consentCookieString(state: ConsentState, maxAgeSeconds: number, secure: boolean): string {
  return `${CONSENT_COOKIE}=${serializeConsent(state)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/**
 * The Set-Cookie value that sends a stored choice back to the browser it came
 * from, with the end date it already had.
 *
 * Why: Safari keeps a cookie written by page script for 7 days at most, so a
 * choice written only by `writeConsent()` was forgotten after a week: the
 * banner came back, and until it was answered a "Reject all" no longer counted.
 * The same cookie set by the server in a response header keeps its full life.
 *
 * null when the period is already over: an expired choice is not brought back.
 */
export function consentSetCookie(state: ConsentState, options: { secure: boolean; nowMs: number }): string | null {
  const maxAge = remainingConsentSeconds(state, options.nowMs);
  return maxAge > 0 ? consentCookieString(state, maxAge, options.secure) : null;
}
