"use client";
import { CONSENT_COOKIE, CONSENT_MAX_AGE_S, CONSENT_VERSION, parseConsent, type ConsentState } from "./state";
import { REGISTRY } from "./registry";
import { sweepLegacyPreferenceKeys } from "./legacyKeys";
import { consentCookieString, remainingConsentSeconds } from "./reissue";

export const CONSENT_EVENT = "mpl:consent-change";
export const OPEN_SETTINGS_EVENT = "mpl:open-cookie-settings";
const A11Y_COOKIE = "mployedin_a11y"; // kept as a session cookie on withdrawal, not deleted

function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Fallback for older browsers and non-secure (http) origins: RFC 4122 v4 shape from getRandomValues.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function secureSuffix(): string {
  return location.protocol === "https:" ? "; Secure" : "";
}

function cookieValue(name: string): string | null {
  const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return m ? m[1] : null;
}

export function readConsent(): ConsentState | null {
  if (typeof document === "undefined") return null;
  return parseConsent(cookieValue(CONSENT_COOKIE));
}

/** The last choice this page stored, so a late answer to an older receipt cannot replace it (restoreNewerChoice). */
let latestChoice: ConsentState | null = null;

export function writeConsent(p: { preferences: boolean; media: boolean }): ConsentState {
  const s: ConsentState = { v: CONSENT_VERSION, id: newId(), preferences: p.preferences, media: p.media, at: new Date().toISOString() };
  // Written here so the choice applies at once. Safari keeps a script-written cookie 7 days only; the
  // receipt route sends the same cookie back in a response header, which gives it its full six months.
  document.cookie = consentCookieString(s, CONSENT_MAX_AGE_S, location.protocol === "https:");
  latestChoice = s;
  try { localStorage.removeItem("cookie-consent"); } catch {} // legacy key; the old choice was given against untrue copy
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: s }));
  return s;
}

/**
 * Called when the receipt route has answered for choice `answeredId`. Its answer sets the cookie back
 * to that choice; if the visitor chose again on this page while the request was on its way, that would
 * undo the newer choice. Put the newer one back. Only when the cookie holds exactly the answered
 * choice: anything else (a choice made in another tab, a cleared cookie) is not this page's to change.
 * No event: the choice in force for this page never changed.
 *
 * Returns the choice it put back, or null when there was nothing to do. The caller sends that
 * choice's receipt once more, so the server sets the cookie again: written from here it is a
 * script-written cookie, which Safari would keep for 7 days only.
 */
export function restoreNewerChoice(answeredId: string): ConsentState | null {
  try {
    if (!latestChoice || latestChoice.id === answeredId) return null;
    if (readConsent()?.id !== answeredId) return null;
    const maxAge = remainingConsentSeconds(latestChoice, Date.now());
    if (maxAge <= 0) return null;
    document.cookie = consentCookieString(latestChoice, maxAge, location.protocol === "https:");
    return readConsent()?.id === latestChoice.id ? latestChoice : null;
  } catch {
    // Cookies blocked: there is nothing to restore.
    return null;
  }
}

function matches(name: string, key: string): boolean {
  return name.endsWith("*") ? key.startsWith(name.slice(0, -1)) : key === name;
}

export async function withdrawCleanup(prev: ConsentState | null, next: ConsentState): Promise<void> {
  const wasAllowed = prev === null ? true : prev.preferences; // D1: no choice = allowed
  if (!wasAllowed || next.preferences) return;
  for (const item of REGISTRY.filter((i) => i.category === "preferences")) {
    if (item.kind === "cookie") {
      if (item.name === A11Y_COOKIE) {
        const v = cookieValue(A11Y_COOKIE);
        if (v !== null) document.cookie = `${A11Y_COOKIE}=${v}; Path=/; SameSite=Lax${secureSuffix()}`; // session cookie (no Max-Age)
      } else document.cookie = `${item.name}=; Max-Age=0; Path=/`;
    }
    if (item.kind === "localStorage") {
      try { Object.keys(localStorage).filter((k) => matches(item.name, k)).forEach((k) => localStorage.removeItem(k)); } catch {}
    }
  }
  // Keys that older builds stored under their pre-`ui:` names are in no REGISTRY row, so the loop
  // above never finds them. Delete them too, or an objection before a page migrated one leaves it behind.
  sweepLegacyPreferenceKeys();
  // Media withdrawal needs no cleanup here: YouTubeFacade listens to CONSENT_EVENT and unmounts the iframe.
}
