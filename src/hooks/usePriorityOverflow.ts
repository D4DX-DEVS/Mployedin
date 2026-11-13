"use client";

import { useEffect, useLayoutEffect, useState, type RefObject } from "react";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

interface PriorityOverflowOptions {
  /** Index (among the `data-overflow-item` children) that must stay on the row. */
  activeIndex?: number;
  /** Changes whenever the items' text changes (labels, counts), to re-measure. */
  watch?: string;
}

/**
 * "Priority plus" row: reports which items of a one-line list do not fit, so
 * the caller can move them under a More button instead of letting the row
 * scroll sideways or cut a label mid-word.
 *
 * Markup contract (direct children of the list):
 *  - each item carries `data-overflow-item`
 *  - the More trigger carries `data-overflow-more`
 *  - an item the caller hides must stay measurable: hide it with
 *    `data-overflowed="true"` (position:absolute + visibility:hidden in
 *    globals.css), never `display:none`.
 * An item that is `display:none` for its own reasons (a phone-hidden tab)
 * measures 0 and is left alone.
 *
 * Returns the indexes that overflow. Empty until measured, and empty where
 * there is no layout (tests), so everything renders.
 */
export function usePriorityOverflow(
  listRef: RefObject<HTMLElement | null>,
  { activeIndex = -1, watch = "" }: PriorityOverflowOptions = {},
): readonly number[] {
  const [overflow, setOverflow] = useState<readonly number[]>([]);

  useIsomorphicLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const measure = () => {
      const available = list.clientWidth;
      if (available === 0) return;
      const items = Array.from(list.querySelectorAll<HTMLElement>(":scope > [data-overflow-item]"));
      const more = list.querySelector<HTMLElement>(":scope > [data-overflow-more]");
      const gap = Number.parseFloat(getComputedStyle(list).columnGap) || 0;
      const widths = items.map((item) => item.offsetWidth);
      const shown = widths.flatMap((width, index) => (width > 0 ? [index] : []));
      const total = shown.reduce((sum, index) => sum + widths[index], 0) + gap * Math.max(shown.length - 1, 0);

      let next: number[] = [];
      if (total > available + 0.5) {
        const keep = new Set<number>();
        let used = more?.offsetWidth ?? 0;
        if (shown.includes(activeIndex)) {
          keep.add(activeIndex);
          used += widths[activeIndex] + gap;
        }
        for (const index of shown) {
          if (index === activeIndex) continue;
          if (used + widths[index] + gap > available) break;
          keep.add(index);
          used += widths[index] + gap;
        }
        next = shown.filter((index) => !keep.has(index));
      }
      setOverflow((current) => (current.join() === next.join() ? current : next));
    };

    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [listRef, activeIndex, watch]);

  return overflow;
}
