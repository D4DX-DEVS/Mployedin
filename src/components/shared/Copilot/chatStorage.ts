import { isSignOutInProgress } from "@/lib/consent/deviceStorage";
import type { TranscriptItem } from "./types";

export const CHATS_KEY = "copilot-chats";
export const MAX_SAVED_CHATS = 10;

export interface SavedChat {
  id: string;
  title: string;
  updatedAt: number;
  transcript: TranscriptItem[];
  history: { role: "user" | "assistant"; content: string }[];
}

/**
 * Saved chats live in the tab (sessionStorage), not on the device: they can
 * hold candidate names and other people's data, and must not outlive sign-out
 * on a shared computer. `logoutCleanup()` wipes this key.
 */
export function loadChats(): SavedChat[] {
  try {
    const raw = sessionStorage.getItem(CHATS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function persistChats(chats: SavedChat[]): void {
  // The Copilot auto-saves on every transcript change; once sign-out has wiped
  // the device, a save must not put the chat back.
  if (isSignOutInProgress()) return;
  try {
    sessionStorage.setItem(CHATS_KEY, JSON.stringify(chats.slice(0, MAX_SAVED_CHATS)));
  } catch { /* ignore unavailable storage */ }
}

/** Older builds kept chats in localStorage. Delete them; they are not carried over. */
export function removeLegacyChats(): void {
  try {
    localStorage.removeItem(CHATS_KEY);
  } catch { /* ignore unavailable storage */ }
}
