"use client";

import { useEffect } from "react";

/** Near the top the bars always show; matches the topbar height. */
const REVEAL_ZONE_PX = 64;
/** Scroll travel needed before a direction counts, so finger jitter never flickers the bars. */
const TOLERANCE_PX = 8;

/**
 * Facebook-style auto-hiding chrome. While enabled, sets
 * `<html data-scroll-chrome="hidden">` as the window scrolls down and clears it
 * the moment the user scrolls back up, returns near the top, or `resetKey`
 * changes (a new page). Writing an attribute instead of state keeps scrolling
 * free of re-renders; CSS decides which bars react, and at which breakpoints.
 */
export function useHideChromeOnScroll(enabled: boolean, resetKey?: string): void {
  useEffect(() => {
    const root = document.documentElement;
    const show = () => {
      delete root.dataset.scrollChrome;
    };
    show();
    if (!enabled) return;

    let lastY = window.scrollY;
    let frame = 0;
    const update = () => {
      frame = 0;
      // Clamped so iOS rubber-banding past either end never reads as a reversal.
      const maxY = Math.max(root.scrollHeight - window.innerHeight, 0);
      const y = Math.min(Math.max(window.scrollY, 0), maxY);
      // The cookie banner is stacked on the tab bar; hiding the bar would
      // leave the banner floating over a gap.
      if (y <= REVEAL_ZONE_PX || root.dataset.cookieBanner === "visible") {
        show();
        lastY = y;
        return;
      }
      const delta = y - lastY;
      if (Math.abs(delta) < TOLERANCE_PX) return;
      if (delta > 0) root.dataset.scrollChrome = "hidden";
      else show();
      lastY = y;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
      show();
    };
  }, [enabled, resetKey]);
}
