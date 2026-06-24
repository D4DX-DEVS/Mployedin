"use client";

import { CalendarClock } from "lucide-react";
import type { RenewalForecast as RenewalForecastData } from "./useSubscriptionDashboard";

interface RenewalForecastProps {
  data: RenewalForecastData;
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

export function RenewalForecast({ data }: RenewalForecastProps) {
  const buckets = [
    { label: "Within 7 days", ...data.within7, color: "text-red-500", dot: "bg-red-500" },
    { label: "8 – 15 days", ...data.within15, color: "text-amber-500", dot: "bg-amber-500" },
    { label: "16 – 30 days", ...data.within30, color: "text-emerald-500", dot: "bg-emerald-500" },
  ];

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-6">
      <div className="flex items-center justify-between mb-5">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <CalendarClock className="h-4 w-4" /> Renewal Forecast
        </h4>
        <span className="text-xs text-primary cursor-pointer hover:underline">View all</span>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="rounded-xl border border-border/40 p-4 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Next 30 Days</p>
          <p className="text-3xl font-bold">{data.totalRenewing}</p>
          <p className="text-xs text-muted-foreground">subscriptions</p>
        </div>
        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200/50 dark:border-emerald-500/20 p-4 text-center">
          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase tracking-wider font-semibold mb-1">Expected Revenue</p>
          <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(data.expectedRevenue)}</p>
          <p className="text-xs text-muted-foreground">AED</p>
        </div>
      </div>

      {/* Buckets */}
      <div className="space-y-2.5">
        {buckets.map((b) => (
          <div
            key={b.label}
            className="flex items-center justify-between py-2"
          >
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${b.dot}`} />
              <span className={`text-sm font-medium ${b.color}`}>{b.label}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm font-semibold">{b.count}</span>
              <span className="text-sm text-muted-foreground">
                {formatCurrency(b.revenue)} AED
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
