"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { withCallback } from "@/lib/routing/callbackUrl";

/** A link that could not be used, with no address to fall back to the code form. */
export function VerifyFailed({ message, locale, callback }: { message: string; locale?: string; callback: string | null }) {
  const t = useTranslations("verifyEmail");
  return (
    <div className="flex flex-col items-center gap-6 py-6 text-center">
      <div className="h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center">
        <XCircle className="h-7 w-7 text-destructive" />
      </div>
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{t("verificationFailedTitle")}</h1>
        <p className="text-base text-muted-foreground font-light">
          {message || t("linkUsedError")}
        </p>
      </div>
      <div className="w-full max-w-xs space-y-3">
        <Button size="lg" asChild variant="outline" className="w-full">
          <Link href={withCallback(`/${locale ?? "en"}/login`, callback)}>{t("backToSignIn")}</Link>
        </Button>
        <p className="text-xs text-muted-foreground">
          {t("needHelp")}{" "}
          <Link href={`/${locale ?? "en"}/contact`} className="text-primary hover:underline">
            {t("contactSupport")}
          </Link>
        </p>
      </div>
    </div>
  );
}
