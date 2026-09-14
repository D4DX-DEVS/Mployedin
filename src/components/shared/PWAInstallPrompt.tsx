"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

/* Registration/login forms must never be covered by the install card
   (it landed on top of active fields at 375px). */
const SUPPRESSED_PREFIXES = ["/login", "/register", "/employer-register", "/agent-register", "/onboarding", "/forgot-password", "/reset-password"];

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PWAInstallPrompt() {
  const t = useTranslations("pwaInstallPrompt");
  const pathname = usePathname();
  const stripped = pathname?.replace(/^\/(?:en|ar)/, "") || "/";
  // Same rule as SUPPRESSED_PREFIXES, applied to the public job detail page: its
  // quick-apply card is a sign-up form, and the install card landed on top of the
  // "Continue with Google" button. The /jobs listing is unaffected.
  const isPublicJobDetail = /^\/jobs\/[^/]+$/.test(stripped);
  const suppressed =
    isPublicJobDetail || SUPPRESSED_PREFIXES.some((p) => stripped === p || stripped.startsWith(p + "/"));
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  // Distance from the viewport bottom needed to clear a [data-bottom-dock] bar.
  const [dockOffset, setDockOffset] = useState(0);

  useEffect(() => {
    if (typeof MutationObserver === "undefined") return;

    const measure = () => {
      const dock = document.querySelector<HTMLElement>("[data-bottom-dock]");
      if (!dock || dock.offsetHeight === 0) {
        setDockOffset(0);
        return;
      }
      // Sit 16px above the dock's top edge.
      const gap = 16;
      setDockOffset(Math.max(0, Math.round(window.innerHeight - dock.getBoundingClientRect().top + gap)));
    };

    measure();
    const mo = new MutationObserver(measure);
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    return () => {
      mo.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
    };
  }, []);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    // Detect iOS (no beforeinstallprompt support)
    const ua = navigator.userAgent;
    const isiOS = /iPad|iPhone|iPod/.test(ua) && !("MSStream" in window);
    setIsIOS(isiOS);

    // Check if user dismissed before (respect for 7 days)
    const dismissed = localStorage.getItem("pwa-install-dismissed");
    if (dismissed) {
      const dismissedAt = parseInt(dismissed, 10);
      if (Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) return;
    }

    if (isiOS) {
      // Show iOS-specific instructions after a delay
      const timer = setTimeout(() => setShowPrompt(true), 5000);
      return () => clearTimeout(timer);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Show prompt after user has been on the page for a bit
      setTimeout(() => setShowPrompt(true), 3000);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem("pwa-install-dismissed", Date.now().toString());
  };

  if (!showPrompt || suppressed) return null;

  return (
    /* On phones this sat under the AI assistant FAB (fixed bottom-20, z-[100])
       and the bottom tab bar, so its dismiss X was unreachable. Sit above both.
       dockOffset additionally clears any [data-bottom-dock] element (the public
       job page's sticky Easy Apply bar). It is 0 on every page without one, and
       0 on desktop where that bar is hidden, so the class-based offsets stand. */
    <div
      className="fixed bottom-40 left-4 right-4 z-[110] mx-auto max-w-sm animate-in slide-in-from-bottom-4 duration-300 lg:bottom-4"
      style={dockOffset > 0 ? { bottom: `${dockOffset}px` } : undefined}
    >
      <div className="rounded-lg border bg-card shadow-lg card-pad">
        <div className="flex items-start gap-3">
          <img
            src="/icons/icon-96x96.png"
            alt="MPLOYEDIN"
            width={48}
            height={48}
            className="shrink-0 rounded-lg"
          />
          <div className="flex-1 space-y-1">
            <p className="text-sm font-semibold text-card-foreground">
              {t("installApp")}
            </p>
            {isIOS ? (
              <p className="text-xs text-muted-foreground">
                {t("iosInstallInstructions")}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t("androidInstallInstructions")}
              </p>
            )}
          </div>
          <button
            onClick={handleDismiss}
            aria-label={t("dismiss")}
            className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        {!isIOS && (
          <button
            onClick={handleInstall}
            className="mt-3 w-full rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("installButton")}
          </button>
        )}
      </div>
    </div>
  );
}
