"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

/** Opens the shared Copilot without requiring a floating control over content. */
export function CopilotLauncher() {
  const t = useTranslations("copilot");

  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("mployedin:open-copilot"))}
      aria-label={t("openCopilot")}
      title={t("openCopilot")}
      className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border border-border bg-background/80 px-2 text-sm font-semibold text-foreground transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 lg:hidden"
    >
      <Sparkles className="h-4 w-4" aria-hidden="true" />
      <span className="hidden sm:inline">{t("assistant")}</span>
    </button>
  );
}
