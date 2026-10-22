"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import type { JobFormValues } from "./jobFormSchema";
import { migrateLegacyDraft, parseStoredDraft, type StoredDraft } from "./jobDraftStorage";
import { JOB_DRAFT_PREFIX, isSignOutInProgress } from "@/lib/consent/deviceStorage";

const DRAFT_SAVE_DELAY = 1500; // ms

/**
 * The raw stored draft for this key. Reads sessionStorage — the draft is
 * tab-scoped so it does not outlive sign-out on a shared device — after moving
 * across anything an older build left in localStorage.
 *
 * The move (and the purge of every other `job-draft-*` that comes with it) runs
 * only once the session says whose drafts these are. On a hard reload the first
 * render has no session yet, so the key is `job-draft-anonymous`; purging then
 * would delete the real user's draft before it could be moved.
 */
function readDraftRaw(storageKey: string, signedIn: boolean): string | null {
  if (signedIn) migrateLegacyDraft(storageKey, localStorage, sessionStorage);
  return sessionStorage.getItem(storageKey);
}

/** Writes the tab's draft, unless sign-out has started and the device is being wiped. */
function writeDraftRaw(storageKey: string, value: string): void {
  if (isSignOutInProgress()) return;
  sessionStorage.setItem(storageKey, value);
}

interface UseJobFormDraftReturn {
  draftId: string | null;
  savedIndicator: boolean;
  saveDraft: (values: JobFormValues) => Promise<string | null>;
  loadDraft: () => StoredDraft | null;
  autosaveLocal: (values: JobFormValues) => void;
  clearDraft: () => void;
}

export function useJobFormDraft(locale: string): UseJobFormDraftReturn {
  const { data: session } = useSession();
  const sessionUserId = session?.user?.id;
  const signedIn = Boolean(sessionUserId);
  const userId = sessionUserId ?? "anonymous";
  const storageKey = `${JOB_DRAFT_PREFIX}${userId}`;

  const [draftId, setDraftId] = useState<string | null>(null);
  const [savedIndicator, setSavedIndicator] = useState(false);
  const indicatorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // On mount, check if there's an existing draftId in the tab's session storage
  useEffect(() => {
    try {
      const raw = readDraftRaw(storageKey, signedIn);
      if (raw) {
        const parsed = JSON.parse(raw) as { draftId?: string };
        if (parsed.draftId) {
          setDraftId(parsed.draftId);
        }
      }
    } catch {
      // ignore parse errors
    }
  }, [storageKey, signedIn]);

  const flashSaved = useCallback(() => {
    setSavedIndicator(true);
    if (indicatorTimer.current) clearTimeout(indicatorTimer.current);
    indicatorTimer.current = setTimeout(() => setSavedIndicator(false), 2500);
  }, []);

  const saveDraft = useCallback(
    async (values: JobFormValues): Promise<string | null> => {
      try {
        // Always persist locally first for resilience
        const existing = draftId;
        const payload = {
          ...values,
          status: "draft",
          expiresAt: values.expiresAt
            ? new Date(values.expiresAt).toISOString()
            : undefined,
          // Map form location to API structure (country/city are required by model)
          location: {
            country: values.location.country || "",
            city: values.location.city || "",
            isRemote: values.location.isRemote,
          },
        };

        let id = existing;

        if (existing) {
          // PATCH existing draft
          const res = await fetch(`/api/jobs/${existing}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            // Draft may have been deleted — create fresh
            id = null;
          }
        }

        if (!id) {
          // POST new draft
          const res = await fetch(`/${locale}/api/jobs`.replace(`/${locale}/api`, "/api"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (res.ok) {
            const data = (await res.json()) as { job: { _id: string } };
            id = String(data.job._id);
            setDraftId(id);
          }
        }

        // Persist to the tab's session storage
        writeDraftRaw(
          storageKey,
          JSON.stringify({ draftId: id, values, savedAt: Date.now() })
        );

        flashSaved();
        return id;
      } catch {
        // Silently save locally even when API fails
        writeDraftRaw(
          storageKey,
          JSON.stringify({ draftId, values, savedAt: Date.now() })
        );
        flashSaved();
        return draftId;
      }
    },
    [draftId, locale, storageKey, flashSaved]
  );

  const loadDraft = useCallback((): StoredDraft | null => {
    try {
      const draft = parseStoredDraft(readDraftRaw(storageKey, signedIn));
      // An expired draft is cleared on sight so it cannot be offered again.
      if (!draft) sessionStorage.removeItem(storageKey);
      return draft;
    } catch {
      return null;
    }
  }, [storageKey, signedIn]);

  // Lightweight local-only autosave that writes to the SAME key loadDraft reads,
  // preserving any existing draftId so a later API sync can PATCH the right draft.
  const autosaveLocal = useCallback(
    (values: JobFormValues) => {
      try {
        writeDraftRaw(
          storageKey,
          JSON.stringify({ draftId, values, savedAt: Date.now() })
        );
      } catch {
        // ignore storage errors
      }
    },
    [storageKey, draftId]
  );

  // Remove the locally persisted draft (after a successful publish, or when the
  // employer declines to restore it). The draft id goes with it: a later save
  // must create a new server draft rather than patch the discarded one.
  const clearDraft = useCallback(() => {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      // ignore storage errors
    }
    setDraftId(null);
  }, [storageKey]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (indicatorTimer.current) clearTimeout(indicatorTimer.current);
    };
  }, []);

  return { draftId, savedIndicator, saveDraft, loadDraft, autosaveLocal, clearDraft };
}

/** Debounce a callback — returns stable function */
export function useDebounce<T extends unknown[]>(
  fn: (...args: T) => void,
  delay: number
): (...args: T) => void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback(
    (...args: T) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => fn(...args), delay);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fn, delay]
  );
}
