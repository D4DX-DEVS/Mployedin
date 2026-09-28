/**
 * The cookie-banner choice, shared by the banner (which stores it) and the
 * registration forms (which send it, so the account's consent log records it).
 * Client-safe: no server imports.
 */
export const COOKIE_CONSENT_STORAGE_KEY = "cookie-consent";

export type CookieChoice = "accepted" | "declined";

export function parseCookieChoice(value: unknown): CookieChoice | null {
  return value === "accepted" || value === "declined" ? value : null;
}

/** The visitor's stored choice; null when none was made or storage is blocked. */
export function readCookieChoice(): CookieChoice | null {
  try {
    return parseCookieChoice(window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY));
  } catch {
    return null;
  }
}

/**
 * Remember the visitor's choice in this browser. The banner and the Data &
 * Privacy page both write here, so changing it on one is what the other reads.
 * Returns false when storage is blocked.
 */
export function storeCookieChoice(choice: CookieChoice): boolean {
  try {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, choice);
    return true;
  } catch {
    return false;
  }
}
