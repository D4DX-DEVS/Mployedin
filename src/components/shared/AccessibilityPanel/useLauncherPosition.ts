"use client";

import { useEffect, useSyncExternalStore } from "react";
import { prefStorage } from "@/lib/consent/prefStorage";
import { LEGACY_A11Y_BUTTON_KEY } from "@/lib/consent/legacyKeys";

export type LauncherSide = "start" | "end";

/** Where a visitor dragged the floating button: a side, and its centre as a fraction of the viewport height. */
export interface LauncherPosition {
  side: LauncherSide;
  top: number;
}

// A per-browser convenience, so device storage rather than the preferences
// cookie the server reads: nothing on the server depends on it. Kept through
// prefStorage: on the device while preferences are allowed, for the tab only
// once the visitor objected. Older builds used the unprefixed name (lib/consent/legacyKeys).
const STORAGE_KEY = "ui:mployedin.a11y.button";

const listeners = new Set<() => void>();
let unsaved: string | null = null;
let snapshot: { raw: string | null; position: LauncherPosition | null } = { raw: null, position: null };

/** What an older build left under the unprefixed name; read-only, null when storage is blocked. */
function readLegacy(): string | null {
  try {
    return localStorage.getItem(LEGACY_A11Y_BUTTON_KEY);
  } catch {
    return null;
  }
}

/**
 * A pure read, because it runs inside getSnapshot (during render, possibly many
 * times): nothing here may write. prefStorage reads null when storage is blocked,
 * and `unsaved` then keeps the choice for this visit. The old name is read too,
 * so a saved position shows on the first client render; migrateLegacyPosition
 * moves it afterwards.
 */
function readRaw(): string | null {
  return prefStorage.get(STORAGE_KEY) ?? readLegacy() ?? unsaved;
}

/**
 * Moves a position saved under the old name to the current key (the tab only if
 * the visitor objected to preferences) and deletes the old one. Runs in an
 * effect after mount, never during render; once the old key is gone it does nothing.
 * The value is the same before and after, so no listener needs telling.
 */
function migrateLegacyPosition(): void {
  prefStorage.getWithLegacy(STORAGE_KEY, LEGACY_A11Y_BUTTON_KEY);
}

export function parseLauncherPosition(raw: string | null): LauncherPosition | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<LauncherPosition> | null;
    if (!value || (value.side !== "start" && value.side !== "end")) return null;
    if (typeof value.top !== "number" || !Number.isFinite(value.top)) return null;
    return { side: value.side, top: Math.min(Math.max(value.top, 0), 1) };
  } catch {
    return null;
  }
}

function getSnapshot(): LauncherPosition | null {
  const raw = readRaw();
  if (raw !== snapshot.raw) snapshot = { raw, position: parseLauncherPosition(raw) };
  return snapshot.position;
}

export function saveLauncherPosition(position: LauncherPosition | null): void {
  const raw = position ? JSON.stringify(position) : null;
  unsaved = raw;
  // prefStorage never throws; if storage is blocked, `unsaved` keeps it for this visit.
  if (raw) prefStorage.set(STORAGE_KEY, raw);
  else {
    prefStorage.remove(STORAGE_KEY);
    prefStorage.remove(LEGACY_A11Y_BUTTON_KEY);
  }
  for (const listener of listeners) listener();
}

export function useLauncherPosition(): LauncherPosition | null {
  useEffect(migrateLegacyPosition, []);
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot,
    () => null,
  );
}
