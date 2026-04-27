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
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur p-4 shadow-lg">
      <div className="container mx-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground flex-1">
          {t("cookieConsent")}{" "}
          <Link href={`/${locale}/cookies`} className="underline hover:text-foreground">
            {t("cookiePolicy")}
          </Link>
        </p>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={handleDecline}>
            {t("cookieDecline")}
          </Button>
          <Button size="sm" onClick={handleAccept}>
            {t("cookieAccept")}
          </Button>
        </div>
      </div>
    </div>
  );
}
