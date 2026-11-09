"use client";

import { useState } from "react";
import { Check, Minus, Infinity as InfinityIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { convertCurrency, formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { useRequestPlanChange, type AvailablePlan } from "@/hooks/useSubscription";
import {
  billingCurrency, compareRows, planMove, sortPlans, type CompareCell, type CustomerRole,
} from "./planBillingModel";

interface Props {
  role: CustomerRole;
  plans: AvailablePlan[];
  currentPlanId?: string;
  currentTier: number;
  /** Enforcement on: requests are possible. Off: prices are a preview. */
  enforced: boolean;
  /** A request is already open; one at a time. */
  hasPendingRequest: boolean;
  displayCurrency: string;
  rates: Record<string, number>;
}

function Cell({ cell, label }: { cell: CompareCell; label: (k: string) => string }) {
  if (cell.kind === "yes") return <Check className="mx-auto size-4 text-emerald-600" aria-label={label("included")} />;
  if (cell.kind === "no") return <Minus className="mx-auto size-4 text-muted-foreground/50" aria-label={label("notIncluded")} />;
  if (cell.kind === "unlimited") {
    return (
      <span className="inline-flex items-center gap-1 font-medium">
        <InfinityIcon className="size-4" aria-hidden="true" />
        {label("unlimited")}
      </span>
    );
  }
  const v = String(cell.value);
  return <span className="font-medium tabular-nums">{["basic", "advanced"].includes(v) ? label(`analytics_${v}`) : v}</span>;
}

/** Every plan side by side, always open; it is the most useful thing here. */
export function PlanCompareTable(props: Props) {
  const { role, currentPlanId, currentTier, enforced, hasPendingRequest, displayCurrency, rates } = props;
  const t = useTranslations("planBilling");
  const plans = sortPlans(props.plans);
  const currency = billingCurrency(plans);
  const rows = compareRows(role);
  const [target, setTarget] = useState<AvailablePlan | null>(null);
  const request = useRequestPlanChange();

  if (plans.length === 0) return null;

  const send = () => {
    if (!target) return;
    request.mutate(target._id, {
      onSuccess: () => {
        toast.success(t("requestSent"));
        setTarget(null);
      },
      onError: (e) => toast.error(e.message),
    });
  };

  const price = (p: AvailablePlan) => (p.price > 0 ? formatCurrency(p.price, p.currency, "code") : t("free"));
  const approx = (p: AvailablePlan) =>
    p.price > 0 && displayCurrency !== p.currency
      // Whole units: an estimate read "≈ ₹230.5".
      ? t("approx", { amount: formatCurrency(Math.round(convertCurrency(p.price, p.currency, displayCurrency, rates)), displayCurrency) })
      : null;

  return (
    <section aria-labelledby="compare-title" className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="compare-title" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("comparePlans")}</h3>
        <p className="text-xs text-muted-foreground">{enforced ? t("billedIn", { currency }) : t("pricePreview", { currency })}</p>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card" tabIndex={0} role="region" aria-labelledby="compare-title">
        {/* data-mobile-table="scroll": a comparison only reads as columns; the
            phone card treatment would split every plan into separate rows. */}
        <table data-mobile-table="scroll" className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-border/60">
              <th scope="col" className="sticky start-0 z-10 bg-card p-3 text-start font-medium text-muted-foreground">
                <span className="sr-only">{t("feature")}</span>
              </th>
              {plans.map((p) => {
                const current = p._id === currentPlanId;
                return (
                  <th key={p._id} scope="col" className={cn("p-3 text-center align-top", current && "bg-primary/5")}>
                    <span className="block font-semibold">{p.name}</span>
                    <span className="mt-1 block text-lg font-bold tabular-nums">{price(p)}</span>
                    <span className="block text-xs font-normal text-muted-foreground">
                      {p.price > 0 ? t("perCycle", { cycle: t(`cycle_${p.billingCycle}`) }) : t("always")}
                    </span>
                    {approx(p) && <span className="block text-xs font-normal text-muted-foreground">{approx(p)}</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-border/40 last:border-0">
                <th scope="row" className="sticky start-0 z-10 bg-card p-3 text-start font-normal">{t(row.key)}</th>
                {plans.map((p) => (
                  <td key={p._id} className={cn("p-3 text-center", p._id === currentPlanId && "bg-primary/5")}>
                    <Cell cell={row.cell(p)} label={t} />
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <th scope="row" className="sticky start-0 z-10 bg-card p-3"><span className="sr-only">{t("action")}</span></th>
              {plans.map((p) => {
                const move = planMove(p, currentPlanId, currentTier);
                return (
                  <td key={p._id} className={cn("p-3 text-center", move === "current" && "bg-primary/5")}>
                    {move === "current" ? (
                      <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">{t("current")}</span>
                    ) : enforced ? (
                      <Button
                        size="sm"
                        variant={move === "up" ? "default" : "outline"}
                        className="min-h-11 w-full sm:min-h-9"
                        disabled={hasPendingRequest}
                        title={hasPendingRequest ? t("oneRequestAtATime") : undefined}
                        onClick={() => setTarget(p)}
                      >
                        {move === "up" ? t("requestPlan", { name: p.name }) : t("switchTo", { name: p.name })}
                      </Button>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <Dialog open={target !== null} onOpenChange={(open) => !open && !request.isPending && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{target ? t("confirmTitle", { plan: target.name }) : ""}</DialogTitle>
            <DialogDescription>
              {target && target.price > 0
                ? t("confirmPaidBody", { price: price(target), cycle: t(`cycle_${target.billingCycle}`) })
                : t("confirmFreeBody")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setTarget(null)} disabled={request.isPending}>{t("cancel")}</Button>
            <Button onClick={send} disabled={request.isPending}>{request.isPending ? t("sending") : t("sendRequest")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
