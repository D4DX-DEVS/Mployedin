"use client";

import Link from "next/link";
import { Receipt, CheckCircle, Clock, AlertTriangle, DollarSign } from "lucide-react";
import type { InvoiceHealth as InvoiceHealthData } from "./useSubscriptionDashboard";

interface InvoiceHealthCardsProps {
  data: InvoiceHealthData;
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 1 }).format(n);
}

export function InvoiceHealthCards({ data }: InvoiceHealthCardsProps) {
  const cards = [
    {
      label: "Paid Invoices",
      value: data.paidCount.toLocaleString(),
      sub: "This month",
      icon: <CheckCircle className="h-5 w-5 text-emerald-500" />,
      accent: "border-emerald-500/20 bg-emerald-500/5",
      textColor: "text-emerald-500",
      href: "/admin/invoices?status=paid",
    },
    {
      label: "Pending Invoices",
      value: data.pendingCount.toLocaleString(),
      sub: "This month",
      icon: <Clock className="h-5 w-5 text-amber-500" />,
      accent: "border-amber-500/20 bg-amber-500/5",
      textColor: "text-amber-500",
      href: "/admin/invoices?status=pending",
    },
    {
      label: "Overdue Invoices",
      value: data.overdueCount.toLocaleString(),
      sub: "This month",
      icon: <AlertTriangle className="h-5 w-5 text-red-500" />,
      accent: "border-red-500/20 bg-red-500/5",
      textColor: "text-red-500",
      href: "/admin/invoices?status=overdue",
    },
    {
      label: "Collected Revenue",
      value: `${formatCurrency(data.collectedRevenue)}`,
      sub: "AED This month",
      icon: <DollarSign className="h-5 w-5 text-sky-500" />,
      accent: "border-sky-500/20 bg-sky-500/5",
      textColor: "text-sky-500",
      href: "/admin/invoices",
    },
  ];

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-6">
      <div className="flex items-center justify-between mb-5">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Receipt className="h-4 w-4" /> Invoices Overview
        </h4>
        <Link
          href="/admin/invoices"
          className="text-xs text-primary hover:underline"
        >
          View all invoices
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className={`rounded-xl border ${c.accent} p-4 text-center transition-all hover:shadow-md hover:-translate-y-0.5`}
          >
            <div className="flex justify-center mb-2">{c.icon}</div>
            <p className={`text-2xl font-bold ${c.textColor}`}>{c.value}</p>
            <p className="text-[10px] text-muted-foreground mt-1">{c.sub}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
