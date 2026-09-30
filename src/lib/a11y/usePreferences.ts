"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  applyPreferences,
  decodePreferencesCookie,
  DEFAULT_PREFERENCES,
  encodePreferencesCookie,
  PREFERENCES_COOKIE,
  PREFERENCES_COOKIE_MAX_AGE,
  type A11yPreferences,
} from "@/lib/a11y/preferences";

const listeners = new Set<() => void>();
// Used when cookies are blocked: the choice still holds for the rest of the visit.
let unsavedValue: string | null = null;
let snapshot: { value: string | null; prefs: A11yPreferences } = { value: null, prefs: DEFAULT_PREFERENCES };

function readCookie(): string | null {
  const prefix = `${PREFERENCES_COOKIE}=`;
  const found = document.cookie.split("; ").find((part) => part.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function getSnapshot(): A11yPreferences {
  const value = unsavedValue ?? readCookie();
  if (value !== snapshot.value) snapshot = { value, prefs: decodePreferencesCookie(value) };
  return snapshot.prefs;
}

function getServerSnapshot(): A11yPreferences {
  return DEFAULT_PREFERENCES;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Changed in another tab: pick it up when this one is looked at again.
  const onVisible = () => {
    if (document.visibilityState !== "visible") return;
    applyPreferences(document.documentElement, getSnapshot());
    listener();
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    listeners.delete(listener);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

/**
 * Puts the saved choices on <html>. Reads the cookie itself rather than taking
 * React state: during hydration that state is still the server's defaults,
 * and applying those would briefly undo what the server rendered.
 */
export function syncPreferencesToDocument(): void {
  applyPreferences(document.documentElement, getSnapshot());
}

export function savePreferences(prefs: A11yPreferences): void {
  const value = encodePreferencesCookie(prefs);
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${PREFERENCES_COOKIE}=${value}; Path=/; Max-Age=${PREFERENCES_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
  unsavedValue = readCookie() === value ? null : value;
  applyPreferences(document.documentElement, prefs);
  for (const listener of listeners) listener();
}

export function useA11yPreferences() {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const update = useCallback((patch: Partial<A11yPreferences>) => {
    savePreferences({ ...getSnapshot(), ...patch });
  }, []);
  const reset = useCallback(() => savePreferences(DEFAULT_PREFERENCES), []);
  return { prefs, update, reset };
}

// ── Panel open state ─────────────────────────────────────────────────────
// The floating button and the dashboards' account-menu item open the same panel.

let panelOpen = false;
const panelListeners = new Set<() => void>();

function setPanelOpen(open: boolean) {
  if (panelOpen === open) return;
  panelOpen = open;
  for (const listener of panelListeners) listener();
}

export function openAccessibilityPanel(): void {
  setPanelOpen(true);
}

export function useAccessibilityPanelOpen(): [boolean, (open: boolean) => void] {
  const open = useSyncExternalStore(
    (listener) => {
      panelListeners.add(listener);
      return () => panelListeners.delete(listener);
    },
    () => panelOpen,
    () => false,
  );
  return [open, setPanelOpen];
}
