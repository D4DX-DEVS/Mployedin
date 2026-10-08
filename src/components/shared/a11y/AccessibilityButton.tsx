"use client";

import { useTranslations } from "next-intl";
import { Accessibility } from "lucide-react";
import { openAccessibilitySettings } from "@/lib/a11y/preferences";

/** Opens the accessibility settings dialog. `variant="icon"` for headers. */
export function AccessibilityButton({ className, variant = "text" }: { className?: string; variant?: "icon" | "text" }) {
  const t = useTranslations("accessibility");
  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={openAccessibilitySettings}
        aria-label={t("openSettings")}
        title={t("openSettings")}
        className={className}
      >
        <Accessibility className="h-5 w-5" aria-hidden />
      </button>
    );
  }
  return (
    <button type="button" onClick={openAccessibilitySettings} className={className}>
      {t("settingsLink")}
    </button>
  );
}
