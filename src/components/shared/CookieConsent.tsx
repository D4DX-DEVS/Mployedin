"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { COOKIE_CONSENT_STORAGE_KEY, storeCookieChoice, type CookieChoice } from "@/lib/gdpr/cookieChoice";

interface CookieConsentProps {
  locale: string;
}

export default function CookieConsent({ locale }: CookieConsentProps) {
  const [showBanner, setShowBanner] = useState(false);
  const t = useTranslations("landing");
  const { status } = useSession();

  useEffect(() => {
    const consent = localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    if (!consent) {
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
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:p-4"
      role="region"
      aria-live="polite"
      aria-label={t("cookiePolicy")}
    >
      <div className="pointer-events-auto mx-auto flex max-w-5xl items-center gap-2 rounded-xl border bg-background/95 p-2.5 shadow-lg backdrop-blur sm:gap-4 sm:px-4 sm:py-3">
        <p className="min-w-0 flex-1 text-xs leading-4 text-muted-foreground sm:text-sm sm:leading-5">
          {t("cookieConsent")}{" "}
          <Link href={`/${locale}/cookies`} className="font-medium underline underline-offset-2 hover:text-foreground">
            {t("cookiePolicy")}
          </Link>
        </p>
        <div className="flex shrink-0 gap-1.5 sm:gap-2">
          <Button variant="outline" size="sm" className="min-h-11 px-2.5 sm:px-3" onClick={handleDecline}>
            {t("cookieDecline")}
          </Button>
          <Button size="sm" className="min-h-11 px-2.5 sm:px-3" onClick={handleAccept}>
            {t("cookieAccept")}
          </Button>
        </div>
      </div>
    </div>
  );
}
