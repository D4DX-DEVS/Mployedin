"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import type { JobFormValues } from "./jobFormSchema";

const DRAFT_SAVE_DELAY = 1500; // ms

interface UseJobFormDraftReturn {
  draftId: string | null;
  savedIndicator: boolean;
  saveDraft: (values: JobFormValues) => Promise<string | null>;
  loadDraft: () => JobFormValues | null;
}

export function useJobFormDraft(locale: string): UseJobFormDraftReturn {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? "anonymous";
  const storageKey = `job-draft-${userId}`;

  const [draftId, setDraftId] = useState<string | null>(null);
  const [savedIndicator, setSavedIndicator] = useState(false);
  const indicatorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // On mount, check if there's an existing draftId in localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { draftId?: string };
        if (parsed.draftId) {
          setDraftId(parsed.draftId);
        }
      }
    } catch {
      // ignore parse errors
    }
  }, [storageKey]);

  const flashSaved = useCallback(() => {
    setSavedIndicator(true);
    if (indicatorTimer.current) clearTimeout(indicatorTimer.current);
    indicatorTimer.current = setTimeout(() => setSavedIndicator(false), 2500);
  }, []);

  const saveDraft = useCallback(
    async (values: JobFormValues): Promise<string | null> => {
      try {
        // Always persist to localStorage first for resilience
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

        // Persist to localStorage
        localStorage.setItem(
          storageKey,
          JSON.stringify({ draftId: id, values, savedAt: Date.now() })
        );

        flashSaved();
        return id;
      } catch {
        // Silently save to localStorage even when API fails
        localStorage.setItem(
          storageKey,
          JSON.stringify({ draftId, values, savedAt: Date.now() })
        );
        flashSaved();
        return draftId;
      }
    },
    [draftId, locale, storageKey, flashSaved]
  );

  const loadDraft = useCallback((): JobFormValues | null => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { values?: JobFormValues };
      return parsed.values ?? null;
    } catch {
      return null;
    }
  }, [storageKey]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (indicatorTimer.current) clearTimeout(indicatorTimer.current);
    };
  }, []);

  return { draftId, savedIndicator, saveDraft, loadDraft };
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
