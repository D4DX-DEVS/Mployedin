"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Receipt } from "lucide-react";
import type { InvoiceHealth as InvoiceHealthData } from "./useSubscriptionDashboard";

interface InvoiceHealthCardsProps {
  data: InvoiceHealthData;
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 1 }).format(n);
}

export function InvoiceHealthCards({ data }: InvoiceHealthCardsProps) {
  const t = useTranslations("invoiceHealthCards");
  const tc = useTranslations("common");
  const { locale } = useParams<{ locale: string }>();
  const invoicesHref = `/${locale}/admin/invoices`;
  const cards = [
    {
      label: t("paidThisMonth"),
      value: data.paidCount,
      bg: "bg-emerald-50",
      textColor: "text-emerald-600",
      href: `${invoicesHref}?status=paid`,
    },
    {
      label: t("pending"),
      value: data.pendingCount,
      bg: "bg-amber-50",
      textColor: "text-amber-600",
      href: `${invoicesHref}?status=pending`,
    },
    {
      label: t("overdue"),
      value: data.overdueCount,
      bg: "bg-rose-50",
      textColor: "text-rose-600",
      href: `${invoicesHref}?status=overdue`,
    },
    {
      label: t("aedCollected"),
      value: formatCurrency(data.collectedRevenue),
      bg: "bg-muted/40",
      textColor: "text-foreground",
      href: invoicesHref,
    },
  ];

  return (
    <section className="rounded-2xl border border-border/60 bg-card panel-body">
      <div className="flex items-center justify-between mb-5">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Receipt className="h-4 w-4" /> {t("invoices")}
        </h4>
        <Link href={invoicesHref} className="text-xs text-primary hover:underline">
          {tc("view")}
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className={`rounded-xl ${c.bg} text-center transition-all hover:shadow-md hover:-translate-y-0.5 card-pad`}
          >
            <p className={`text-2xl font-bold ${c.textColor}`}>{c.value}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{c.label}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
