"use client";

/**
 * Subscription payment banners for the employer / job-seeker subscription pages:
 * - past_due: renewal invoice unpaid → "Pay now" (opens checkout for the open
 *   renewal invoice via /api/subscriptions/checkout with the current plan).
 * - pendingPlanChange: a scheduled downgrade and when it takes effect.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { MySubscription } from "@/hooks/useSubscription";

export function SubscriptionPaymentNotice({ subscription }: { subscription: MySubscription }) {
  const t = useTranslations("subscriptionPayment");
  const [paying, setPaying] = useState(false);

  const payNow = async () => {
    setPaying(true);
    try {
      const res = await fetch("/api/subscriptions/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: subscription.planId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      if (res.status === 503) {
        toast.info(t("onlineUnavailable"));
        return;
      }
      toast.error(t("payFailed"));
    } catch {
      toast.error(t("payFailed"));
    } finally {
      setPaying(false);
    }
  };

  const pending = subscription.pendingPlanChange;

  return (
    <>
      {subscription.status === "past_due" && (
        <section
          role="alert"
          className="flex flex-col gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/5 sm:flex-row sm:items-center panel-body"
        >
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{t("pastDueTitle")}</p>
            <p className="text-sm text-muted-foreground">
              {subscription.graceEndsAt
                ? t("pastDueBody", { date: new Date(subscription.graceEndsAt).toLocaleDateString() })
                : t("pastDueBodyNoDate")}
            </p>
          </div>
          <Button onClick={payNow} disabled={paying} className="shrink-0">
            {paying ? t("redirecting") : t("payNow")}
          </Button>
        </section>
      )}
      {pending?.effectiveAt && (
        <section className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card panel-body">
          <CalendarClock className="h-5 w-5 shrink-0 text-sky-500" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            {t("downgradeScheduled", {
              name: pending.planName ?? "",
              date: new Date(pending.effectiveAt).toLocaleDateString(),
            })}
          </p>
        </section>
      )}
    </>
  );
}
