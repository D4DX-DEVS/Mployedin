"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Activity, CheckCircle, ArrowUpRight, ArrowDownRight,
  RotateCcw, XCircle, AlertTriangle,
} from "lucide-react";
import type { ActivityItem } from "./useSubscriptionDashboard";

interface RecentActivityFeedProps {
  data: ActivityItem[];
}

function getActionConfig(t: ReturnType<typeof useTranslations>) {
  return {
    assigned: { icon: CheckCircle, color: "text-emerald-400", label: t("newSubscription") },
    upgraded: { icon: ArrowUpRight, color: "text-sky-400", label: t("upgraded") },
    downgraded: { icon: ArrowDownRight, color: "text-amber-400", label: t("downgraded") },
    renewed: { icon: RotateCcw, color: "text-emerald-400", label: t("renewed") },
    cancelled: { icon: XCircle, color: "text-red-400", label: t("cancelled") },
    expired: { icon: AlertTriangle, color: "text-amber-400", label: t("expired") },
    suspended: { icon: AlertTriangle, color: "text-orange-400", label: t("suspended") },
    reactivated: { icon: CheckCircle, color: "text-emerald-400", label: t("reactivated") },
  } as const;
}

function getFilterOptions(t: ReturnType<typeof useTranslations>) {
  return [
    { key: "all", label: t("all") },
    { key: "assigned", label: t("new") },
    { key: "upgraded", label: t("upgrade") },
    { key: "downgraded", label: t("downgrade") },
    { key: "renewed", label: t("renewal") },
    { key: "cancelled", label: t("cancel") },
  ];
}

function timeAgo(dateStr: string, t: ReturnType<typeof useTranslations>) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 36e5);
  if (hours < 1) return t("justNow");
  if (hours < 24) return t("hoursAgo", { hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return t("oneDayAgo");
  return t("daysAgo", { days });
}

export function RecentActivityFeed({ data }: RecentActivityFeedProps) {
  const t = useTranslations("recentActivityFeed");
  const tc = useTranslations("common");
  const [filter, setFilter] = useState("all");
  const filtered = filter === "all" ? data : data.filter((a) => a.action === filter);
  const actionConfig = getActionConfig(t);
  const filterOptions = getFilterOptions(t);

  return (
    <section className="rounded-2xl border border-border/60 bg-card panel-body">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Activity className="h-4 w-4" /> {t("recentActivity")}
        </h4>
        <span className="text-xs text-primary cursor-pointer hover:underline">{tc("view")}</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-1 mb-4">
        {filterOptions.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
              filter === f.key
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted/50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">{t("noActivity")}</p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {filtered.slice(0, 10).map((a) => {
            const cfg = actionConfig[a.action as keyof typeof actionConfig] ?? actionConfig.assigned;
            const Icon = cfg.icon;
            return (
              <div
                key={a.id}
                className="flex items-center gap-3 rounded-xl border border-border/40 chip-pad"
              >
                <div className={`mt-0.5 shrink-0 ${cfg.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-medium">{a.userName}</span>{" "}
                    <span className="text-muted-foreground">{cfg.label.toLowerCase()}</span>
                    {a.toPlanName && (
                      <> → <span className="font-semibold text-primary">{a.toPlanName}</span></>
                    )}
                  </p>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                    <span>{timeAgo(a.createdAt, t)}</span>
                    {a.performedByName && <span>· {t("by", { name: a.performedByName })}</span>}
                  </div>
                </div>
                <span className="shrink-0 text-[10px] font-medium rounded-md border border-border/60 bg-muted/40 px-2 py-0.5">
                  {a.userEmail?.includes("employer") ? t("employer") : t("jobSeeker")}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
