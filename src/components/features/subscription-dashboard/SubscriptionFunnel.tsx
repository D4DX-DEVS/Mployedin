"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Filter } from "lucide-react";
import type { FunnelStage } from "./useSubscriptionDashboard";

interface SubscriptionFunnelProps {
  employer: FunnelStage[];
  jobSeeker: FunnelStage[];
}

const TIER_COLORS: Record<string, string> = {
  Total: "bg-sky-500",
  Free: "bg-zinc-500",
  Trial: "bg-slate-400",
  Silver: "bg-slate-500",
  Gold: "bg-amber-500",
  Platinum: "bg-violet-500",
};

function formatNumber(n: number, locale: string) {
  return new Intl.NumberFormat(locale).format(n);
}

export function SubscriptionFunnel({ employer, jobSeeker }: SubscriptionFunnelProps) {
  const t = useTranslations("subscriptionFunnel");
  const locale = useLocale();
  const [tab, setTab] = useState<"employer" | "jobSeeker">("employer");
  const stages = tab === "employer" ? employer : jobSeeker;
  const maxCount = stages.length > 0 ? Math.max(...stages.map((s) => s.count)) : 1;

  return (
    <section className="rounded-2xl border border-border/60 bg-card panel-body">
      <div className="flex items-center justify-between mb-6">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Filter className="h-4 w-4" /> {t("planSplit")}
        </h4>
        <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
          <button
            onClick={() => setTab("employer")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              tab === "employer" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("employers")}
          </button>
          <button
            onClick={() => setTab("jobSeeker")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              tab === "jobSeeker" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("jobSeekers")}
          </button>
        </div>
      </div>

      {stages.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">{t("noDataAvailable")}</p>
      ) : (
        <div className="space-y-3">
          {stages.map((stage, i) => {
            const widthPct = maxCount > 0 ? (stage.count / maxCount) * 100 : 0;
            const label = stage.labelKey
              ? t(stage.labelKey, { tier: stage.tier ?? 0 })
              : stage.name;
            const color = TIER_COLORS[stage.labelKey === "stageTotal" ? "Total" : stage.name] ?? "bg-sky-500";
            return (
              <div key={`${stage.labelKey ?? stage.name}-${i}`} className="group">
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="font-medium">{label}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold">{formatNumber(stage.count, locale)}</span>
                    <span className="text-muted-foreground text-xs w-14 text-right">
                      ({stage.percentage}%)
                    </span>
                  </div>
                </div>
                <div className="h-3 rounded-full bg-muted/70 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${color} transition-all duration-500`}
                    style={{ width: `${Math.max(widthPct, 2)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
