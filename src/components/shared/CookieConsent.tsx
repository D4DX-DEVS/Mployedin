"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { readCookieChoice, storeCookieChoice, type CookieChoice } from "@/lib/gdpr/cookieChoice";

export interface CookieConsentLabels {
  message: string;
  policy: string;
  accept: string;
  decline: string;
}

interface CookieConsentProps {
  locale: string;
  /**
   * Translated on the server (CookieConsentMount): the banner shows in every
   * route group, and most of them do not ship the `landing` namespace to the
   * client.
   */
  labels: CookieConsentLabels;
}

export default function CookieConsent({ locale, labels }: CookieConsentProps) {
  const [showBanner, setShowBanner] = useState(false);
  // Height of the phone tab bar (job seeker, workspace roles), 0 when none shows.
  const [navOffset, setNavOffset] = useState(0);
  const bannerRef = useRef<HTMLDivElement>(null);
  const { status } = useSession();

  useEffect(() => {
    // readCookieChoice survives blocked storage (it returns null, so the banner shows).
    if (!readCookieChoice()) {
      const timer = setTimeout(() => setShowBanner(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    if (showBanner) {
      document.documentElement.dataset.cookieBanner = "visible";
    } else {
      delete document.documentElement.dataset.cookieBanner;
    }

    return () => {
      delete document.documentElement.dataset.cookieBanner;
    };
  }, [showBanner]);

  useEffect(() => {
    if (!showBanner) return;
    const root = document.documentElement;

    // The tab bars are fixed to the same edge and painted above this banner, so
    // on phones it sat hidden underneath them. Sit on top of whichever one is
    // showing (lg:hidden bars measure 0 on desktop), and publish the banner's
    // top edge so the Copilot button can rise clear of the Accept button.
    const measure = () => {
      const nav = Array.from(document.querySelectorAll<HTMLElement>("[data-bottom-nav]")).find(
        (el) => el.offsetHeight > 0
      );
      const offset = nav?.offsetHeight ?? 0;
      setNavOffset(offset);
      root.style.setProperty("--cookie-banner-top", `${offset + (bannerRef.current?.offsetHeight ?? 0)}px`);
    };

    measure();
    window.addEventListener("resize", measure);
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    // border-box: lifting the banner swaps its bottom padding, which a
    // content-box observer never reports (the tablet offset came out 8px high).
    if (bannerRef.current) ro?.observe(bannerRef.current, { box: "border-box" });

    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
      root.style.removeProperty("--cookie-banner-top");
    };
  }, [showBanner]);

  const choose = (choice: CookieChoice) => {
    storeCookieChoice(choice);
    setShowBanner(false);
    // A signed-in user's answer goes to their consent log (admin GDPR page);
    // a visitor's is sent when they register.
    if (status === "authenticated") {
      void fetch("/api/user/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consentType: "cookies", granted: choice === "accepted" }),
      }).catch(() => undefined);
    }
  };

  const handleAccept = () => choose("accepted");

  const handleDecline = () => choose("declined");

  if (!showBanner) return null;

  return (
    <div
      // Stable, locale-independent hook: other bottom-anchored UI (the public job
      // page's sticky apply bar) measures this banner so it never sits underneath
      // it. Do not key off the aria-label — that string is translated.
      data-cookie-consent=""
      ref={bannerRef}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:p-4"
      // Above a tab bar the safe-area inset is already inside the bar's height.
      style={navOffset ? { bottom: navOffset, paddingBottom: "0.5rem" } : undefined}
      role="region"
      aria-live="polite"
      aria-label={labels.policy}
    >
      <div className="pointer-events-auto mx-auto flex max-w-5xl items-center gap-2 rounded-xl border bg-background/95 p-2.5 shadow-lg backdrop-blur sm:gap-4 sm:px-4 sm:py-3">
        <p className="min-w-0 flex-1 text-xs leading-4 text-muted-foreground sm:text-sm sm:leading-5">
          {labels.message}{" "}
          <Link href={`/${locale}/cookies`} className="font-medium underline underline-offset-2 hover:text-foreground">
            {labels.policy}
          </Link>
        </p>
        <div className="flex shrink-0 gap-1.5 sm:gap-2">
          <Button variant="outline" size="sm" className="min-h-11 px-2.5 sm:px-3" onClick={handleDecline}>
            {labels.decline}
          </Button>
          <Button size="sm" className="min-h-11 px-2.5 sm:px-3" onClick={handleAccept}>
            {labels.accept}
          </Button>
        </div>
      </div>
    </div>
  );
}
