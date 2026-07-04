"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, CreditCard, Clock, ShieldAlert, MessageSquareWarning } from "lucide-react";
import type { Alerts } from "./useSubscriptionDashboard";

interface Props {
  data: Alerts;
}

export function AlertsCenter({ data }: Props) {
  const t = useTranslations("alertsCenter");
  const items = [
    { label: t("failedPayments"), count: data.failedPayments, icon: CreditCard, color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/20" },
    { label: t("expiringSoon"), count: data.expiringSoon, icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/20" },
    { label: t("highRiskAccounts"), count: data.highRiskAccounts, icon: ShieldAlert, color: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/20" },
    { label: t("paymentDisputes"), count: data.disputes, icon: MessageSquareWarning, color: "text-violet-500", bg: "bg-violet-500/10", border: "border-violet-500/20" },
  ];

  if (data.total === 0) return null;

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> {t("alertsCenter")}
        </h4>
        {data.total > 0 && (
          <span className="text-xs font-bold text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full">
            {data.total} {t("active")}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className={`rounded-xl border ${item.border} ${item.bg} p-4 text-center`}
            >
              <Icon className={`h-5 w-5 ${item.color} mx-auto mb-2`} />
              <p className="text-2xl font-bold">{item.count}</p>
              <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">{item.label}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
