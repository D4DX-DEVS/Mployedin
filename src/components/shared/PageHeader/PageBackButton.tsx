"use client";

import { ArrowLeft } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useBackNavigation } from "@/hooks/useBackNavigation";

/**
 * Back control for pages that are not in the top nav (CV builder, documents…).
 * Pops history when there is in-app history, else goes to `fallbackHref`
 * (locale-relative, e.g. "/job-seeker/profile").
 */
export function PageBackButton({ fallbackHref }: { fallbackHref: string }) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const { goBack } = useBackNavigation(`/${locale}${fallbackHref}`);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={goBack}
      className="page-header-back -ms-2 mb-1 gap-1.5 self-start text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft aria-hidden="true" className="h-4 w-4 rtl:rotate-180" />
      {t("back")}
    </Button>
  );
}
