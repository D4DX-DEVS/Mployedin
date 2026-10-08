/**
 * Cookie / device-storage consent — shared definitions (server + client).
 *
 * Legal basis this implements (see docs/compliance/COOKIES-AND-PRIVACY.md):
 * - ePrivacy Directive 2002/58/EC art 5(3) + national laws (DE TDDDG §25,
 *   FR CNIL, UK PECR as amended by DUAA 2025): anything stored on or read from
 *   the device that is not strictly necessary needs prior opt-in consent.
 * - GDPR art 4(11) + 7: consent must be specific (per category), freely given,
 *   unambiguous, as easy to withdraw as to give, and provable (art 7(1)).
 * - EDPB cookie banner taskforce (2023): "Reject all" on the first layer with
 *   the same prominence as "Accept all"; no pre-ticked optional categories.
 *
 * Bump CONSENT_POLICY_VERSION whenever the cookie inventory or the purposes
 * change materially — every visitor is then asked again.
 */

export const CONSENT_POLICY_VERSION = "2026-09-28";

/** First-party cookie holding the visitor's choice (strictly necessary). */
export const CONSENT_COOKIE = "mp_consent";

/**
 * How long a choice (accept OR reject) is kept before asking again. CNIL and
 * the Italian Garante recommend ~6 months; the hard cap for the cookie is 13.
 */
export const CONSENT_MAX_AGE_DAYS = 180;
export const CONSENT_MAX_AGE_SECONDS = CONSENT_MAX_AGE_DAYS * 24 * 60 * 60;

/** Window events used to talk between the banner, hooks and settings links. */
export const CONSENT_CHANGE_EVENT = "mp:consent-change";
export const CONSENT_OPEN_EVENT = "mp:open-consent";

export const OPTIONAL_CATEGORIES = ["functional", "analytics", "marketing"] as const;
export type OptionalConsentCategory = (typeof OPTIONAL_CATEGORIES)[number];
export type ConsentCategory = "necessary" | OptionalConsentCategory;

export type ConsentChoices = Record<OptionalConsentCategory, boolean>;

export const CONSENT_METHODS = [
  "accept_all",
  "reject_all",
  "custom",
  "withdraw",
  "gpc",
] as const;
export type ConsentMethod = (typeof CONSENT_METHODS)[number];

export interface ConsentState {
  /** Random pseudonymous id; links the cookie to its server-side record. */
  id: string;
  /** Policy version the choice was made against. */
  version: string;
  /** Epoch ms when the choice was made. */
  timestamp: number;
  choices: ConsentChoices;
  method: ConsentMethod;
  /** Global Privacy Control signal was present when the choice was made. */
  gpc: boolean;
}

export const ALL_DENIED: ConsentChoices = { functional: false, analytics: false, marketing: false };
export const ALL_GRANTED: ConsentChoices = { functional: true, analytics: true, marketing: true };

const ID_RE = /^[A-Za-z0-9-]{8,64}$/;

/**
 * Compact cookie format: `v1|<id>|<version>|<ts>|<f><a><m>|<method>|<gpc>`.
 * Kept small and free of characters that need encoding.
 */
export function serializeConsent(state: ConsentState): string {
  const bits = OPTIONAL_CATEGORIES.map((c) => (state.choices[c] ? "1" : "0")).join("");
  return ["v1", state.id, state.version, String(state.timestamp), bits, state.method, state.gpc ? "1" : "0"].join("|");
}

export function parseConsent(raw: string | undefined | null): ConsentState | null {
  if (!raw) return null;
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const parts = value.split("|");
  if (parts.length !== 7 || parts[0] !== "v1") return null;
  const [, id, version, ts, bits, method, gpc] = parts;
  const timestamp = Number(ts);
  if (!ID_RE.test(id) || !/^[0-9-]{4,20}$/.test(version)) return null;
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  if (!/^[01]{3}$/.test(bits)) return null;
  if (!(CONSENT_METHODS as readonly string[]).includes(method)) return null;
  const choices = Object.fromEntries(
    OPTIONAL_CATEGORIES.map((c, i) => [c, bits[i] === "1"]),
  ) as ConsentChoices;
  return { id, version, timestamp, choices, method: method as ConsentMethod, gpc: gpc === "1" };
}

/** True when there is no valid, current, unexpired choice — show the banner. */
export function needsConsentPrompt(state: ConsentState | null, now = Date.now()): boolean {
  if (!state) return true;
  if (state.version !== CONSENT_POLICY_VERSION) return true;
  return now - state.timestamp > CONSENT_MAX_AGE_SECONDS * 1000;
}

/** Whether a category may run. Necessary is always allowed. */
export function isCategoryAllowed(state: ConsentState | null, category: ConsentCategory): boolean {
  if (category === "necessary") return true;
  if (!state || needsConsentPrompt(state)) return false;
  return state.choices[category] === true;
}

/* ------------------------------------------------------------------ */
/* Cookie & storage inventory — rendered on the cookie policy page and */
/* in the preferences dialog. Keep it in sync with what the app sets.  */
/* ------------------------------------------------------------------ */

export type StorageKind = "cookie" | "localStorage" | "sessionStorage";

export interface CookieInventoryItem {
  name: string;
  category: ConsentCategory;
  kind: StorageKind;
  /** First-party (mployedin) or the third party that sets/reads it. */
  provider: "first-party" | string;
  /** `consent.inventory.<purposeKey>` / `.<durationKey>` translation keys. */
  purposeKey: string;
  durationKey: string;
}

export const COOKIE_INVENTORY: readonly CookieInventoryItem[] = [
  { name: "authjs.session-token / __Secure-authjs.session-token", category: "necessary", kind: "cookie", provider: "first-party", purposeKey: "sessionPurpose", durationKey: "sessionDuration" },
  { name: "authjs.csrf-token / authjs.callback-url", category: "necessary", kind: "cookie", provider: "first-party", purposeKey: "authFlowPurpose", durationKey: "untilBrowserClose" },
  { name: "csrf-token", category: "necessary", kind: "cookie", provider: "first-party", purposeKey: "csrfPurpose", durationKey: "twoHours" },
  { name: CONSENT_COOKIE, category: "necessary", kind: "cookie", provider: "first-party", purposeKey: "consentPurpose", durationKey: "sixMonths" },
  { name: "NEXT_LOCALE", category: "necessary", kind: "cookie", provider: "first-party", purposeKey: "localePurpose", durationKey: "oneYear" },
  { name: "mpl_ref", category: "necessary", kind: "cookie", provider: "first-party", purposeKey: "referralPurpose", durationKey: "oneHour" },
  { name: "mployedin_tenant_view", category: "necessary", kind: "cookie", provider: "first-party", purposeKey: "tenantPurpose", durationKey: "untilBrowserClose" },
  { name: "mp_a11y", category: "necessary", kind: "localStorage", provider: "first-party", purposeKey: "a11yPurpose", durationKey: "untilCleared" },
  { name: "mployedin_remember_email", category: "necessary", kind: "localStorage", provider: "first-party", purposeKey: "rememberPurpose", durationKey: "untilCleared" },
  { name: "copilot-* / drafts", category: "necessary", kind: "localStorage", provider: "first-party", purposeKey: "draftsPurpose", durationKey: "untilCleared" },
  { name: "_GRECAPTCHA", category: "necessary", kind: "cookie", provider: "Google reCAPTCHA", purposeKey: "recaptchaPurpose", durationKey: "sixMonths" },
  { name: "YouTube / Vimeo player", category: "functional", kind: "cookie", provider: "Google (YouTube), Vimeo", purposeKey: "videoPurpose", durationKey: "providerDefined" },
  { name: "jv", category: "analytics", kind: "cookie", provider: "first-party", purposeKey: "jobViewPurpose", durationKey: "oneDay" },
];
