"use client";
import { CONSENT_COOKIE, CONSENT_MAX_AGE_S, CONSENT_VERSION, parseConsent, serializeConsent, type ConsentState } from "./state";
import { REGISTRY } from "./registry";
import { sweepLegacyPreferenceKeys } from "./legacyKeys";

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

export function writeConsent(p: { preferences: boolean; media: boolean }): ConsentState {
  const s: ConsentState = { v: CONSENT_VERSION, id: newId(), preferences: p.preferences, media: p.media, at: new Date().toISOString() };
  document.cookie = `${CONSENT_COOKIE}=${serializeConsent(s)}; Max-Age=${CONSENT_MAX_AGE_S}; Path=/; SameSite=Lax${secureSuffix()}`;
  try { localStorage.removeItem("cookie-consent"); } catch {} // legacy key; the old choice was given against untrue copy
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: s }));
  return s;
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
