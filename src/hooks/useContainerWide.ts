"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Observes a container and reports whether it is at least `minWidth` wide.
 * Used to switch a panel between its narrow and wide layouts based on the
 * container rather than the viewport.
 */
export function useContainerWide(minWidth: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [isWide, setIsWide] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setIsWide(width >= minWidth);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [minWidth]);
  return [ref, isWide] as const;
}
