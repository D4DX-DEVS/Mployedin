"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useConsentState } from "@/hooks/useConsent";
import { openConsentPreferences, withdrawConsent } from "@/lib/consent/client";
import { OPTIONAL_CATEGORIES, needsConsentPrompt } from "@/lib/consent/config";

/** Live view of the visitor's current choice with change / withdraw actions. */
export function CookieChoiceSummary() {
  const t = useTranslations("consent");
  const locale = useLocale();
  const consent = useConsentState();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const valid = mounted && consent && !needsConsentPrompt(consent) ? consent : null;
  const anyGranted = valid ? OPTIONAL_CATEGORIES.some((c) => valid.choices[c]) : false;

  return (
    <section aria-labelledby="cookie-choice-h" className="rounded-xl border border-primary/30 bg-primary/[0.03] p-4 sm:p-5">
      <h2 id="cookie-choice-h" className="text-lg font-semibold text-foreground">{t("manageTitle")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("manageText")}</p>

      <div className="mt-4" aria-live="polite">
        <h3 className="text-sm font-semibold text-foreground">{t("currentChoice")}</h3>
        {valid ? (
          <>
            <ul className="mt-2 flex flex-wrap gap-2">
              <li className="rounded-full border border-border bg-background px-3 py-1 text-xs">
                {t("categories.necessary.title")}: <strong>{t("statusOn")}</strong>
              </li>
              {OPTIONAL_CATEGORIES.map((c) => (
                <li key={c} className="rounded-full border border-border bg-background px-3 py-1 text-xs">
                  {t(`categories.${c}.title`)}: <strong>{valid.choices[c] ? t("statusOn") : t("statusOff")}</strong>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("choiceSavedOn", {
                date: new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short" }).format(valid.timestamp),
              })}
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">{t("noChoice")}</p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button className="min-h-11" onClick={openConsentPreferences}>
          {t("manageButton")}
        </Button>
        {anyGranted && (
          <Button variant="outline" className="min-h-11" onClick={() => withdrawConsent(locale)}>
            {t("withdraw")}
          </Button>
        )}
      </div>
    </section>
  );
}
