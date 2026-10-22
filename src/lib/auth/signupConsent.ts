import { parseCookieChoice, readCookieChoice, type CookieChoice } from "@/lib/gdpr/cookieChoice";
import { normalizeReferralCode } from "@/lib/referrals/url";

/**
 * Social sign-up consent. A new account is never created from a Google,
 * LinkedIn, Apple or e-mail-code sign-in until the person has ticked the Terms
 * of Service & Privacy Policy box — the same consent the e-mail sign-up form
 * asks for. Returning users are not asked again.
 *
 * - Google (Firebase) and e-mail code: the sign-in carries `termsAccepted`
 *   (see signupConsentCredentials). Without it, a new account is refused with
 *   the `consent_required` code, and the page asks and retries with the same
 *   Google token or e-mail code.
 * - LinkedIn and Apple leave the site, so the answer rides in a short-lived
 *   cookie set just before the redirect. Without it, the signIn callback sends
 *   the new user back to /login?error=consent_required&provider=… .
 *
 * The same cookie carries the referral code (`?ref=`) the visitor signed up
 * through, if there was one. It is written here, on the sign-up click, and
 * nowhere earlier: arriving on a referral link stores nothing. The server reads
 * it back in /api/auth/post-login-redirect, which checks the code again.
 *
 * Client-safe: no server imports.
 */
export const SIGNUP_CONSENT_COOKIE = "mpl_signup_consent";
export const SIGNUP_CONSENT_MAX_AGE_SEC = 30 * 60;
export const CONSENT_REQUIRED_CODE = "consent_required";

export interface SignupConsent {
  terms: boolean;
  cookieChoice: CookieChoice | null;
  /** A well-formed referral code; whether it exists is checked where it is used. */
  ref?: string;
}

/**
 * Cookie value: "terms", optionally followed by ".accepted" / ".declined" (the
 * cookie-banner answer), optionally followed by "~" and the referral code.
 * Examples: "terms", "terms.accepted", "terms~MPL-…", "terms.declined~MPL-…".
 * A code that is not shaped like one is left out.
 */
export function encodeSignupConsent(cookieChoice: CookieChoice | null, ref?: string | null): string {
  const base = cookieChoice ? `terms.${cookieChoice}` : "terms";
  const code = normalizeReferralCode(ref);
  return code ? `${base}~${code}` : base;
}

export function parseSignupConsent(value: string | null | undefined): SignupConsent {
  const [main, refPart] = (value ?? "").split("~");
  const [head, choice] = main.split(".");
  const terms = head === "terms";
  const ref = terms ? normalizeReferralCode(refPart) : "";
  return { terms, cookieChoice: parseCookieChoice(choice), ...(ref ? { ref } : {}) };
}

/** Credentials fields for a Firebase / e-mail-code sign-in after the box was ticked. */
export function signupConsentCredentials(): { termsAccepted: "true"; cookieChoice: string } {
  return { termsAccepted: "true", cookieChoice: readCookieChoice() ?? "" };
}

/**
 * Remember the tick across the LinkedIn / Apple round trip. Apple returns with
 * a cross-site POST, which only carries SameSite=None cookies, so on https the
 * cookie is SameSite=None; Secure.
 *
 * `referralCode` is the validated `?ref=` of a referral link; it rides in the
 * cookie for the same 30 minutes and is claimed after the provider redirect.
 */
export function rememberSignupConsent(referralCode?: string | null): void {
  const https = window.location.protocol === "https:";
  const value = encodeSignupConsent(readCookieChoice(), referralCode);
  document.cookie =
    `${SIGNUP_CONSENT_COOKIE}=${value}; Max-Age=${SIGNUP_CONSENT_MAX_AGE_SEC}; Path=/; ` +
    (https ? "SameSite=None; Secure" : "SameSite=Lax");
}

/**
 * Forget the tick (and any referral code riding with it). Run on sign-out: on a shared device the next person must
 * not start LinkedIn / Apple within the 30 minutes and have a new account recorded as Terms-accepted with the
 * previous person's tick and referral code. Both cookie variants are expired (SameSite=None; Secure on https,
 * SameSite=Lax on http).
 */
export function forgetSignupConsent(): void {
  try {
    const https = window.location.protocol === "https:";
    document.cookie = `${SIGNUP_CONSENT_COOKIE}=; Max-Age=0; Path=/; ` + (https ? "SameSite=None; Secure" : "SameSite=Lax");
  } catch {
    // cookies unavailable: nothing was stored either
  }
}
