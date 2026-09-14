"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

interface StickyApplyBarProps {
  targetId: string;
  jobTitle: string;
  salaryLine?: string;
}

export function StickyApplyBar({ targetId, jobTitle, salaryLine }: StickyApplyBarProps) {
  const t = useTranslations("publicJobDetail");
  const [isVisible, setIsVisible] = useState(true);
  const observerRef = useRef<IntersectionObserver | null>(null);
  // The cookie-consent banner is also anchored to the bottom of the viewport and
  // sits above this bar, so on a first visit it covered the Easy Apply button and
  // swallowed the tap. Every stranger arriving from a shared link is a first visit,
  // so we lift the bar by exactly the banner's height until it is dismissed.
  const [consentOffset, setConsentOffset] = useState(0);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target) return;

    // Guard for missing IntersectionObserver (e.g., jsdom in tests)
    if (typeof IntersectionObserver === "undefined") {
      return;
    }

    // Create observer to hide the sticky bar when the target is visible
    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(!entry.isIntersecting);
      },
      { threshold: 0.5 }
    );

    observerRef.current.observe(target);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [targetId]);

  useEffect(() => {
    if (typeof MutationObserver === "undefined") return;

    const measure = () => {
      const banner = document.querySelector<HTMLElement>("[data-cookie-consent]");
      setConsentOffset(banner ? banner.offsetHeight : 0);
    };

    measure();

    // The banner mounts after hydration and unmounts on accept/decline, so watch
    // the document rather than measuring once.
    const mo = new MutationObserver(measure);
    mo.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("resize", measure);
    return () => {
      mo.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const handleScroll = () => {
    const element = document.getElementById(targetId);
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div
      // Marks this as the bottom-most dock on the page. Other bottom-anchored
      // overlays (the PWA install nudge) measure it so they stack above the
      // primary call to action instead of painting over it.
      data-bottom-dock=""
      className="lg:hidden fixed inset-x-0 z-40 border-t border-border/40 bg-background/95 backdrop-blur-md transition-[bottom] duration-200"
      style={{
        bottom: consentOffset ? `${consentOffset}px` : 0,
        paddingBottom: consentOffset ? undefined : "env(safe-area-inset-bottom)",
      }}
    >
      <div className="flex items-center justify-between gap-4 px-4 py-3 min-h-15">
        {/* Left: Job title and salary */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{jobTitle}</p>
          {salaryLine && (
            <p className="text-xs text-muted-foreground truncate">{salaryLine}</p>
          )}
        </div>

        {/* Right: Apply button */}
        <Button
          onClick={handleScroll}
          size="sm"
          className="shrink-0 min-h-11"
        >
          {t("stickyApply")}
        </Button>
      </div>
    </div>
  );
}
