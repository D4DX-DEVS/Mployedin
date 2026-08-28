"use client";

import { useTranslations } from "next-intl";
import { Award, UserX } from "lucide-react";
import type { TopAgent } from "./useSubscriptionDashboard";

interface TopSellingAgentsTableProps {
  data: TopAgent[];
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

export function TopSellingAgentsTable({ data }: TopSellingAgentsTableProps) {
  const t = useTranslations("topSellingAgentsTable");

  return (
    <section className="rounded-2xl border border-border/60 bg-card panel-body">
      <div className="flex items-center justify-between mb-5">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Award className="h-4 w-4" /> {t("topSellingAgents")}
          <span className="text-[11px] text-muted-foreground font-normal normal-case tracking-normal">
            {t("thisMonth")}
          </span>
        </h4>
      </div>

      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <UserX className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">{t("noAgentSalesYet")}</p>
          <p className="text-xs text-muted-foreground/70 mt-1 max-w-[200px]">
            {t("agentAttributedDescription")}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((a) => (
            <div
              key={a.agentId}
              className="flex items-center gap-3 rounded-xl border border-border/40 chip-pad"
            >
              <div className="h-9 w-9 rounded-full bg-amber-500/10 flex items-center justify-center text-sm font-bold text-amber-600 shrink-0">
                {a.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{a.name}</p>
              </div>
              <div className="text-center shrink-0">
                <p className="text-sm font-semibold">{a.subscriptionsSold}</p>
                <p className="text-[11px] text-muted-foreground">{t("sold")}</p>
              </div>
              <div className="text-right shrink-0 ml-2">
                <p className="text-sm font-semibold">{formatCurrency(a.revenue)} AED</p>
                <p className="text-[11px] text-muted-foreground">{t("revenue")}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
