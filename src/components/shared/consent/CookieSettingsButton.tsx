"use client";

import { useTranslations } from "next-intl";
import { openConsentPreferences } from "@/lib/consent/client";

/** Re-opens the cookie preferences dialog — withdrawal as easy as consent (GDPR art 7(3)). */
export function CookieSettingsButton({ className, label }: { className?: string; label?: string }) {
  const t = useTranslations("consent");
  return (
    <button type="button" className={className} onClick={openConsentPreferences}>
      {label ?? t("cookieSettings")}
    </button>
  );
}
