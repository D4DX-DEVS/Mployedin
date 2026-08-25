"use client";

import { useCallback, useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * Keeps keyboard focus inside a hand-rolled dialog and restores it on close.
 *
 * Radix-based dialogs already do this; the candidate drawers in the
 * applications view are plain portals with `role="dialog"`, so without this
 * Tab walks straight out into the page behind them (WCAG 2.4.3 / 2.1.2).
 *
 * Returns a **callback ref**, not an object ref. These drawers portal their
 * markup in a later commit than the one that mounts the component, so an
 * effect keyed on mount finds `ref.current === null` and arms nothing. A
 * callback ref fires exactly when the node attaches, and again when it
 * detaches, which is the only reliable signal here.
 *
 * Escape is deliberately NOT handled — each drawer owns its own close
 * behaviour.
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean = true) {
  const teardownRef = useRef<(() => void) | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  const setNode = useCallback((node: T | null) => {
    teardownRef.current?.();
    teardownRef.current = null;
    if (!node || !activeRef.current) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = (): HTMLElement[] =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );

    // Move focus in, so the first Tab lands inside and screen readers announce
    // the dialog rather than leaving the cursor on the trigger behind it.
    const first = focusables()[0];
    if (first) {
      first.focus();
    } else {
      node.setAttribute("tabindex", "-1");
      node.focus();
    }

    // Rather than guessing which element is "last" from a selector — which
    // silently fails the moment the dialog holds something the selector does
    // not list — let the Tab happen and correct it afterwards. Reacting to
    // where focus actually landed is complete by construction.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const backwards = event.shiftKey;

      // Preferred path: stop the Tab before focus leaves. Once focus reaches
      // the browser chrome the document is no longer focused and .focus()
      // calls are ignored, so recovering afterwards is not always possible.
      const items = focusables();
      if (items.length > 0) {
        const edge = backwards ? items[0] : items[items.length - 1];
        if (document.activeElement === edge || !node.contains(document.activeElement)) {
          event.preventDefault();
          (backwards ? items[items.length - 1] : items[0]).focus();
          return;
        }
      }

      // Fallback: the selector above cannot know every focusable the browser
      // recognises, so also correct anything that slips past it.
      setTimeout(() => {
        if (!node.isConnected || node.contains(document.activeElement)) return;
        const remaining = focusables();
        if (remaining.length === 0) {
          node.setAttribute("tabindex", "-1");
          node.focus();
          return;
        }
        (backwards ? remaining[remaining.length - 1] : remaining[0]).focus();
      }, 0);
    };

    document.addEventListener("keydown", handleKeyDown, true);

    teardownRef.current = () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      // Only restore if focus is still inside the dialog being torn down, or
      // has fallen to the body — otherwise the user has already clicked
      // elsewhere and we would yank it away from them.
      if (node.contains(document.activeElement) || document.activeElement === document.body) {
        previouslyFocused?.focus?.();
      }
    };
  }, []);

  // Unmounting the whole component still has to release the listener.
  useEffect(() => () => teardownRef.current?.(), []);

  return setNode;
}
