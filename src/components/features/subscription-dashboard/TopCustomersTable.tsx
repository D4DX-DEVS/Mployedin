"use client";

import { useTranslations } from "next-intl";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { TopCustomer } from "./useSubscriptionDashboard";

interface TopCustomersTableProps {
  data: TopCustomer[];
}

function getTierBadge(t: ReturnType<typeof useTranslations>) {
  return {
    0: { label: t("free"), className: "bg-zinc-500/10 text-zinc-500 border-zinc-500/30" },
    1: { label: t("silver"), className: "bg-slate-400/10 text-slate-500 border-slate-400/30" },
    2: { label: t("gold"), className: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
    3: { label: t("platinum"), className: "bg-violet-500/10 text-violet-500 border-violet-500/30" },
  };
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

function formatDate(d: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function TopCustomersTable({ data }: TopCustomersTableProps) {
  const t = useTranslations("topCustomersTable");
  const tc = useTranslations("common");
  const tierBadge = getTierBadge(t);
  const badge = (tier: number) => tierBadge[tier as keyof typeof tierBadge] ?? tierBadge[0];

  return (
    <section className="rounded-2xl border border-border/60 bg-card panel-body">
      <div className="flex items-center justify-between mb-5">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Users className="h-4 w-4" /> {t("topCustomersByMRR")}
        </h4>
        <span className="text-xs text-primary cursor-pointer hover:underline">{tc("view")}</span>
      </div>

      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">{t("noCustomerData")}</p>
      ) : (
        <div className="space-y-3">
          {data.map((c) => {
            const b = badge(c.tier);
            return (
              <div
                key={c.userId}
                className="flex items-center gap-3 rounded-xl border border-border/40 chip-pad"
              >
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                </div>
                <Badge className={`text-[10px] shrink-0 ${b.className}`}>
                  {c.planName || b.label}
                </Badge>
                <div className="text-right shrink-0 ml-2">
                  <p className="text-sm font-semibold">{formatCurrency(c.mrr)} AED</p>
                  <p className="text-[10px] text-muted-foreground">{formatDate(c.since)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
