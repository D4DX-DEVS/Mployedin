"use client";

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { TrendingUp } from "lucide-react";
import type { RevenueTrendPoint } from "./useSubscriptionDashboard";

interface RevenueTrendChartProps {
  data: RevenueTrendPoint[];
}

function formatCurrency(n: number) {
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(Math.round(n));
}

export function RevenueTrendChart({ data }: RevenueTrendChartProps) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Revenue Trend (MRR)
          </h4>
          <p className="text-xs text-muted-foreground mt-1">Employer vs Job Seeker contribution over time</p>
        </div>
        <span className="text-xs text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-lg">Last 6 months</span>
      </div>
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">
          No revenue data available
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="empGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="jsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 12 }}
              className="fill-muted-foreground"
            />
            <YAxis
              tickFormatter={formatCurrency}
              tick={{ fontSize: 12 }}
              className="fill-muted-foreground"
              width={60}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "12px",
                fontSize: "12px",
              }}
              formatter={(value, name) => [
                `${new Intl.NumberFormat("en-US").format(Number(value))} AED`,
                name === "mrr" ? "Total MRR" : name === "employerMrr" ? "Employer" : "Job Seeker",
              ]}
            />
            <Legend
              formatter={(value: string) =>
                value === "mrr" ? "Total MRR" : value === "employerMrr" ? "Employer" : "Job Seeker"
              }
            />
            <Area
              type="monotone"
              dataKey="mrr"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill="url(#mrrGrad)"
            />
            <Area
              type="monotone"
              dataKey="employerMrr"
              stroke="#0ea5e9"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              fill="url(#empGrad)"
            />
            <Area
              type="monotone"
              dataKey="jobSeekerMrr"
              stroke="#8b5cf6"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              fill="url(#jsGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}
