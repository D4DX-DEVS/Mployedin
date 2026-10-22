import { readConsent } from "@/lib/consent/client";

/**
 * The cookie answer in the two-value shape the registration forms send, so an
 * account's consent log records what the visitor chose before signing up.
 *
 * An adapter over the `mpl_consent` cookie (lib/consent/client): the banner
 * and Cookie settings dialog are the only writers. The old localStorage
 * `cookie-consent` key is no longer read; that answer was given against untrue
 * banner copy, so everyone is asked again.
 *
 * No server imports: the server parse sites (auth/config, employer-register)
 * use only parseCookieChoice, and the browser-only function below never runs there.
 */
export type CookieChoice = "accepted" | "declined";

export function parseCookieChoice(value: unknown): CookieChoice | null {
  return value === "accepted" || value === "declined" ? value : null;
}

/**
 * "accepted" when any optional category (Preferences, Media) is on, "declined"
 * when a choice exists with all of them off, null when no choice was made or
 * cookies are blocked.
 */
export function readCookieChoice(): CookieChoice | null {
  const state = readConsent();
  if (!state) return null;
  return state.preferences || state.media ? "accepted" : "declined";
}
