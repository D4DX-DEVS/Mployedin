"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { useTranslations } from "next-intl";
import { BarChart3 } from "lucide-react";
import type { PlanDistributionItem } from "./useSubscriptionDashboard";

interface PlanDistributionChartProps {
  data: PlanDistributionItem[];
  totalMrr: number;
}

const TIER_COLORS: Record<number, string> = {
  0: "#71717a", // zinc-500 — Free
  1: "#64748b", // slate-500 — Silver
  2: "#f59e0b", // amber-500 — Gold
  3: "#8b5cf6", // violet-500 — Platinum
};

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0 }).format(n);
}

export function PlanDistributionChart({ data, totalMrr }: PlanDistributionChartProps) {
  const t = useTranslations("planDistributionChart");
  const chartData = data.map((d) => ({
    name: d.planName,
    value: d.revenue,
    tier: d.tier,
    percentage: d.percentage,
    count: d.count,
  }));

  return (
    <section className="rounded-2xl border border-border/60 bg-card panel-body">
      <div className="flex items-center justify-between mb-6">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <BarChart3 className="h-4 w-4" /> {t("planDistributionByRevenue")}
        </h4>
      </div>

      {chartData.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">{t("noPlanData")}</p>
      ) : (
        <div className="flex flex-col lg:flex-row items-center gap-6">
          <div className="relative w-full max-w-[220px]">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  dataKey="value"
                  strokeWidth={2}
                  stroke="hsl(var(--card))"
                >
                  {chartData.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={TIER_COLORS[entry.tier] ?? "#0ea5e9"}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "12px",
                    fontSize: "12px",
                  }}
                  formatter={(value) => [`${formatCurrency(Number(value))} AED`, "Revenue"]}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Center label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-lg font-bold">{formatCurrency(totalMrr)}</span>
              <span className="text-[10px] text-muted-foreground font-medium">{t("aedMrr")}</span>
            </div>
          </div>

          {/* Legend */}
          <div className="flex-1 space-y-2 w-full">
            {data.map((plan) => (
              <div
                key={plan.planName}
                className="flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: TIER_COLORS[plan.tier] ?? "#0ea5e9" }}
                  />
                  <span className="font-medium">{plan.planName}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-muted-foreground">
                    {formatCurrency(plan.revenue)} AED
                  </span>
                  <span className="text-xs text-muted-foreground w-14 text-right">
                    ({plan.percentage}%)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
