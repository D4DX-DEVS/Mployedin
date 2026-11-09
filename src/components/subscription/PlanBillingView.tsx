"use client";

/**
 * Plan & billing — the employer and job-seeker subscription page body.
 *
 * Four blocks: your plan, usage, compare plans, billing. Follows the platform
 * enforcement switch: while it is OFF everyone already has every feature, so
 * the page says so and shows prices as a preview with nothing to buy. Once an
 * admin turns it ON, customers can request a plan (no payment gateway yet —
 * an admin approves and invoices).
 */
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/ErrorState";
import {
  useMySubscription, useAvailablePlans, useSelfAssignFreePlan, useMyUpgradeRequest,
} from "@/hooks/useSubscription";
import { useFeatureGateMap } from "@/hooks/useFeatureGate";
import { useInvoices } from "@/hooks/useInvoices";
import { useCurrencyPreference } from "@/hooks/useCurrencyPreference";
import { useExchangeRates } from "@/hooks/useExchangeRates";
import { PlanSummary, LaunchNotice, PendingRequest } from "./PlanSummary";
import { UsageMeters } from "./UsageMeters";
import { PlanCompareTable } from "./PlanCompareTable";
import { BillingInvoices } from "./BillingInvoices";
import type { CustomerRole } from "./planBillingModel";

function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-28 rounded-2xl" />
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
      <Skeleton className="h-80 rounded-2xl" />
    </div>
  );
}

function PlanFaq({ enforced }: { enforced: boolean }) {
  const t = useTranslations("planBilling");
  const items = [
    ...(!enforced ? [["faqLaunchQ", "faqLaunchA"]] : []),
    ["faqUpgradeQ", "faqUpgradeA"],
    ["faqFreeQ", "faqFreeA"],
  ];
  return (
    <details className="group rounded-2xl border border-border/60 bg-card p-4">
      <summary className="cursor-pointer text-sm font-semibold focus-visible:outline-2 focus-visible:outline-primary">{t("faqTitle")}</summary>
      <dl className="mt-3 space-y-3 text-sm">
        {items.map(([q, a]) => (
          <div key={q}>
            <dt className="font-medium">{t(q)}</dt>
            <dd className="mt-0.5 text-muted-foreground">{t(a)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export function PlanBillingView({ role }: { role: CustomerRole }) {
  const t = useTranslations("planBilling");
  const sub = useMySubscription();
  const plans = useAvailablePlans(role);
  const gate = useFeatureGateMap();
  const invoices = useInvoices({});
  const selfAssign = useSelfAssignFreePlan();
  const { displayCurrency } = useCurrencyPreference();
  const { rates } = useExchangeRates();

  // feature-gate answers bypass:true for customers exactly when enforcement is off.
  const enforced = gate.data ? gate.data.bypass === false : false;
  const pending = useMyUpgradeRequest(enforced);

  if (sub.isLoading || gate.isLoading) return <PageSkeleton />;
  if (sub.isError) {
    return <ErrorState title={t("loadError")} onRetry={() => void sub.refetch()} retryLabel={t("retry")} />;
  }

  const subscription = sub.data ?? null;
  const planList = plans.data ?? [];

  return (
    <div className="space-y-5 sm:space-y-6">
      {subscription ? (
        <PlanSummary subscription={subscription} />
      ) : (
        <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-card p-4 sm:p-5">
          <Crown className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">{t("noPlanTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("noPlanBody")}</p>
          </div>
          <Button
            className="min-h-11 sm:min-h-9"
            disabled={selfAssign.isPending}
            onClick={() => selfAssign.mutate(undefined, { onError: () => toast.error(t("activateError")) })}
          >
            {selfAssign.isPending ? t("activating") : t("activateFree")}
          </Button>
        </section>
      )}

      {!enforced && <LaunchNotice />}
      {enforced && pending.data && <PendingRequest request={pending.data} />}

      {subscription && <UsageMeters role={role} subscription={subscription} enforced={enforced} />}

      {plans.isError ? (
        <ErrorState title={t("plansError")} onRetry={() => void plans.refetch()} retryLabel={t("retry")} />
      ) : plans.isLoading ? (
        <Skeleton className="h-80 rounded-2xl" />
      ) : (
        <PlanCompareTable
          role={role}
          plans={planList}
          currentPlanId={subscription?.planId}
          currentTier={subscription?.planSnapshot?.tier ?? 0}
          enforced={enforced}
          hasPendingRequest={Boolean(pending.data)}
          displayCurrency={displayCurrency}
          rates={rates}
        />
      )}

      <BillingInvoices invoices={invoices.data ?? []} />
      <PlanFaq enforced={enforced} />
    </div>
  );
}
