"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import {
  Building2, Users, DollarSign, ArrowLeft, Crosshair,
  Target, TrendingUp, Clock,
} from "lucide-react";
import Link from "next/link";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TargetDetail {
  _id: string;
  assigneeName: string;
  assigneeEmail: string;
  assigneeRole: string;
  type: "employer" | "employee" | "finance";
  year: number;
  month?: number;
  targetValue: number;
  achieved: number;
  progress: number;
  currency?: string;
  status: string;
  notes?: string;
  createdAt: string;
}

interface MonthlyBreakdown {
  _id: string;
  month: number;
  targetValue: number;
  achieved: number;
  progress: number;
  status: string;
}

const TYPE_ICONS = {
  employer: <Building2 className="h-5 w-5" />,
  employee: <Users className="h-5 w-5" />,
  finance: <DollarSign className="h-5 w-5" />,
};

const TYPE_COLORS = {
  employer: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
  employee: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400",
  finance: "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400",
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AdminTargetDetailPage() {
  const t = useTranslations("targets");
  const params = useParams();
  const locale = (params.locale as string) || "en";
  const id = params.id as string;

  const [target, setTarget] = useState<TargetDetail | null>(null);
  const [monthly, setMonthly] = useState<MonthlyBreakdown[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTarget = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/targets/${id}`);
      if (res.ok) {
        const data = await res.json();
        setTarget(data.target);
        setMonthly(data.monthlyBreakdown ?? []);
      } else {
        toast.error("Target not found");
      }
    } catch {
      toast.error("Failed to load target");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchTarget(); }, [fetchTarget]);

  if (loading) {
    return (
      <div className="page-container space-y-6">
        <div className="h-8 w-40 animate-pulse rounded-xl bg-muted" />
        <div className="h-56 animate-pulse rounded-2xl bg-muted/50" />
        <div className="grid gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted/50" />
          ))}
        </div>
      </div>
    );
  }

  if (!target) {
    return (
      <div className="page-container flex flex-col items-center gap-4 py-20">
        <div className="rounded-2xl bg-muted/50 p-5">
          <Crosshair className="h-10 w-10 text-muted-foreground/40" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">{t("notFound")}</p>
        <Link href={`/${locale}/admin/targets`}>
          <Button variant="outline" className="gap-2 rounded-xl">
            <ArrowLeft className="h-4 w-4" /> {t("backToTargets")}
          </Button>
        </Link>
      </div>
    );
  }

  const formatValue = (val: number) =>
    target.type === "finance"
      ? `${target.currency ?? "AED"} ${val.toLocaleString()}`
      : val.toLocaleString();

  const progressColor =
    target.progress >= 75 ? "text-emerald-600 dark:text-emerald-400" :
    target.progress >= 40 ? "text-amber-600 dark:text-amber-400" :
    "text-muted-foreground";

  return (
    <div className="page-container space-y-6">
      {/* Back link */}
      <Link
        href={`/${locale}/admin/targets`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> {t("backToTargets")}
      </Link>

      {/* Header card */}
      <div className="workspace-glass-panel rounded-2xl p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className={`rounded-2xl p-3.5 ${TYPE_COLORS[target.type]}`}>
              {TYPE_ICONS[target.type]}
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                {target.assigneeName} — <span className="capitalize">{target.type}</span> {t("target")}
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {target.year} · {target.assigneeRole === "super_agent" ? "Super Agent" : "Agent"} · {target.assigneeEmail}
              </p>
              {target.notes && (
                <p className="mt-2 rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{target.notes}</p>
              )}
            </div>
          </div>
          <StatusBadge status={target.status} />
        </div>

        {/* Progress bar */}
        <div className="mt-6 flex items-center gap-4">
          <Progress value={target.progress} className="h-3 flex-1" />
          <span className={`text-lg font-bold tabular-nums ${progressColor}`}>{target.progress}%</span>
        </div>
      </div>

      {/* KPI Cards */}
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="workspace-glass-panel rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("target")}</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-primary">{formatValue(target.targetValue)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Annual target value</p>
            </div>
            <div className="workspace-tone-sky rounded-2xl p-2.5">
              <Target className="h-5 w-5" />
            </div>
          </div>
        </div>
        <div className="workspace-glass-panel rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("achieved")}</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-primary">{formatValue(target.achieved)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Total achieved so far</p>
            </div>
            <div className="workspace-tone-emerald rounded-2xl p-2.5">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
        </div>
        <div className="workspace-glass-panel rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("pending")}</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-primary">
                {formatValue(Math.max(0, target.targetValue - target.achieved))}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Remaining to achieve</p>
            </div>
            <div className="workspace-tone-amber rounded-2xl p-2.5">
              <Clock className="h-5 w-5" />
            </div>
          </div>
        </div>
      </section>

      {/* Monthly breakdown */}
      {monthly.length > 0 && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{t("monthlyBreakdown")}</h2>
            <p className="text-sm text-muted-foreground">{t("monthlyBreakdownDescription")}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {monthly.map((m) => {
              const mProgress = m.progress;
              const mColor =
                mProgress >= 75 ? "text-emerald-600 dark:text-emerald-400" :
                mProgress >= 40 ? "text-amber-600 dark:text-amber-400" :
                "text-muted-foreground";
              return (
                <div key={m._id} className="workspace-glass-panel rounded-2xl p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">{MONTHS[m.month - 1]}</p>
                    <StatusBadge status={m.status} />
                  </div>
                  <div className="mt-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t("target")}:</span>
                      <span className="font-semibold tabular-nums">{formatValue(m.targetValue)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t("achieved")}:</span>
                      <span className="font-semibold tabular-nums">{formatValue(m.achieved)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t("pending")}:</span>
                      <span className="font-semibold tabular-nums">
                        {formatValue(Math.max(0, m.targetValue - m.achieved))}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Progress value={mProgress} className="h-2 flex-1" />
                    <span className={`text-xs font-semibold tabular-nums ${mColor}`}>{mProgress}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
