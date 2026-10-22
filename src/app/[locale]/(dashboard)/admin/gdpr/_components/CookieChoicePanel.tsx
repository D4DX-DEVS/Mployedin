"use client";

import { useEffect, useRef } from "react";
import { CookieChoiceLookup } from "./CookieChoiceLookup";
import type { CookieChoiceLookupRequest } from "./cookieChoice";

interface CookieChoicePanelProps {
  request: CookieChoiceLookupRequest | null;
  /** "View record" on a signed-in choice: opens the consent record dialog. */
  onViewRecord?: (reference: string) => void;
}

/**
 * Consent tab: "Find a consent record", the lookup of one cookie choice by its
 * reference. It reads the anonymous cookie-choice records, so a "Reject all"
 * from someone who never signed in is as findable as an "Accept all". (The
 * counts are the cards at the top of the tab.)
 *
 * Styled like the Terms version panel beside it. A click on a reference in the
 * table arrives as `request`: the panel scrolls into view and the lookup runs.
 */
export function CookieChoicePanel({ request, onViewRecord }: CookieChoicePanelProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!request) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    ref.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }, [request]);

  return (
    <section ref={ref} className="workspace-panel-surface scroll-mt-20 rounded-2xl panel-body">
      <CookieChoiceLookup request={request} onViewRecord={onViewRecord} />
    </section>
  );
}
