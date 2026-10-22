"use client";
import { allowed } from "./state";
import { readConsent } from "./client";

function persistent(): boolean {
  try { return allowed(readConsent(), "preferences"); } catch { return false; }
}

export const prefStorage = {
  get(key: string): string | null {
    try { return (persistent() ? localStorage.getItem(key) : null) ?? sessionStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string): void {
    try { (persistent() ? localStorage : sessionStorage).setItem(key, value); } catch {}
  },
  remove(key: string): void {
    try { localStorage.removeItem(key); sessionStorage.removeItem(key); } catch {}
  },
  /**
   * For a key renamed to `ui:<old>`: the current key if present, else the value an older build left
   * under `legacyKey` in localStorage. That value moves to the current key (sessionStorage if the
   * person objected to preferences) and the old key is deleted, so it is migrated once.
   */
  getWithLegacy(key: string, legacyKey: string): string | null {
    const current = prefStorage.get(key);
    if (current !== null) return current;
    let legacy: string | null;
    try { legacy = localStorage.getItem(legacyKey); } catch { return null; }
    if (legacy === null) return null;
    prefStorage.set(key, legacy);
    try { localStorage.removeItem(legacyKey); } catch { /* storage blocked: the value was still read */ }
    return legacy;
  },
};
