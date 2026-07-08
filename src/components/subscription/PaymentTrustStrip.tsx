"use client";

/** Static payment-trust badge row for the job seeker subscription page (no live gateway yet — text badges only, no logo assets in repo). */

import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";

const METHODS = ["Visa", "Mastercard", "UPI", "Amex", "PayPal", "Apple Pay", "Google Pay"];

export function PaymentTrustStrip() {
  const t = useTranslations("jobSeekerExtra.subscription");

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Lock className="h-4 w-4 text-muted-foreground" />
        {t("securePayments")}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {METHODS.map((m) => (
          <span key={m} className="rounded-md border border-border/60 bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            {m}
          </span>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground text-center sm:text-right">{t("sslNote")}</p>
    </section>
  );
}
