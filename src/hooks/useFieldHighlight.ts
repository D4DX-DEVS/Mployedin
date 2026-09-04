"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const HIGHLIGHT_CLASSES = ["ring-2", "ring-primary", "ring-offset-2", "rounded-lg"];

/**
 * Scrolls to and flashes the element marked `data-field="<name>"` when the URL
 * carries `?highlight=<name>`.
 *
 * Deep links from the setup guide have to land on the control the step is
 * about, not just the page that contains it. This is the settings page's
 * original behaviour, lifted out so the job form can land the same way instead
 * of dropping the employer at the top of a long form.
 */
export function useFieldHighlight(): string | null {
  const searchParams = useSearchParams();
  const [highlightField, setHighlightField] = useState<string | null>(null);

  useEffect(() => {
    const highlight = searchParams.get("highlight");
    if (!highlight) return;

    setHighlightField(highlight);
    // The target may still be mounting when the route settles.
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-field="${highlight}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add(...HIGHLIGHT_CLASSES);
      setTimeout(() => {
        el.classList.remove(...HIGHLIGHT_CLASSES);
        setHighlightField(null);
      }, 3000);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchParams]);

  return highlightField;
}
