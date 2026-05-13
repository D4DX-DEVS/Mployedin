"use client";

import {
  TrendingUp, TrendingDown, DollarSign, Clock, AlertTriangle,
  CheckCircle2, Percent, ReceiptText, RefreshCw, BarChart3,
} from "lucide-react";

interface KPIData {
  totalRevenue: number;
  paidRevenue: number;
  pendingRevenue: number;
  overdueRevenue: number;
  overdueCount: number;
  taxCollected: number;
  refunds: number;
  totalInvoices: number;
  agentCommissionPayable: number;
  superAgentCommissionPayable: number;
  monthlyGrowth: number;
}

interface RevenueKPICardsProps {
  kpi: KPIData;
  currency?: string;
  variant?: "admin" | "super_agent" | "agent";
}

export function RevenueKPICards({ kpi, currency = "AED", variant = "admin" }: RevenueKPICardsProps) {
  const fmt = (v: number) => `${currency} ${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  const adminCards = [
    { label: "Total Revenue", value: fmt(kpi.totalRevenue), icon: DollarSign, tone: "workspace-tone-sky" },
    { label: "Paid Revenue", value: fmt(kpi.paidRevenue), icon: CheckCircle2, tone: "workspace-tone-emerald" },
    { label: "Pending Revenue", value: fmt(kpi.pendingRevenue), icon: Clock, tone: "workspace-tone-amber" },
    { label: "Overdue Revenue", value: fmt(kpi.overdueRevenue), sub: `${kpi.overdueCount} invoice${kpi.overdueCount !== 1 ? "s" : ""}`, icon: AlertTriangle, tone: "workspace-tone-rose" },
    { label: "Agent Commission Due", value: fmt(kpi.agentCommissionPayable), icon: Percent, tone: "workspace-tone-indigo" },
    { label: "Tax Collected", value: fmt(kpi.taxCollected), icon: ReceiptText, tone: "workspace-tone-violet" },
    { label: "Refunds", value: fmt(kpi.refunds), icon: RefreshCw, tone: "workspace-tone-rose" },
    {
      label: "Monthly Growth",
      value: `${kpi.monthlyGrowth > 0 ? "+" : ""}${kpi.monthlyGrowth}%`,
      icon: kpi.monthlyGrowth >= 0 ? TrendingUp : TrendingDown,
      tone: kpi.monthlyGrowth >= 0 ? "workspace-tone-emerald" : "workspace-tone-rose",
    },
  ];

  const saCards = [
    { label: "Team Revenue", value: fmt(kpi.totalRevenue), icon: DollarSign, tone: "workspace-tone-sky" },
    { label: "Team Paid", value: fmt(kpi.paidRevenue), icon: CheckCircle2, tone: "workspace-tone-emerald" },
    { label: "Team Pending", value: fmt(kpi.pendingRevenue), icon: Clock, tone: "workspace-tone-amber" },
    { label: "Commission Due", value: fmt(kpi.agentCommissionPayable), icon: Percent, tone: "workspace-tone-indigo" },
    { label: "Total Invoices", value: String(kpi.totalInvoices), icon: BarChart3, tone: "workspace-tone-sky" },
    { label: "Monthly Growth", value: `${kpi.monthlyGrowth > 0 ? "+" : ""}${kpi.monthlyGrowth}%`, icon: kpi.monthlyGrowth >= 0 ? TrendingUp : TrendingDown, tone: kpi.monthlyGrowth >= 0 ? "workspace-tone-emerald" : "workspace-tone-rose" },
  ];

  const agentCards = [
    { label: "My Revenue", value: fmt(kpi.totalRevenue), icon: DollarSign, tone: "workspace-tone-sky" },
    { label: "Paid", value: fmt(kpi.paidRevenue), icon: CheckCircle2, tone: "workspace-tone-emerald" },
    { label: "Pending", value: fmt(kpi.pendingRevenue), icon: Clock, tone: "workspace-tone-amber" },
    { label: "My Commission", value: fmt(kpi.agentCommissionPayable), icon: Percent, tone: "workspace-tone-indigo" },
    { label: "Total Invoices", value: String(kpi.totalInvoices), icon: BarChart3, tone: "workspace-tone-sky" },
    {
      label: "Monthly Growth",
      value: `${kpi.monthlyGrowth > 0 ? "+" : ""}${kpi.monthlyGrowth}%`,
      icon: kpi.monthlyGrowth >= 0 ? TrendingUp : TrendingDown,
      tone: kpi.monthlyGrowth >= 0 ? "workspace-tone-emerald" : "workspace-tone-rose",
    },
  ];

  const cards = variant === "admin" ? adminCards : variant === "super_agent" ? saCards : agentCards;
  const gridCols = variant === "admin" ? "xl:grid-cols-4" : "xl:grid-cols-3";

  return (
    <section className={`grid gap-3 sm:grid-cols-2 ${gridCols}`}>
      {cards.map((card) => (
        <div key={card.label} className="workspace-glass-panel rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{card.label}</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-primary">{card.value}</p>
              {"sub" in card && (card as { sub?: string }).sub ? <p className="mt-0.5 text-xs text-muted-foreground">{String((card as { sub?: string }).sub)}</p> : null}
            </div>
            <div className={`${card.tone} rounded-2xl p-2.5`}>
              <card.icon className="h-5 w-5" />
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
