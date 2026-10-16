"use client";

import { useLocale, useTranslations } from "next-intl";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle, CheckCircle2, Clock, TrendingUp, TrendingDown, Target, Zap, Award, Medal,
} from "lucide-react";
import { resolveIntlLocale } from "@/lib/ui/intlFormat";
import { cn } from "@/lib/utils";
import { formatProfit, monthName } from "./profitFormat";

export type IncentiveTier = "none" | "bronze" | "silver" | "gold" | "platinum";

/** Green from 75%, amber from 40%, red below: one scale for every progress figure. */
function progressTone(progress: number) {
  return progress >= 75 ? "text-emerald-600" : progress >= 40 ? "text-amber-600" : "text-red-500";
}

/* ------------------------------------------------------------------ */
/*  Compact Progress Cell (table cell with achieved/target + bar)      */
/* ------------------------------------------------------------------ */

interface CompactProgressProps {
  achieved: number;
  target: number;
  progress: number;
  currency?: string;
  className?: string;
}

export function CompactProgress({ achieved, target, progress, currency = "AED", className = "" }: CompactProgressProps) {
  const locale = useLocale();

  return (
    <div className={cn("space-y-1 min-w-[120px]", className)}>
      <div className="flex items-baseline gap-1 tabular-nums">
        <span className="text-sm font-semibold">{formatProfit(achieved, currency, locale)}</span>
        <span className="text-[11px] text-muted-foreground">/ {formatProfit(target, currency, locale)}</span>
      </div>
      <div className="flex items-center gap-2">
        {/* Up to 4rem, down to 2rem when a crowded table passes `min-w-0`. */}
        <Progress value={Math.min(progress, 100)} className="h-1.5 min-w-8 max-w-16" />
        <span className={`shrink-0 text-[11px] font-bold tabular-nums ${progressTone(progress)}`}>{progress}%</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Risk Badge                                                         */
/* ------------------------------------------------------------------ */

export function RiskBadge({ risk }: { risk: "high" | "medium" | "low" }) {
  const t = useTranslations("targetComponents");
  if (risk === "high")
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-red-600">
        <AlertTriangle className="h-3 w-3" /> {t("high")}
      </span>
    );
  if (risk === "medium")
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-600">
        <Clock className="h-3 w-3" /> {t("medium")}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emerald-600">
      <CheckCircle2 className="h-3 w-3" /> {t("low")}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Completion Stage                                                   */
/* ------------------------------------------------------------------ */

export type CompletionStage = "not_started" | "in_progress" | "completed";

export function getCompletionStage(progress: number): CompletionStage {
  if (progress >= 100) return "completed";
  if (progress > 0) return "in_progress";
  return "not_started";
}

export function CompletionBadge({ stage }: { stage: CompletionStage }) {
  const t = useTranslations("targetComponents");
  if (stage === "completed") {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emerald-600">
        <CheckCircle2 className="h-3 w-3" /> {t("completed")}
      </span>
    );
  }

  if (stage === "in_progress") {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-sky-600">
        <Clock className="h-3 w-3" /> {t("inProgress")}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
      <Target className="h-3 w-3" /> {t("notStarted")}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Incentive Tier Badge                                               */
/* ------------------------------------------------------------------ */

export function IncentiveTierBadge({ tier }: { tier: IncentiveTier }) {
  const t = useTranslations("targetComponents");
  if (tier === "none") return null;

  const toneMap: Record<Exclude<IncentiveTier, "none">, string> = {
    bronze: "bg-amber-700/10 text-amber-700",
    silver: "bg-slate-400/15 text-slate-600",
    gold: "bg-yellow-500/15 text-yellow-700",
    platinum: "bg-violet-500/15 text-violet-700",
  };

  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${toneMap[tier]}`}>
      {/* The raw enum used to render here, so an Arabic admin saw "PLATINUM". */}
      <Award className="h-3 w-3 shrink-0" /> {t(`tier_${tier}`)}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Performance Badge (progress bar + pct)                             */
/* ------------------------------------------------------------------ */

export function PerformanceBadge({ pct }: { pct: number }) {
  const color =
    pct >= 75 ? "text-emerald-600 bg-emerald-500/10" :
    pct >= 40 ? "text-amber-600 bg-amber-500/10" :
    "text-red-600 bg-red-500/10";
  return (
    <div className="flex items-center gap-2">
      <Progress value={Math.min(pct, 100)} className="h-2 w-14" />
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${color}`}>
        {pct}%
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  KPI Stat Card                                                      */
/* ------------------------------------------------------------------ */

interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  subtext?: React.ReactNode;
  icon: React.ReactNode;
  toneClassName?: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
}

export function KpiCard({
  label, value, subtext, icon, toneClassName = "workspace-tone-sky",
  trend, trendValue,
}: KpiCardProps) {
  return (
    <div className="workspace-glass-panel card-pad rounded-2xl">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 break-words text-3xl font-semibold tracking-tight text-primary">
            {value}
          </p>
          {subtext && (
            <p className="mt-1 text-xs text-muted-foreground">{subtext}</p>
          )}
          {trend && trendValue && (
            <div className={`mt-1 inline-flex items-center gap-1 text-xs font-semibold ${
              trend === "up" ? "text-emerald-600" :
              trend === "down" ? "text-red-600" :
              "text-muted-foreground"
            }`}>
              {trend === "up" ? <TrendingUp className="h-3 w-3" /> :
               trend === "down" ? <TrendingDown className="h-3 w-3" /> : null}
              {trendValue}
            </div>
          )}
        </div>
        <div className={`${toneClassName} shrink-0 rounded-2xl p-2.5`}>{icon}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Profit Target Summary Card (assigned / achieved / balance)         */
/* ------------------------------------------------------------------ */

interface TargetSummaryCardProps {
  profitTarget: number;
  profitAchieved: number;
  currency?: string;
}

export function TargetSummaryCard({ profitTarget, profitAchieved, currency = "AED" }: TargetSummaryCardProps) {
  const t = useTranslations("targetComponents");
  const locale = useLocale();
  const progress = profitTarget > 0 ? Math.min(Math.round((profitAchieved / profitTarget) * 100), 999) : 0;
  const pending = Math.max(0, profitTarget - profitAchieved);
  const fmt = (value: number) => formatProfit(value, currency, locale);

  return (
    <div className="workspace-glass-panel card-pad rounded-xl">
      <div className="mb-3 grid grid-cols-3 gap-2 text-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("assigned")}</p>
          <p className="font-semibold tabular-nums">{fmt(profitTarget)}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("achieved")}</p>
          <p className="font-semibold tabular-nums text-primary">{fmt(profitAchieved)}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("balance")}</p>
          <p className="font-semibold tabular-nums text-amber-600">{fmt(pending)}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Progress value={Math.min(progress, 100)} className="h-2 flex-1" />
        <span className={`text-xs font-bold tabular-nums ${progressTone(progress)}`}>{progress}%</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Circular Progress Ring (SVG)                                       */
/* ------------------------------------------------------------------ */

interface ProgressRingProps {
  value: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
  color?: string;
}

export function ProgressRing({
  value, size = 120, strokeWidth = 8, label, sublabel,
  color,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(value, 100) / 100) * circumference;
  const autoColor = value >= 75 ? "#10b981" : value >= 40 ? "#f59e0b" : "#ef4444";
  const strokeColor = color ?? autoColor;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="transform -rotate-90" width={size} height={size}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-muted/30"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold tabular-nums">{value}%</span>
        </div>
      </div>
      {label && (
        <span className="text-xs font-semibold text-foreground">{label}</span>
      )}
      {sublabel && (
        <span className="text-[11px] text-muted-foreground">{sublabel}</span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Monthly Distribution Grid                                          */
/* ------------------------------------------------------------------ */

interface MonthlyProfit {
  month: number;
  profitTarget: number;
  profitAchieved: number;
  profitProgress: number;
}

export function MonthlyDistributionGrid({
  months,
  currency = "AED",
}: {
  months: MonthlyProfit[];
  currency?: string;
}) {
  const t = useTranslations("targetComponents");
  const locale = resolveIntlLocale(useLocale());
  const currentMonth = new Date().getMonth() + 1;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {months.map((m) => {
        const isCurrent = m.month === currentMonth;
        const isPast = m.month < currentMonth;
        return (
          <div
            key={m.month}
            className={`workspace-glass-panel rounded-xl transition-all ${ isCurrent ? "ring-2 ring-primary/30" : "" } ${isPast && m.profitTarget > 0 && m.profitProgress < 50 ? "border-red-500/20" : ""} chip-pad`}
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground">
                {monthName(m.month, locale)}
              </p>
              {isCurrent && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                  <Zap className="h-2.5 w-2.5" /> {t("now")}
                </span>
              )}
            </div>
            <p className="text-sm font-semibold tabular-nums">{formatProfit(m.profitAchieved, currency, locale)}</p>
            <p className="text-[11px] tabular-nums text-muted-foreground">
              {t("ofTarget", { target: formatProfit(m.profitTarget, currency, locale) })}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Progress value={Math.min(m.profitProgress, 100)} className="h-1.5 flex-1" />
              <span className={`text-[11px] font-bold tabular-nums ${m.profitProgress >= 40 ? progressTone(m.profitProgress) : "text-muted-foreground"}`}>
                {m.profitProgress}%
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Rank Badge                                                         */
/* ------------------------------------------------------------------ */

export function RankBadge({ rank }: { rank: number }) {
  if (rank === 1)
    return (
      <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-yellow-500/20 text-xs font-bold text-yellow-600">
        <Medal className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">#1</span>
      </span>
    );
  if (rank === 2)
    return (
      <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-slate-300/20 text-xs font-bold text-slate-500">
        <Medal className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">#2</span>
      </span>
    );
  if (rank === 3)
    return (
      <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-orange-500/20 text-xs font-bold text-orange-600">
        <Medal className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">#3</span>
      </span>
    );
  return (
    <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-muted text-[11px] font-bold tabular-nums text-muted-foreground">
      #{rank}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Empty State                                                        */
/* ------------------------------------------------------------------ */

export function TargetEmptyState({
  title,
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  const t = useTranslations("targetComponents");
  const displayTitle = title ?? t("noTargetsFound");
  const displayDescription = description ?? t("assignAnnualTargets");
  return (
    // w-full/min-w-0: this often renders inside a colSpan cell that the mobile
    // card-table CSS flips to `display:flex`. Without a width constraint the
    // content sizes to max-content and overflows right instead of centering.
    <div className="flex w-full min-w-0 flex-col items-center gap-3 py-10 text-center sm:py-16">
      <div className="rounded-2xl bg-muted/50 p-4">
        <Target className="h-8 w-8 text-muted-foreground/40" />
      </div>
      <p className="text-sm font-medium text-muted-foreground">{displayTitle}</p>
      <p className="text-xs text-muted-foreground max-w-sm text-center">{displayDescription}</p>
      {action}
    </div>
  );
}
