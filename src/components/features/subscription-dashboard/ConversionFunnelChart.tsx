"use client";

import { useTranslations } from "next-intl";
import { Filter } from "lucide-react";
import type { ConversionFunnel as ConversionFunnelData } from "./useSubscriptionDashboard";
import { formatCount } from "@/lib/ui/intlFormat";

interface Props {
  data: ConversionFunnelData;
}

export function ConversionFunnelChart({ data }: Props) {
  const t = useTranslations("conversionFunnelChart");
  const stages = [
    { label: t("totalUsers"), value: data.totalUsers, color: "bg-primary" },
    { label: t("verified"), value: data.verified, color: "bg-primary/80" },
    { label: t("onboarded"), value: data.onboarded, color: "bg-indigo-500" },
    { label: t("trialFree"), value: data.trial, color: "bg-rose-400" },
    { label: t("paid"), value: data.paid, color: "bg-emerald-500" },
    { label: t("renewed"), value: data.renewed, color: "bg-amber-500" },
  ];

  const maxValue = Math.max(...stages.map((s) => s.value), 1);

  return (
    <section className="rounded-2xl border border-border/60 bg-card panel-body">
      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2 mb-5">
        <Filter className="h-4 w-4" /> {t("subscriptionConversionFunnel")}
      </h4>
      <div className="space-y-3">
        {stages.map((stage, idx) => {
          const widthPct = Math.max((stage.value / maxValue) * 100, 3);
          const convRate = idx > 0 && stages[idx - 1].value > 0
            ? Math.round((stage.value / stages[idx - 1].value) * 100)
            : 100;
          return (
            <div key={stage.label}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="font-medium">{stage.label}</span>
                <div className="flex items-center gap-3">
                  <span className="font-bold">{formatCount(stage.value)}</span>
                  {idx > 0 && (
                    <span className="text-xs text-muted-foreground">({convRate}%)</span>
                  )}
                </div>
              </div>
              <div className="h-5 rounded-full bg-muted/50 overflow-hidden">
                <div
                  className={`h-full rounded-full ${stage.color} transition-all duration-500`}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
