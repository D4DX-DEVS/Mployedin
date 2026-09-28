"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ChevronRight, ShieldCheck } from "lucide-react";

/** The way into Data & Privacy from a role's own settings page. */
export function PrivacySettingsLink({ href }: { href: string }) {
  const t = useTranslations("dataPrivacy");
  const locale = useLocale();
  return (
    <Link
      href={`/${locale}${href}`}
      className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3 transition-colors hover:border-primary/40 hover:bg-muted/40"
    >
      <span className="flex min-w-0 items-start gap-3">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block text-sm font-medium">{t("settingsLinkTitle")}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{t("settingsLinkDescription")}</span>
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden="true" />
    </Link>
  );
}
