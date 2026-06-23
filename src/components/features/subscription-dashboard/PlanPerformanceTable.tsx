"use client";

import { BarChart3, TrendingUp, TrendingDown } from "lucide-react";
import type { PlanPerformanceItem } from "./useSubscriptionDashboard";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

interface Props {
  data: PlanPerformanceItem[];
}

export function PlanPerformanceTable({ data }: Props) {
  if (data.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-6">
      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2 mb-4">
        <BarChart3 className="h-4 w-4" /> Plan Performance
      </h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40 text-left">
              <th className="pb-3 pr-4 font-medium text-muted-foreground">Plan</th>
              <th className="pb-3 pr-4 font-medium text-muted-foreground text-right">Active</th>
              <th className="pb-3 pr-4 font-medium text-muted-foreground text-right">Revenue</th>
              <th className="pb-3 pr-4 font-medium text-muted-foreground text-right">Churn</th>
              <th className="pb-3 font-medium text-muted-foreground text-right">Growth</th>
            </tr>
          </thead>
          <tbody>
            {data.map((plan, idx) => (
              <tr key={`${plan.planName}-${plan.tier}-${idx}`} className="border-b border-border/20 last:border-0">
                <td className="py-3 pr-4 font-medium">{plan.planName}</td>
                <td className="py-3 pr-4 text-right">{plan.activeUsers}</td>
                <td className="py-3 pr-4 text-right">{formatCurrency(plan.revenue)} AED</td>
                <td className="py-3 pr-4 text-right">
                  <span className={plan.churn > 5 ? "text-red-500" : plan.churn > 0 ? "text-amber-500" : "text-emerald-500"}>
                    {plan.churn}%
                  </span>
                </td>
                <td className="py-3 text-right">
                  <span className={`inline-flex items-center gap-0.5 ${plan.growth >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                    {plan.growth >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {Math.abs(plan.growth)}%
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
