"use client";

import { useTranslations } from "next-intl";
import type { InvoiceAnalytics } from "@/hooks/useInvoiceAnalytics";
import { BarChart3, TrendingUp, Users, Layers, Clock } from "lucide-react";
import { formatCount } from "@/lib/ui/intlFormat";

interface RevenueAnalyticsPanelProps {
  data: InvoiceAnalytics;
  currency?: string;
}

export function RevenueAnalyticsPanel({ data, currency = "AED" }: RevenueAnalyticsPanelProps) {
  const t = useTranslations("revenueAnalyticsPanel");
  const fmt = (v: number) => `${currency} ${formatCount(v, { maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-6">
      {/* Monthly Revenue Trend */}
      <div className="workspace-panel-surface overflow-hidden rounded-[20px]">
        <div className="border-b border-border/80 px-5 py-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">{t("monthlyRevenueTrend")}</h3>
          </div>
        </div>
        <div className="px-5 py-4">
          {data.revenueByMonth.length > 0 ? (
            <div className="space-y-2">
              {data.revenueByMonth.map((m) => {
                const maxRevenue = Math.max(...data.revenueByMonth.map(r => r.revenue), 1);
                const pct = Math.round((m.revenue / maxRevenue) * 100);
                return (
                  <div key={m.label} className="flex items-center gap-3">
                    <span className="w-16 shrink-0 text-xs text-muted-foreground">{m.label}</span>
                    <div className="flex-1">
                      <div className="h-6 w-full overflow-hidden rounded-full bg-muted/40">
                        <div
                          className="flex h-full items-center rounded-full bg-gradient-to-r from-sky-500 to-sky-600 px-2 text-[10px] font-medium text-white transition-all"
                          style={{ width: `${Math.max(pct, 5)}%` }}
                        >
                          {pct > 15 && fmt(m.revenue)}
                        </div>
                      </div>
                    </div>
                    <span className="w-24 shrink-0 text-right text-xs font-medium">{fmt(m.revenue)}</span>
                    <span className="w-12 shrink-0 text-right text-[10px] text-muted-foreground">{m.count}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("noRevenueData")}</p>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Revenue by Category */}
        <div className="workspace-panel-surface overflow-hidden rounded-[20px]">
          <div className="border-b border-border/80 px-5 py-4">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">{t("revenueByCategory")}</h3>
            </div>
          </div>
          <div className="px-5 py-4">
            {data.revenueByCategory.length > 0 ? (
              <div className="space-y-3">
                {data.revenueByCategory.map((cat) => (
                  <div key={cat._id} className="flex items-center justify-between rounded-lg border border-border/60 bg-secondary/20 p-3">
                    <div>
                      <p className="text-sm font-medium capitalize">{cat._id?.replace(/_/g, " ") || "Other"}</p>
                      <p className="text-xs text-muted-foreground">{cat.count} invoice{cat.count !== 1 ? "s" : ""}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">{fmt(cat.totalAmount)}</p>
                      <p className="text-xs text-emerald-600">{fmt(cat.paidAmount)} paid</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">{t("noCategoryData")}</p>
            )}
          </div>
        </div>

        {/* Top Paying Employers */}
        <div className="workspace-panel-surface overflow-hidden rounded-[20px]">
          <div className="border-b border-border/80 px-5 py-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">{t("topPayingEmployers")}</h3>
            </div>
          </div>
          <div className="px-5 py-4">
            {data.topEmployers.length > 0 ? (
              <div className="space-y-2">
                {data.topEmployers.map((emp, i) => (
                  <div key={emp.employerId || i} className="flex items-center justify-between rounded-lg border border-border/60 bg-secondary/20 p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</div>
                      <div>
                        <p className="text-sm font-medium">{emp.companyName}</p>
                        <p className="text-xs text-muted-foreground">{emp.invoiceCount} invoice{emp.invoiceCount !== 1 ? "s" : ""}</p>
                      </div>
                    </div>
                    <p className="text-sm font-bold text-emerald-600">{fmt(emp.totalPaid)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">{t("noEmployerData")}</p>
            )}
          </div>
        </div>
      </div>

      {/* Invoice Aging Analysis */}
      <div className="workspace-panel-surface overflow-hidden rounded-[20px]">
        <div className="border-b border-border/80 px-5 py-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">{t("invoiceAgingAnalysis")}</h3>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("outstandingInvoiceBalance")}</p>
        </div>
        <div className="px-5 py-4">
          {data.invoiceAging.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {data.invoiceAging.map((bucket) => {
                const labels: Record<string, string> = { "0": "0–30 days", "30": "30–60 days", "60": "60–90 days", "90": "90–120 days", "120": "120+ days", "365+": "365+ days" };
                const colors: Record<string, string> = { "0": "border-emerald-200 bg-emerald-50", "30": "border-amber-200 bg-amber-50", "60": "border-orange-200 bg-orange-50", "90": "border-rose-200 bg-rose-50", "120": "border-red-200 bg-red-50" };
                return (
                  <div key={String(bucket._id)} className={`rounded-xl border p-3 ${colors[String(bucket._id)] ?? "border-border bg-muted/30"}`}>
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground">{labels[String(bucket._id)] ?? `${bucket._id}+ days`}</p>
                    <p className="mt-1 text-base sm:text-lg font-bold">{fmt(bucket.totalBalance)}</p>
                    <p className="text-xs text-muted-foreground">{bucket.count} invoice{bucket.count !== 1 ? "s" : ""}</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("noOutstandingInvoices")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
