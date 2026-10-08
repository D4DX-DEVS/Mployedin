"use client";

import { useEffect, useRef } from "react";

/** A translucent horizontal band that follows the pointer (reading aid). */
export function ReadingGuide() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (ref.current) ref.current.style.transform = `translateY(${e.clientY - 24}px)`;
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-reading-guide=""
      className="pointer-events-none fixed inset-x-0 top-0 z-[9999] h-12 border-y-2 border-[hsl(var(--focus-ring))] bg-[hsl(var(--brand-blue-pale)/0.35)] print:hidden"
    />
  );
}
