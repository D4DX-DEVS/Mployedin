"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useConsentState } from "@/hooks/useConsent";
import { adoptConsent, hasGpcSignal, saveConsent } from "@/lib/consent/client";
import {
  ALL_DENIED,
  ALL_GRANTED,
  CONSENT_OPEN_EVENT,
  CONSENT_POLICY_VERSION,
  COOKIE_INVENTORY,
  type ConsentCategory,
  type ConsentChoices,
  type ConsentState,
  OPTIONAL_CATEGORIES,
  needsConsentPrompt,
  parseConsent,
  serializeConsent,
} from "@/lib/consent/config";

interface CookieConsentProps {
  locale: string;
}

const CATEGORIES: ConsentCategory[] = ["necessary", ...OPTIONAL_CATEGORIES];

/**
 * GDPR / ePrivacy consent manager.
 *
 * Layer 1 (banner): "Reject all", "Accept all" and "Customise" with equal
 * prominence, no pre-ticked categories, nothing optional runs before a choice.
 * Layer 2 (dialog): per-category switches plus the full cookie inventory.
 * The choice is kept for 6 months or until the policy version changes, can be
 * changed or withdrawn at any time from the footer "Cookie settings" link, and
 * each choice is recorded server-side as proof of consent.
 */
export default function CookieConsent({ locale }: CookieConsentProps) {
  const t = useTranslations("consent");
  const consent = useConsentState();
  const [mounted, setMounted] = useState(false);
  const [checkedServer, setCheckedServer] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [draft, setDraft] = useState<ConsentChoices>(ALL_DENIED);
  const [gpc, setGpc] = useState(false);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    setMounted(true);
    setGpc(hasGpcSignal());
  }, []);

  // A signed-in user who already chose on another device should not be asked
  // again: look up their latest recorded choice before showing the banner.
  useEffect(() => {
    if (!mounted || checkedServer) return;
    if (!needsConsentPrompt(consent)) {
      setCheckedServer(true);
      return;
    }
    let cancelled = false;
    fetch("/api/consent", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { consent?: ConsentState | null } | null) => {
        if (cancelled) return;
        const remote = data?.consent;
        // Round-trip through the cookie codec so only a well-formed state is adopted.
        const valid = remote ? parseConsent(serializeConsent(remote)) : null;
        if (valid && !needsConsentPrompt(valid)) adoptConsent(valid);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setCheckedServer(true);
      });
    return () => {
      cancelled = true;
    };
  }, [mounted, checkedServer, consent]);

  const openPreferences = useCallback(() => {
    const current = consent && !needsConsentPrompt(consent) ? consent.choices : ALL_DENIED;
    setDraft({ ...current });
    setPrefsOpen(true);
  }, [consent]);

  useEffect(() => {
    window.addEventListener(CONSENT_OPEN_EVENT, openPreferences);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, openPreferences);
  }, [openPreferences]);

  const showBanner = mounted && checkedServer && needsConsentPrompt(consent) && !prefsOpen;

  useEffect(() => {
    if (showBanner) document.documentElement.dataset.cookieBanner = "visible";
    else delete document.documentElement.dataset.cookieBanner;
    return () => {
      delete document.documentElement.dataset.cookieBanner;
    };
  }, [showBanner]);

  const cleanupLegacy = () => {
    try {
      localStorage.removeItem("cookie-consent");
    } catch {
      /* storage blocked */
    }
  };

  const acceptAll = () => {
    cleanupLegacy();
    // Honour Global Privacy Control: "accept all" never opts in to marketing.
    saveConsent({ choices: { ...ALL_GRANTED, marketing: !gpc }, method: "accept_all", locale });
    setPrefsOpen(false);
  };

  const rejectAll = () => {
    cleanupLegacy();
    saveConsent({ choices: { ...ALL_DENIED }, method: consent && !needsConsentPrompt(consent) ? "withdraw" : "reject_all", locale });
    setPrefsOpen(false);
  };

  const saveCustom = () => {
    cleanupLegacy();
    saveConsent({ choices: draft, method: "custom", locale });
    setPrefsOpen(false);
  };

  const policyHref = `/${locale}/cookies`;
  const privacyHref = `/${locale}/privacy`;

  return (
    <>
      {showBanner &&
        createPortal(
          <div
            // Stable hook for bottom-anchored UI (StickyApplyBar) — do not key
            // off translated strings.
            data-cookie-consent=""
            className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:p-4 sm:pb-[max(1rem,env(safe-area-inset-bottom))]"
          >
            <section
              aria-labelledby={titleId}
              aria-describedby={descId}
              className="pointer-events-auto mx-auto flex max-w-5xl flex-col gap-3 rounded-xl border border-border bg-background p-3 shadow-lg sm:flex-row sm:items-center sm:gap-4 sm:p-4"
            >
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                  {t("bannerTitle")}
                </h2>
                <p id={descId} className="mt-1 text-xs leading-5 text-muted-foreground sm:text-sm">
                  {t("bannerText")}{" "}
                  <Link href={policyHref} className="font-medium text-foreground underline underline-offset-2">
                    {t("cookiePolicy")}
                  </Link>
                  {" · "}
                  <Link href={privacyHref} className="font-medium text-foreground underline underline-offset-2">
                    {t("privacyPolicy")}
                  </Link>
                </p>
                {gpc && <p className="mt-1 text-xs text-muted-foreground">{t("gpcDetected")}</p>}
              </div>
              {/* Equal prominence: Accept and Reject share one style and size. */}
              <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
                <Button className="min-h-11" onClick={rejectAll}>
                  {t("rejectAll")}
                </Button>
                <Button className="min-h-11" onClick={acceptAll}>
                  {t("acceptAll")}
                </Button>
                <Button variant="outline" className="col-span-2 min-h-11" onClick={openPreferences}>
                  {t("customize")}
                </Button>
              </div>
            </section>
          </div>,
          document.body,
        )}

      <Dialog open={prefsOpen} onOpenChange={setPrefsOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("preferencesTitle")}</DialogTitle>
            <DialogDescription>{t("preferencesDescription")}</DialogDescription>
          </DialogHeader>

          <ul className="space-y-3" aria-label={t("categoriesLabel")}>
            {CATEGORIES.map((category) => {
              const switchId = `consent-${category}`;
              const locked = category === "necessary";
              const checked = locked ? true : draft[category];
              const items = COOKIE_INVENTORY.filter((item) => item.category === category);
              return (
                <li key={category} className="rounded-xl border border-border p-3 sm:p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <label htmlFor={switchId} className="text-sm font-semibold text-foreground">
                        {t(`categories.${category}.title`)}
                      </label>
                      <p id={`${switchId}-desc`} className="mt-1 text-sm text-muted-foreground">
                        {t(`categories.${category}.description`)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 pt-0.5">
                      {locked && <span className="text-xs font-medium text-muted-foreground">{t("alwaysActive")}</span>}
                      <Switch
                        id={switchId}
                        checked={checked}
                        disabled={locked}
                        aria-describedby={`${switchId}-desc`}
                        onCheckedChange={(value) => {
                          if (locked) return;
                          setDraft((d) => ({ ...d, [category]: value }));
                        }}
                      />
                    </div>
                  </div>
                  {category === "marketing" && gpc && (
                    <p className="mt-2 text-xs text-muted-foreground">{t("gpcDetected")}</p>
                  )}
                  {items.length > 0 ? (
                    <details className="mt-2 text-sm">
                      <summary className="cursor-pointer text-primary underline-offset-2 hover:underline">
                        {t("showCookies", { count: items.length })}
                      </summary>
                      <ul className="mt-2 space-y-2">
                        {items.map((item) => (
                          <li key={item.name} className="rounded-lg bg-muted/50 p-2 text-xs leading-5">
                            <span className="font-mono font-semibold text-foreground [overflow-wrap:anywhere]">{item.name}</span>
                            <span className="block text-muted-foreground">
                              {t(`inventory.${item.purposeKey}`)} · {t(`inventory.${item.durationKey}`)} ·{" "}
                              {item.provider === "first-party" ? t("firstParty") : item.provider}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">{t("noneInUse")}</p>
                  )}
                </li>
              );
            })}
          </ul>

          <p className="text-xs text-muted-foreground">
            {t("policyVersion", { version: CONSENT_POLICY_VERSION })}{" "}
            <Link href={policyHref} className="underline underline-offset-2" onClick={() => setPrefsOpen(false)}>
              {t("cookiePolicy")}
            </Link>
          </p>

          <DialogFooter className="grid grid-cols-1 gap-2 sm:flex sm:justify-end">
            <Button className="min-h-11" onClick={rejectAll}>
              {t("rejectAll")}
            </Button>
            <Button variant="outline" className="min-h-11" onClick={saveCustom}>
              {t("saveChoices")}
            </Button>
            <Button className="min-h-11" onClick={acceptAll}>
              {t("acceptAll")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
