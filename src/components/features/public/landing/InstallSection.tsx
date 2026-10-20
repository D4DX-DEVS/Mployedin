"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * "Take your job search with you." Shown only on browsers that offer to install
 * the app (an install button that cannot install anything would be a dead one).
 */
export function InstallSection() {
  const t = useTranslations("landing");
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (event: Event) => setInstallEvent(event as BeforeInstallPromptEvent);
    const onInstalled = () => setInstallEvent(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!installEvent) return null;

  const install = async () => {
    try {
      await installEvent.prompt();
      await installEvent.userChoice;
    } catch {
      // The prompt can only be used once, and another part of the page may have used it.
    }
    setInstallEvent(null);
  };

  return (
    <section className="container mx-auto px-4 pt-12 sm:px-6 lg:pt-16">
      <div className="flex flex-col items-start justify-between gap-6 rounded-[1.75rem] bg-primary p-6 text-primary-foreground sm:p-10 md:flex-row md:items-center">
        <div className="max-w-xl">
          <h2 className="text-2xl font-extrabold tracking-[-0.02em] sm:text-3xl">{t("installTitle")}</h2>
          <p className="mt-2.5 text-base leading-7 text-primary-foreground/85">{t("installDescription")}</p>
        </div>
        <Button type="button" size="lg" variant="secondary" onClick={install} className="rounded-xl font-bold">
          {t("installCta")}
        </Button>
      </div>
    </section>
  );
}
