"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface CookieConsentProps {
  locale: string;
}

export default function CookieConsent({ locale }: CookieConsentProps) {
  const [showBanner, setShowBanner] = useState(false);
  const isAr = locale === "ar";

  useEffect(() => {
    const consent = localStorage.getItem("cookie-consent");
    if (!consent) {
      // Small delay to avoid layout flash
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
          {isAr ? (
            <>
              نستخدم ملفات تعريف الارتباط لتحسين تجربتك.{" "}
              <Link href={`/${locale}/cookies`} className="underline hover:text-foreground">
                سياسة الكوكيز
              </Link>
            </>
          ) : (
            <>
              We use cookies to improve your experience.{" "}
              <Link href={`/${locale}/cookies`} className="underline hover:text-foreground">
                Cookie Policy
              </Link>
            </>
          )}
        </p>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={handleDecline}>
            {isAr ? "رفض" : "Decline"}
          </Button>
          <Button size="sm" onClick={handleAccept}>
            {isAr ? "قبول" : "Accept"}
          </Button>
        </div>
      </div>
    </div>
  );
}
