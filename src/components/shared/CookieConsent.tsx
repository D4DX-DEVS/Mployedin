"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface CookieConsentProps {
  locale: string;
}

export default function CookieConsent({ locale }: CookieConsentProps) {
  const [showBanner, setShowBanner] = useState(false);
  const t = useTranslations("landing");

  useEffect(() => {
    const consent = localStorage.getItem("cookie-consent");
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

  const handleAccept = () => {
    localStorage.setItem("cookie-consent", "accepted");
    setShowBanner(false);
  };

  const handleDecline = () => {
    localStorage.setItem("cookie-consent", "declined");
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div
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
