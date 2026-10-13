"use client";

import { useSyncExternalStore } from "react";

/** Phones: the same max-width the responsive card tables collapse at. */
export const PHONE_QUERY = "(max-width: 639px)";

/**
 * Whether a CSS media query matches. False on the server and during
 * hydration (so the desktop markup hydrates cleanly), then the real value.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== "function") return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    // jsdom has no matchMedia: treat it as desktop.
    () => typeof window.matchMedia === "function" && window.matchMedia(query).matches,
    () => false,
  );
}
