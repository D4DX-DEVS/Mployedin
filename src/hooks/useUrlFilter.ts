"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { readQuery, writeQuery } from "@/lib/ui/urlQuery";

interface UseUrlFilterOptions {
  /**
   * Delay before the value reaches the URL. Set it for free-text inputs so a
   * `router.replace` does not fire on every keystroke; the returned value still
   * updates immediately so the input stays responsive.
   */
  debounceMs?: number;
  /**
   * The values this filter can hold. A query string is user-editable and can
   * also arrive from an older link, so anything outside the list falls back
   * rather than putting the control into a state its own options cannot
   * express. Omit for free text.
   */
  allow?: readonly string[];
}

/**
 * A list filter that lives in the query string.
 *
 * Filters used to sit in `useState` alone, which made every filtered view
 * unaddressable: a dashboard tile, a notification, a nav badge or the ⌘K
 * palette had nowhere to send the user for "leads due today" because that view
 * had no URL. Swapping `useState` for this hook gives each filter an address
 * and makes browser back/forward restore the list the user was looking at.
 *
 * The fallback is treated as "no filter" and is left out of the URL, so a
 * default view keeps a clean address.
 */
export function useUrlFilter(
  key: string,
  fallback: string = "all",
  options: UseUrlFilterOptions = {},
): [string, (value: string) => void] {
  const { debounceMs = 0, allow } = options;
  const router = useRouter();
  const searchParams = useSearchParams();
  const allowKey = allow ? allow.join(",") : "";

  const sanitize = useCallback(
    (raw: string | null) => {
      if (raw === null || raw === "") return fallback;
      if (allowKey && !allowKey.split(",").includes(raw)) return fallback;
      return raw;
    },
    [allowKey, fallback],
  );

  /* Seeded from `useSearchParams`, not from `readQuery`: these pages are client
     components but Next still renders them on the server, where `window` does
     not exist and `readQuery` returns nothing. Any page opened WITH a filter in
     the URL therefore rendered the fallback on the server and the real value on
     the client — a hydration mismatch that React recovered from by throwing the
     tree away and re-rendering. `readQuery` still drives the effect below,
     where seeing our own pending write is the point. */
  const [value, setValueRaw] = useState(() => sanitize(searchParams.get(key)));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The URL can change without this component unmounting: browser back, or a
  // link to the page the user is already on ("Interviews today" from the
  // dashboard). Without this the address would say one thing and the list show
  // another. A debounced write of our own has not reached the URL yet, so it
  // would look exactly like a stale address — hold off while one is pending.
  useEffect(() => {
    if (timer.current) return;
    const next = sanitize(readQuery().get(key));
    setValueRaw((current) => (current === next ? current : next));
  }, [searchParams, key, sanitize]);

  const commit = useCallback(
    (next: string) => {
      const params = readQuery();
      if (next && next !== fallback) params.set(key, next);
      else params.delete(key);
      // A changed filter always means page 1; leaving ?page=4 behind would open
      // a page the narrowed result set no longer has.
      params.delete("page");
      writeQuery(params, (href) => router.replace(href, { scroll: false }));
    },
    [fallback, key, router],
  );

  const setValue = useCallback(
    (next: string) => {
      setValueRaw(next);
      if (timer.current) clearTimeout(timer.current);
      if (debounceMs > 0) {
        timer.current = setTimeout(() => commit(next), debounceMs);
      } else {
        commit(next);
      }
    },
    [commit, debounceMs],
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return [value, setValue];
}

interface UseUrlFiltersOptions<T> {
  /** Keys whose writes are debounced — free-text inputs. */
  debounceKeys?: (keyof T & string)[];
  debounceMs?: number;
}

export interface UseUrlFiltersReturn<T> {
  filters: T;
  setFilter: (key: keyof T & string, value: string) => void;
  resetFilters: () => void;
}

/**
 * The object form of {@link useUrlFilter}, for pages that already keep their
 * filters in one state object. Each key becomes a query param; a key sitting at
 * its default is left out of the URL.
 */
export function useUrlFilters<T extends Record<string, string>>(
  defaults: T,
  options: UseUrlFiltersOptions<T> = {},
): UseUrlFiltersReturn<T> {
  const { debounceKeys = [], debounceMs = 400 } = options;
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultsRef = useRef(defaults);
  const [filters, setFilters] = useState<T>(() => {
    // Same reason as the single-key hook above: seeded from the SSR-safe params
    // so a page opened with filters in its URL hydrates without a mismatch.
    const params = searchParams;
    const next = { ...defaultsRef.current };
    (Object.keys(next) as (keyof T & string)[]).forEach((key) => {
      const fromUrl = params.get(key);
      if (fromUrl !== null) next[key] = fromUrl as T[keyof T & string];
    });
    return next;
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commit = useCallback(
    (next: T) => {
      const params = readQuery();
      (Object.keys(next) as (keyof T & string)[]).forEach((key) => {
        const value = next[key];
        if (value && value !== defaultsRef.current[key]) params.set(key, value);
        else params.delete(key);
      });
      params.delete("page");
      writeQuery(params, (href) => router.replace(href, { scroll: false }));
    },
    [router],
  );

  const setFilter = useCallback(
    (key: keyof T & string, value: string) => {
      setFilters((previous) => {
        const next = { ...previous, [key]: value } as T;
        if (timer.current) clearTimeout(timer.current);
        if (debounceKeys.includes(key)) timer.current = setTimeout(() => commit(next), debounceMs);
        else commit(next);
        return next;
      });
    },
    // debounceKeys is a literal array at every call site; depending on the
    // joined form keeps the callback stable instead of new on every render.
     
    [commit, debounceMs, debounceKeys.join(",")],
  );

  const resetFilters = useCallback(() => {
    setFilters(defaultsRef.current);
    commit(defaultsRef.current);
  }, [commit]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { filters, setFilter, resetFilters };
}
