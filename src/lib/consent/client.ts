"use client";

import { csrfFetch } from "@/lib/security/csrf-client";
import {
  ALL_DENIED,
  CONSENT_CHANGE_EVENT,
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_SECONDS,
  CONSENT_OPEN_EVENT,
  CONSENT_POLICY_VERSION,
  type ConsentCategory,
  type ConsentChoices,
  type ConsentMethod,
  type ConsentState,
  isCategoryAllowed,
  parseConsent,
  serializeConsent,
} from "./config";

type GpcNavigator = Navigator & { globalPrivacyControl?: boolean };

/** Global Privacy Control — a legally binding opt-out in CA/CO/CT and others. */
export function hasGpcSignal(): boolean {
  if (typeof navigator === "undefined") return false;
  return (navigator as GpcNavigator).globalPrivacyControl === true;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : null;
}

export function readStoredConsent(): ConsentState | null {
  return parseConsent(readCookie(CONSENT_COOKIE));
}

function newConsentId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function writeCookie(state: ConsentState): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(serializeConsent(state))}; Max-Age=${CONSENT_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
}

/* ---------------- tiny external store for useSyncExternalStore ------------- */

// useSyncExternalStore needs a stable reference while nothing changed, so the
// parsed state is cached against the raw cookie value. Re-reading the cookie
// on every snapshot also picks up a choice made in another tab.
let cachedRaw: string | null | undefined;
let cached: ConsentState | null = null;

export function getConsentSnapshot(): ConsentState | null {
  const raw = readCookie(CONSENT_COOKIE);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = parseConsent(raw);
  }
  return cached;
}

export function subscribeConsent(listener: () => void): () => void {
  const onVisible = () => {
    if (document.visibilityState === "visible") listener();
  };
  window.addEventListener(CONSENT_CHANGE_EVENT, listener);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.removeEventListener(CONSENT_CHANGE_EVENT, listener);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

/* -------------------------- Google Consent Mode v2 ------------------------- */

type Gtag = (...args: unknown[]) => void;

/**
 * Forwards the choice to Google Consent Mode v2 when a Google tag is present.
 * No Google tag ships today; this keeps the contract ready so adding GA4/Ads
 * later only needs the tag loaded with `default: denied` (see ConsentScript).
 */
export function syncGoogleConsentMode(choices: ConsentChoices): void {
  const w = window as unknown as { gtag?: Gtag; dataLayer?: unknown[] };
  if (typeof w.gtag !== "function") return;
  const g = (on: boolean) => (on ? "granted" : "denied");
  w.gtag("consent", "update", {
    analytics_storage: g(choices.analytics),
    ad_storage: g(choices.marketing),
    ad_user_data: g(choices.marketing),
    ad_personalization: g(choices.marketing),
    functionality_storage: g(choices.functional),
    personalization_storage: g(choices.functional),
    security_storage: "granted",
  });
}

/* ------------------------------ save / withdraw ---------------------------- */

export interface SaveConsentOptions {
  choices: ConsentChoices;
  method: ConsentMethod;
  locale?: string;
}

/**
 * Persist a choice: first-party cookie (so the server can honour it too),
 * change event for listeners, and an append-only server record as proof of
 * consent (GDPR art 7(1)). The record call is best effort — the cookie is the
 * source of truth for the browser and a failed request never re-shows the banner.
 */
export function saveConsent({ choices, method, locale }: SaveConsentOptions): ConsentState {
  const previous = readStoredConsent();
  const gpc = hasGpcSignal();
  const state: ConsentState = {
    id: previous?.id ?? newConsentId(),
    version: CONSENT_POLICY_VERSION,
    timestamp: Date.now(),
    choices: { ...choices },
    method,
    gpc,
  };
  writeCookie(state);
  syncGoogleConsentMode(state.choices);
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: state }));

  void csrfFetch("/api/consent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    keepalive: true,
    body: JSON.stringify({
      consentId: state.id,
      policyVersion: state.version,
      choices: state.choices,
      method: state.method,
      gpc: state.gpc,
      locale,
      pageUrl: window.location.pathname,
    }),
  }).catch(() => {
    /* offline or blocked — the cookie still holds the choice */
  });

  return state;
}

export function withdrawConsent(locale?: string): ConsentState {
  return saveConsent({ choices: { ...ALL_DENIED }, method: "withdraw", locale });
}

/** Open the preferences dialog from anywhere (footer, settings, cookie page). */
export function openConsentPreferences(): void {
  window.dispatchEvent(new Event(CONSENT_OPEN_EVENT));
}

export function hasConsent(category: ConsentCategory): boolean {
  return isCategoryAllowed(getConsentSnapshot(), category);
}

/**
 * Adopt a choice recorded server-side for this account (signed in on a new
 * device) without writing a new proof-of-consent row.
 */
export function adoptConsent(state: ConsentState): void {
  writeCookie(state);
  syncGoogleConsentMode(state.choices);
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: state }));
}
