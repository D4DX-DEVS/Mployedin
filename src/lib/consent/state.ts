export const CONSENT_COOKIE = "mpl_consent";
export const CONSENT_VERSION = 1; // bump when categories or banner wording change -> everyone re-asked
// [LEGAL] no fixed legal period; 6 months is the conservative default, 12 needs sign-off
export const CONSENT_MAX_AGE_S = 60 * 60 * 24 * 182;
// Owner decision D1 (confirmed 2026-10-20). true = PECR Sch A1 appearance exception:
// preference items are allowed unless the user objected (Reject all / Preferences switch off).
// Only items whose sole purpose is adapting appearance/function to a user's choice may be category "preferences".
export const APPEARANCE_EXCEPTION_ENABLED = true;

export type ConsentCategory = "necessary" | "preferences" | "media";
export type ConsentState = { v: number; id: string; preferences: boolean; media: boolean; at: string };

export function parseConsent(raw: string | undefined | null): ConsentState | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(decodeURIComponent(raw));
    if (!o || typeof o !== "object" || o.v !== CONSENT_VERSION) return null;
    return {
      v: CONSENT_VERSION,
      id: String(o.id ?? "").slice(0, 36),
      preferences: o.preferences === true,
      media: o.media === true,
      at: String(o.at ?? "").slice(0, 40),
    };
  } catch {
    return null;
  }
}

export function serializeConsent(s: ConsentState): string {
  return encodeURIComponent(JSON.stringify(s));
}

// Client-side storage/embedding decisions only. Never used for authn/authz or to unlock server processing.
export function allowed(s: ConsentState | null, c: ConsentCategory): boolean {
  if (c === "necessary") return true;
  if (c === "preferences" && APPEARANCE_EXCEPTION_ENABLED) return s === null ? true : s.preferences;
  return s?.[c] === true;
}
