"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/ui/intlFormat";
import type { InvoiceItem } from "@/hooks/useInvoices";
import { visibleInvoices } from "./planBillingModel";

const TONE: Record<string, string> = {
  paid: "border-emerald-500/30 text-emerald-700",
  issued: "border-amber-500/30 text-amber-700",
  overdue: "border-red-500/30 text-red-700",
  void: "border-border text-muted-foreground",
  draft: "border-border text-muted-foreground",
};

/** Paid-plan invoices with a PDF each. Free plans never produce one. */
export function BillingInvoices({ invoices }: { invoices: InvoiceItem[] }) {
  const t = useTranslations("planBilling");
  const rows = visibleInvoices(invoices);
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? rows : rows.slice(0, 3);

  return (
    <section aria-labelledby="billing-title" className="space-y-2">
      <h3 id="billing-title" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("billing")}</h3>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border/70 p-4 text-sm text-muted-foreground">{t("noInvoices")}</p>
      ) : (
        <div className="rounded-2xl border border-border/60 bg-card">
          <ul className="divide-y divide-border/50">
            {shown.map((inv) => {
              const status = String(inv.status);
              return (
                <li key={inv._id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{inv.planName}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {inv.invoiceNumber} · {formatDate(inv.issuedAt, { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <span className="font-semibold tabular-nums">{formatCurrency(inv.amount, inv.currency, "code")}</span>
                  <Badge variant="outline" className={TONE[status] ?? TONE.draft}>{t(`inv_${status}`)}</Badge>
                  <a
                    href={`/api/invoices/${inv._id}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary sm:min-h-0"
                  >
                    <Download className="size-4" aria-hidden="true" />
                    {t("downloadPdf")}
                  </a>
                </li>
              );
            })}
          </ul>
          {rows.length > 3 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="flex w-full items-center justify-center gap-1 border-t border-border/50 p-2.5 text-sm text-primary hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-primary"
            >
              {expanded ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
              {expanded ? t("showFewer") : t("showAll", { count: rows.length })}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
