"use client";

import { useSyncExternalStore } from "react";

export type LauncherSide = "start" | "end";

/** Where a visitor dragged the floating button: a side, and its centre as a fraction of the viewport height. */
export interface LauncherPosition {
  side: LauncherSide;
  top: number;
}

// A per-browser convenience, so localStorage rather than the preferences
// cookie the server reads: nothing on the server depends on it.
const STORAGE_KEY = "mployedin.a11y.button";

const listeners = new Set<() => void>();
let unsaved: string | null = null;
let snapshot: { raw: string | null; position: LauncherPosition | null } = { raw: null, position: null };

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return unsaved;
  }
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
  try {
    if (raw) window.localStorage.setItem(STORAGE_KEY, raw);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: `unsaved` keeps it for this visit.
  }
  for (const listener of listeners) listener();
}

export function useLauncherPosition(): LauncherPosition | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot,
    () => null,
  );
}
