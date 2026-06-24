"use client";

import Link from "next/link";
import { Receipt } from "lucide-react";
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
      label: "Paid this month",
      value: data.paidCount,
      bg: "bg-emerald-50 dark:bg-emerald-900/20",
      textColor: "text-emerald-600 dark:text-emerald-400",
      href: "/admin/invoices?status=paid",
    },
    {
      label: "Pending",
      value: data.pendingCount,
      bg: "bg-amber-50 dark:bg-amber-900/20",
      textColor: "text-amber-600 dark:text-amber-400",
      href: "/admin/invoices?status=pending",
    },
    {
      label: "Overdue",
      value: data.overdueCount,
      bg: "bg-rose-50 dark:bg-rose-900/20",
      textColor: "text-rose-600 dark:text-rose-400",
      href: "/admin/invoices?status=overdue",
    },
    {
      label: "AED collected",
      value: formatCurrency(data.collectedRevenue),
      bg: "bg-muted/40",
      textColor: "text-foreground",
      href: "/admin/invoices",
    },
  ];

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-6">
      <div className="flex items-center justify-between mb-5">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Receipt className="h-4 w-4" /> Invoices
        </h4>
        <Link href="/admin/invoices" className="text-xs text-primary hover:underline">
          View all
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className={`rounded-xl ${c.bg} p-4 text-center transition-all hover:shadow-md hover:-translate-y-0.5`}
          >
            <p className={`text-2xl font-bold ${c.textColor}`}>{c.value}</p>
            <p className="text-[10px] text-muted-foreground mt-1">{c.label}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
