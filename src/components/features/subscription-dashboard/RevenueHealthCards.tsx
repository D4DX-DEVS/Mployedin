"use client";

import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import type { RevenueHealth } from "./useSubscriptionDashboard";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.abs(n));
}

interface Props {
  data: RevenueHealth;
}

export function RevenueHealthCards({ data }: Props) {
  const t = useTranslations("revenueHealthCards");
  const cards = [
    { label: t("arpu"), value: formatCurrency(data.arpu), unit: "AED", sub: t("avgPerCustomer"), positive: true, neutral: true },
    { label: t("ltv"), value: formatCurrency(data.ltv), unit: "AED", sub: t("lifetimeValue"), positive: true, neutral: true },
    { label: t("newRevenue"), value: `+${formatCurrency(data.newRevenue)}`, unit: "AED", sub: t("thisMonth"), positive: true, neutral: false },
    { label: t("expansion"), value: `+${formatCurrency(data.expansionRevenue)}`, unit: "AED", sub: t("upgrades"), positive: true, neutral: false },
    { label: t("churned"), value: `-${formatCurrency(data.churnedRevenue)}`, unit: "AED", sub: t("lostRevenue"), positive: false, neutral: false },
    { label: t("netRevenue"), value: `${data.netRevenue >= 0 ? "+" : "-"}${formatCurrency(data.netRevenue)}`, unit: "AED", sub: t("netNewMRR"), positive: data.netRevenue >= 0, neutral: false },
  ];

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-6">
      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2 mb-5">
        <Sparkles className="h-4 w-4" /> {t("revenueHealth")}
      </h4>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className={`rounded-xl p-4 text-center transition-all ${
              card.neutral
                ? "border border-border/40 bg-muted/30"
                : card.positive
                  ? "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200/50 dark:border-emerald-500/20"
                  : "bg-rose-50 dark:bg-rose-900/20 border border-rose-200/50 dark:border-rose-500/20"
            }`}
          >
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
              {card.label}
            </span>
            <p className={`text-lg font-bold ${
              card.neutral
                ? ""
                : card.positive
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
            }`}>
              {card.value} <span className="text-xs font-medium text-muted-foreground">{card.unit}</span>
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">{card.sub}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
