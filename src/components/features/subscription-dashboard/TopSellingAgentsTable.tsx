"use client";

import { Award } from "lucide-react";
import type { TopAgent } from "./useSubscriptionDashboard";

interface TopSellingAgentsTableProps {
  data: TopAgent[];
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

export function TopSellingAgentsTable({ data }: TopSellingAgentsTableProps) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card p-6">
      <div className="flex items-center justify-between mb-5">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Award className="h-4 w-4" /> Top Selling Agents
          <span className="text-[10px] text-muted-foreground font-normal normal-case tracking-normal">
            (This Month)
          </span>
        </h4>
        <span className="text-xs text-primary cursor-pointer hover:underline">View all</span>
      </div>

      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No agent data</p>
      ) : (
        <div className="space-y-3">
          {data.map((a) => (
            <div
              key={a.agentId}
              className="flex items-center gap-3 rounded-xl border border-border/40 p-3"
            >
              <div className="h-9 w-9 rounded-full bg-amber-500/10 flex items-center justify-center text-sm font-bold text-amber-600 shrink-0">
                {a.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{a.name}</p>
              </div>
              <div className="text-center shrink-0">
                <p className="text-sm font-semibold">{a.subscriptionsSold}</p>
                <p className="text-[10px] text-muted-foreground">Subscriptions</p>
              </div>
              <div className="text-right shrink-0 ml-4">
                <p className="text-sm font-semibold">{formatCurrency(a.revenue)} AED</p>
                <p className="text-[10px] text-muted-foreground">Revenue</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
