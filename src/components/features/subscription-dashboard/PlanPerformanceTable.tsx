"use client";

import { useTranslations } from "next-intl";
import { BarChart3 } from "lucide-react";
import type { PlanPerformanceItem } from "./useSubscriptionDashboard";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

const TIER_COLORS: Record<number, string> = {
  0: "bg-zinc-400",
  1: "bg-slate-500",
  2: "bg-amber-500",
  3: "bg-violet-500",
};

interface Props {
  data: PlanPerformanceItem[];
}

export function PlanPerformanceTable({ data }: Props) {
  const t = useTranslations("planPerformanceTable");

  if (data.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border/60 bg-card panel-body">
      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2 mb-4">
        <BarChart3 className="h-4 w-4" /> {t("planPerformance")}
      </h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40 text-left">
              <th className="pb-3 pr-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">{t("plan")}</th>
              <th className="pb-3 pr-4 font-medium text-muted-foreground text-xs uppercase tracking-wider text-right">{t("active")}</th>
              <th className="pb-3 pr-4 font-medium text-muted-foreground text-xs uppercase tracking-wider text-right">{t("revenue")}</th>
              <th className="pb-3 font-medium text-muted-foreground text-xs uppercase tracking-wider text-right">{t("churn")}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((plan, idx) => (
              <tr key={`${plan.planName}-${plan.tier}-${idx}`} className="border-b border-border/20 last:border-0">
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${TIER_COLORS[plan.tier] ?? "bg-primary"}`} />
                    <span className="font-medium">{plan.planName}</span>
                  </div>
                </td>
                <td className="py-3 pr-4 text-right font-semibold">{plan.activeUsers}</td>
                <td className="py-3 pr-4 text-right">{formatCurrency(plan.revenue)}</td>
                <td className="py-3 text-right">
                  <span className={`font-semibold ${plan.churn > 5 ? "text-red-500" : plan.churn > 0 ? "text-amber-500" : "text-emerald-500"}`}>
                    {plan.churn}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
