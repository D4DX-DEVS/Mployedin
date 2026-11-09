"use client";

import { Crown, Clock, Sparkles, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/ui/intlFormat";
import { useCancelPlanRequest, type MyUpgradeRequest, type MySubscription } from "@/hooks/useSubscription";
import { isFreeSubscription } from "./planBillingModel";

const STATUS_TONE: Record<MySubscription["status"], string> = {
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  suspended: "border-amber-500/30 bg-amber-500/10 text-amber-700",
  expired: "border-red-500/30 bg-red-500/10 text-red-700",
  cancelled: "border-border bg-muted text-muted-foreground",
};

/** Plan name, status, price and renewal — the one place these appear. */
export function PlanSummary({ subscription }: { subscription: MySubscription }) {
  const t = useTranslations("planBilling");
  const snap = subscription.planSnapshot;
  const free = isFreeSubscription(subscription);

  return (
    <section aria-labelledby="plan-summary-title" className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Crown className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("yourPlan")}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <h2 id="plan-summary-title" className="text-lg font-bold sm:text-xl">{snap?.name ?? t("unknownPlan")}</h2>
            <Badge variant="outline" className={STATUS_TONE[subscription.status]}>{t(`status_${subscription.status}`)}</Badge>
          </div>
          <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
            {free ? (
              <div><dt className="sr-only">{t("price")}</dt><dd>{t("freeNoEnd")}</dd></div>
            ) : (
              <>
                <div className="flex gap-1">
                  <dt>{t("price")}</dt>
                  <dd className="font-semibold text-foreground">
                    {t("priceLine", { price: formatCurrency(snap.price, snap.currency, "code"), cycle: t(`cycle_${snap.billingCycle}`) })}
                  </dd>
                </div>
                <div className="flex gap-1">
                  <dt>{subscription.autoRenew ? t("renews") : t("ends")}</dt>
                  <dd className="font-semibold text-foreground">{formatDate(subscription.endDate, { day: "numeric", month: "short", year: "numeric" })}</dd>
                </div>
                <div className="flex gap-1">
                  <dt>{t("autoRenew")}</dt>
                  <dd className="font-semibold text-foreground">{subscription.autoRenew ? t("on") : t("off")}</dd>
                </div>
              </>
            )}
          </dl>
        </div>
      </div>
    </section>
  );
}

/** Shown while enforcement is OFF: nobody is limited, prices are a preview. */
export function LaunchNotice() {
  const t = useTranslations("planBilling");
  return (
    <div role="status" className="flex items-start gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-4">
      <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-sm font-semibold">{t("launchTitle")}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{t("launchBody")}</p>
      </div>
    </div>
  );
}

/** The customer's open plan request, with a way to withdraw it. */
export function PendingRequest({ request }: { request: MyUpgradeRequest }) {
  const t = useTranslations("planBilling");
  const cancel = useCancelPlanRequest();

  return (
    <div role="status" className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
      <Clock className="size-5 shrink-0 text-amber-600" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{t("pendingTitle", { plan: request.toPlanName })}</p>
        <p className="text-sm text-muted-foreground">
          {t("pendingBody", { date: formatDate(request.createdAt, { day: "numeric", month: "short" }) })}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="min-h-11 sm:min-h-9"
        disabled={cancel.isPending}
        onClick={() =>
          cancel.mutate(request._id, {
            onSuccess: () => toast.success(t("requestCancelled")),
            onError: (e) => toast.error(e.message),
          })
        }
      >
        <X className="size-4" aria-hidden="true" />
        {cancel.isPending ? t("cancelling") : t("cancelRequest")}
      </Button>
    </div>
  );
}
