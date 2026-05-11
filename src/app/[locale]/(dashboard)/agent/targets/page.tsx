"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { useTranslations } from "next-intl";
import {
  Building2, Users, DollarSign, Crosshair, CalendarDays,
  Sparkles, Target,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TargetItem {
  _id: string;
  type: "employer" | "employee" | "finance";
  year: number;
  month?: number;
  targetValue: number;
  achieved: number;
  progress: number;
  currency?: string;
  status: string;
}

interface SummaryCard {
  type: "employer" | "employee" | "finance";
  monthly: { target: number; achieved: number; progress: number } | null;
  yearly: { target: number; achieved: number; progress: number } | null;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  employer: <Building2 className="h-6 w-6" />,
  employee: <Users className="h-6 w-6" />,
  finance: <DollarSign className="h-6 w-6" />,
};

const TYPE_SMALL_ICONS: Record<string, React.ReactNode> = {
  employer: <Building2 className="h-4 w-4" />,
  employee: <Users className="h-4 w-4" />,
  finance: <DollarSign className="h-4 w-4" />,
};

const TYPE_TONE: Record<string, string> = {
  employer: "workspace-tone-sky",
  employee: "workspace-tone-emerald",
  finance: "workspace-tone-amber",
};

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AgentTargetsPage() {
  const t = useTranslations("targets");
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [yearFilter, setYearFilter] = useState(currentYear);
  const [targets, setTargets] = useState<TargetItem[]>([]);
  const [summary, setSummary] = useState<SummaryCard[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTargets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agent/targets?year=${yearFilter}`);
      if (res.ok) {
        const data = await res.json();
        setTargets(data.targets ?? []);
        setSummary(data.summary ?? []);
      }
    } catch {
      toast.error("Failed to load targets");
    } finally {
      setLoading(false);
    }
  }, [yearFilter]);

  useEffect(() => { fetchTargets(); }, [fetchTargets]);

  if (loading) {
    return (
      <div className="page-container space-y-6">
        <div className="h-8 w-48 animate-pulse rounded-xl bg-muted" />
        <div className="grid gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-2xl bg-muted/50" />
          ))}
        </div>
      </div>
    );
  }

  const hasTargets = summary.some((s) => s.monthly || s.yearly);

  return (
    <div className="page-container space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Performance workspace
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("myTargets")}</h1>
          <p className="text-sm text-muted-foreground">{t("agentDescription")}</p>
        </div>
        <div className="relative">
          <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="number"
            value={yearFilter}
            onChange={(e) => setYearFilter(parseInt(e.target.value) || currentYear)}
            className="h-11 w-28 rounded-xl border-border bg-card pl-9 text-sm"
            aria-label="Year"
          />
        </div>
      </div>

      {!hasTargets ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/60 bg-card py-16">
          <div className="rounded-2xl bg-muted/50 p-5">
            <Crosshair className="h-10 w-10 text-muted-foreground/40" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">{t("noTargetsAssigned")}</p>
          <p className="text-xs text-muted-foreground">{t("contactSupervisor")}</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid gap-3 sm:grid-cols-3">
            {summary.map((card) => {
              const monthly = card.monthly;
              const yearly = card.yearly;
              const primary = monthly ?? yearly;
              if (!primary) return null;

              const progressColor =
                primary.progress >= 75 ? "text-emerald-600 dark:text-emerald-400" :
                primary.progress >= 40 ? "text-amber-600 dark:text-amber-400" :
                "text-muted-foreground";

              return (
                <div key={card.type} className="workspace-glass-panel rounded-2xl p-5">
                  <div className="flex items-start justify-between">
                    <div className={`${TYPE_TONE[card.type]} rounded-2xl p-2.5`}>
                      {TYPE_ICONS[card.type]}
                    </div>
                    <span className={`text-lg font-bold tabular-nums ${progressColor}`}>
                      {primary.progress}%
                    </span>
                  </div>

                  <h3 className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {t(`${card.type}Target`)}
                  </h3>

                  {monthly && (
                    <div className="mt-3">
                      <p className="text-xs text-muted-foreground">
                        {MONTHS_SHORT[currentMonth - 1]} {t("monthlyTarget")}
                      </p>
                      <div className="mt-1.5 flex items-baseline gap-1">
                        <span className="text-3xl font-semibold tracking-tight text-primary">{monthly.achieved.toLocaleString()}</span>
                        <span className="text-sm text-muted-foreground">/ {monthly.target.toLocaleString()}</span>
                      </div>
                      <Progress value={monthly.progress} className="mt-2.5 h-2" />
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {t("pending")}: {Math.max(0, monthly.target - monthly.achieved).toLocaleString()}
                      </p>
                    </div>
                  )}

                  {yearly && (
                    <div className={monthly ? "mt-4 border-t border-border/40 pt-3" : "mt-3"}>
                      <p className="text-xs text-muted-foreground">{t("yearlyTarget")}</p>
                      <div className="mt-1.5 flex items-baseline gap-1">
                        <span className={monthly ? "text-xl font-semibold text-primary" : "text-3xl font-semibold tracking-tight text-primary"}>
                          {yearly.achieved.toLocaleString()}
                        </span>
                        <span className="text-sm text-muted-foreground">/ {yearly.target.toLocaleString()}</span>
                      </div>
                      <Progress value={yearly.progress} className="mt-2.5 h-2" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Monthly breakdown grid */}
          {targets.filter((t) => t.month).length > 0 && (
            <section className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">{t("monthlyBreakdown")}</h2>
                <p className="text-sm text-muted-foreground">{t("monthlyBreakdownDescription")}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {targets
                  .filter((t) => t.month)
                  .sort((a, b) => (a.month ?? 0) - (b.month ?? 0))
                  .map((tgt) => {
                    const isCurrent = tgt.month === currentMonth;
                    const mColor =
                      tgt.progress >= 75 ? "text-emerald-600 dark:text-emerald-400" :
                      tgt.progress >= 40 ? "text-amber-600 dark:text-amber-400" :
                      "text-muted-foreground";
                    return (
                      <div
                        key={tgt._id}
                        className={`workspace-glass-panel rounded-2xl p-4 ${isCurrent ? "ring-2 ring-primary/30" : ""}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {isCurrent && <Target className="h-3.5 w-3.5 text-primary" />}
                            <p className="text-sm font-semibold">{MONTHS_SHORT[(tgt.month ?? 1) - 1]}</p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="flex h-5 w-5 items-center justify-center rounded bg-muted/60">
                              {TYPE_SMALL_ICONS[tgt.type]}
                            </span>
                            <span className="text-xs capitalize text-muted-foreground">{tgt.type}</span>
                          </div>
                        </div>
                        <div className="mt-3 flex items-baseline gap-1">
                          <span className="text-xl font-semibold tabular-nums text-primary">{tgt.achieved}</span>
                          <span className="text-xs text-muted-foreground">/ {tgt.targetValue}</span>
                        </div>
                        <div className="mt-2.5 flex items-center gap-2">
                          <Progress value={tgt.progress} className="h-2 flex-1" />
                          <span className={`text-xs font-semibold tabular-nums ${mColor}`}>{tgt.progress}%</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
