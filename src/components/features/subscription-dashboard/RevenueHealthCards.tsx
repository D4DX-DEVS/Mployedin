"use client";

import { DollarSign, TrendingUp, TrendingDown, Users, Zap } from "lucide-react";
import type { RevenueHealth } from "./useSubscriptionDashboard";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

interface Props {
  data: RevenueHealth;
}

export function RevenueHealthCards({ data }: Props) {
  const cards = [
    { label: "ARPU", value: `${formatCurrency(data.arpu)} AED`, icon: Users, color: "text-sky-500", bg: "from-sky-500/5" },
    { label: "LTV", value: `${formatCurrency(data.ltv)} AED`, icon: Zap, color: "text-violet-500", bg: "from-violet-500/5" },
    { label: "New Revenue", value: `${formatCurrency(data.newRevenue)} AED`, icon: TrendingUp, color: "text-emerald-500", bg: "from-emerald-500/5" },
    { label: "Expansion Revenue", value: `${formatCurrency(data.expansionRevenue)} AED`, icon: TrendingUp, color: "text-blue-500", bg: "from-blue-500/5" },
    { label: "Churned Revenue", value: `${formatCurrency(data.churnedRevenue)} AED`, icon: TrendingDown, color: "text-red-500", bg: "from-red-500/5" },
    { label: "Net Revenue", value: `${formatCurrency(data.netRevenue)} AED`, icon: DollarSign, color: data.netRevenue >= 0 ? "text-emerald-500" : "text-red-500", bg: data.netRevenue >= 0 ? "from-emerald-500/5" : "from-red-500/5" },
  ];

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-6">
      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2 mb-5">
        <DollarSign className="h-4 w-4" /> Revenue Health
      </h4>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className={`rounded-xl border border-border/40 bg-gradient-to-br ${card.bg} to-transparent p-4`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{card.label}</span>
                <Icon className={`h-3.5 w-3.5 ${card.color}`} />
              </div>
              <p className="text-sm font-bold">{card.value}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
