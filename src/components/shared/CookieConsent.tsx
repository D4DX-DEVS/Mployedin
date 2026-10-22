"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useConsent } from "@/hooks/useConsent";
import { CONSENT_EVENT, OPEN_SETTINGS_EVENT, readConsent } from "@/lib/consent/client";
import { sweepLegacyDeviceCopies, sweepLegacyPreferenceKeys } from "@/lib/consent/legacyKeys";
import { resendPendingReceipt } from "@/lib/consent/pendingReceipt";
import { recordConsentChoice, type ChoiceSource } from "@/lib/consent/recordChoice";
import { allowed } from "@/lib/consent/state";
import type { BannerCopy, ItemCopy, SettingsCopy } from "@/lib/consent/copy";
import { MAIN_CONTENT_ID } from "@/components/shared/SkipToContent";
import {
  ACCEPT_ALL,
  CHOICE_BUTTON_CLASS,
  CookieSettingsDialog,
  REJECT_ALL,
  type ConsentChoice,
} from "./ConsentManager/CookieSettingsDialog";

export interface CookieConsentLabels extends BannerCopy {
  settings: SettingsCopy;
  /** Purpose label per REGISTRY purposeKey. */
  items: ItemCopy;
  /** Screen-reader suffix for new-tab links (common.opensInNewTab); not part of the hashed copy. */
  newTab?: string;
}

interface CookieConsentProps {
  locale: string;
  /**
   * Translated on the server (CookieConsentMount): the banner shows in every
   * route group, and most of them do not ship the `landing` / `consent`
   * namespaces to the client.
   */
  labels: CookieConsentLabels;
  /** The server's reading of mpl_consent, so the banner is in the first paint. */
  initiallyVisible?: boolean;
}

/**
 * The cookie banner (Reject all | Accept all | Customise) and the Cookie
 * settings dialog. The banner shows until a choice is stored in mpl_consent;
 * ignoring it stores nothing and nothing optional runs. The dialog also opens
 * from any CookieSettingsLink, after a choice too, so it can be changed.
 */
/**
 * After a choice the banner (and with it the button that had focus, or the Customise button the dialog would
 * return focus to) is gone, and the browser drops keyboard focus to <body>: a keyboard or screen-reader user is
 * thrown back to the top of the document. Once the dialog has finished restoring focus, a focus that is still
 * nowhere goes to the page's main content (every route group's <main> carries MAIN_CONTENT_ID).
 */
function keepFocusOnThePage(): void {
  window.setTimeout(() => {
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    const main = document.getElementById(MAIN_CONTENT_ID);
    if (!main) return;
    if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
    main.focus({ preventScroll: true });
  }, 50);
}

export default function CookieConsent({ locale, labels, initiallyVisible = false }: CookieConsentProps) {
  const [showBanner, setShowBanner] = useState(initiallyVisible);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const { state: current } = useConsent();
  // Height of the phone tab bar (job seeker, workspace roles), 0 when none shows.
  const [navOffset, setNavOffset] = useState(0);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = readConsent();
    // No delay: a missing or unreadable choice (old version, blocked cookies,
    // the legacy localStorage answer) shows the banner straight away.
    setShowBanner(stored === null);
    // Runs on every page, so a visitor who objected before a page migrated a key that
    // older builds stored under its pre-`ui:` name does not keep it on the device. While
    // preferences are allowed the keys are left alone: each page migrates its own.
    if (!allowed(stored, "preferences")) sweepLegacyPreferenceKeys();
    // Not preferences, so not tied to the choice: the old exchange-rate cache and the poster edits /
    // temporary-password dismissals that now live in the tab only. Deleted on every load.
    sweepLegacyDeviceCopies();
    // A receipt that could not be delivered earlier in this tab (server error, rate limit, offline) is sent again;
    // it gives up when the choice has changed or after a few loads. The choice itself never waits for it.
    void resendPendingReceipt();
  }, []);

  // A receipt that failed while the device was offline is sent as soon as it is back, not on the next page load.
  useEffect(() => {
    const onOnline = () => void resendPendingReceipt({ ignoreSchedule: true });
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  useEffect(() => {
    const open = () => setSettingsOpen(true);
    window.addEventListener(OPEN_SETTINGS_EVENT, open);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, open);
  }, []);

  // A choice stored anywhere on the page (Always play videos on a video placeholder, say)
  // answers the banner's question. Only the banner goes: an open Cookie settings dialog is
  // someone mid-edit, and the writer sends its own receipt.
  useEffect(() => {
    const onChoice = () => {
      if (readConsent() !== null) setShowBanner(false);
    };
    window.addEventListener(CONSENT_EVENT, onChoice);
    return () => window.removeEventListener(CONSENT_EVENT, onChoice);
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
    // top edge so the Copilot and Accessibility buttons rise clear of it.
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

  /**
   * Record the choice (recordConsentChoice: store it, clear preference storage
   * when Preferences was withdrawn, send the receipt) and close the banner and
   * the dialog. The helper never rejects, so this runs as `void choose()`.
   *
   * If the choice could not be stored (cookies blocked) there is no cookie and
   * no receipt; the banner closes anyway and asks again next visit, and
   * nothing optional runs without a stored choice.
   */
  const choose = async (choice: ConsentChoice, source: ChoiceSource) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await recordConsentChoice(choice, { locale, source });
    } finally {
      savingRef.current = false;
      setSaving(false);
      setSettingsOpen(false);
      setShowBanner(false);
      keepFocusOnThePage();
    }
  };

  const policyHref = `/${locale}/cookies`;

  return (
    <>
      {showBanner && (
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
          // The region holds the choice buttons: named after them, not after the policy link inside it.
          aria-label={labels.settings.title}
        >
          <div className="pointer-events-auto mx-auto flex max-w-5xl flex-col gap-2 rounded-xl border bg-background/95 p-2.5 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:gap-4 sm:px-4 sm:py-3">
            <p className="min-w-0 flex-1 text-xs leading-4 text-muted-foreground sm:text-sm sm:leading-5">
              {labels.message}{" "}
              <Link href={policyHref} className="font-medium underline underline-offset-2 hover:text-foreground">
                {labels.policy}
              </Link>
            </p>
            {/* [LEGAL] Reject all sits first and looks exactly like Accept all. */}
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              {/* Two equal grid columns: the pair is always the same width, whatever the wording (ICO: equal prominence). */}
              <div className="grid flex-1 grid-cols-2 gap-1.5 sm:flex-none sm:gap-2">
                <Button size="sm" className={CHOICE_BUTTON_CLASS} disabled={saving} onClick={() => void choose(REJECT_ALL, "banner")}>
                  {labels.rejectAll}
                </Button>
                <Button size="sm" className={CHOICE_BUTTON_CLASS} disabled={saving} onClick={() => void choose(ACCEPT_ALL, "banner")}>
                  {labels.acceptAll}
                </Button>
              </div>
              <Button
                variant="link"
                size="sm"
                className="min-h-11 shrink-0 px-2 underline underline-offset-4"
                onClick={() => setSettingsOpen(true)}
              >
                {labels.customise}
              </Button>
            </div>
          </div>
        </div>
      )}

      <CookieSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        current={current}
        labels={{ ...labels.settings, policy: labels.policy, rejectAll: labels.rejectAll, acceptAll: labels.acceptAll, newTab: labels.newTab }}
        items={labels.items}
        policyHref={policyHref}
        saving={saving}
        onSave={(choice) => void choose(choice, "settings")}
      />
    </>
  );
}
