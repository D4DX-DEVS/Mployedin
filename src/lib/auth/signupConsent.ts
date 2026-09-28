import { parseCookieChoice, readCookieChoice, type CookieChoice } from "@/lib/gdpr/cookieChoice";

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
 * Client-safe: no server imports.
 */
export const SIGNUP_CONSENT_COOKIE = "mpl_signup_consent";
export const SIGNUP_CONSENT_MAX_AGE_SEC = 30 * 60;
export const CONSENT_REQUIRED_CODE = "consent_required";

export interface SignupConsent {
  terms: boolean;
  cookieChoice: CookieChoice | null;
}

/** Cookie value: "terms", optionally followed by ".accepted" / ".declined" (the cookie-banner answer). */
export function encodeSignupConsent(cookieChoice: CookieChoice | null): string {
  return cookieChoice ? `terms.${cookieChoice}` : "terms";
}

export function parseSignupConsent(value: string | null | undefined): SignupConsent {
  const [head, choice] = (value ?? "").split(".");
  return { terms: head === "terms", cookieChoice: parseCookieChoice(choice) };
}

/** Credentials fields for a Firebase / e-mail-code sign-in after the box was ticked. */
export function signupConsentCredentials(): { termsAccepted: "true"; cookieChoice: string } {
  return { termsAccepted: "true", cookieChoice: readCookieChoice() ?? "" };
}

/**
 * Remember the tick across the LinkedIn / Apple round trip. Apple returns with
 * a cross-site POST, which only carries SameSite=None cookies, so on https the
 * cookie is SameSite=None; Secure.
 */
export function rememberSignupConsent(): void {
  const https = window.location.protocol === "https:";
  const value = encodeSignupConsent(readCookieChoice());
  document.cookie =
    `${SIGNUP_CONSENT_COOKIE}=${value}; Max-Age=${SIGNUP_CONSENT_MAX_AGE_SEC}; Path=/; ` +
    (https ? "SameSite=None; Secure" : "SameSite=Lax");
}
