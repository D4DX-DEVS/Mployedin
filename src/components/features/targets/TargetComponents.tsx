"use client";

import { useTranslations } from "next-intl";
import { Progress } from "@/components/ui/progress";
import {
  Building2, Users, DollarSign, AlertTriangle, CheckCircle2,
  Clock, TrendingUp, TrendingDown, Target, Zap, Award,
} from "lucide-react";
import { formatCount } from "@/lib/ui/intlFormat";

export type IncentiveTier = "none" | "bronze" | "silver" | "gold" | "platinum";

/* ------------------------------------------------------------------ */
/*  Compact Progress Cell (table cell with achieved/target + bar)      */
/* ------------------------------------------------------------------ */

interface CompactProgressProps {
  achieved: number;
  target: number;
  progress: number;
  type?: "employer" | "employee" | "finance";
  currency?: string;
  className?: string;
}

export function CompactProgress({
  achieved, target, progress, type, currency = "AED", className = "",
}: CompactProgressProps) {
  const isFinance = type === "finance";
  const fmt = (v: number) =>
    isFinance ? `${currency} ${formatCount(v)}` : formatCount(v);
  const color =
    progress >= 75 ? "text-emerald-600" :
    progress >= 40 ? "text-amber-600" :
    "text-red-500";

  return (
    <div className={`space-y-1 min-w-[120px] ${className}`}>
      <div className="flex items-baseline gap-1 tabular-nums">
        <span className="text-sm font-semibold">{fmt(achieved)}</span>
        <span className="text-[11px] text-muted-foreground">/ {fmt(target)}</span>
      </div>
      <div className="flex items-center gap-2">
        <Progress value={Math.min(progress, 100)} className="h-1.5 w-16" />
        <span className={`text-[11px] font-bold tabular-nums ${color}`}>{progress}%</span>
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
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-600">
        <AlertTriangle className="h-3 w-3" /> {t("high")}
      </span>
    );
  if (risk === "medium")
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600">
        <Clock className="h-3 w-3" /> {t("medium")}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
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
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
        <CheckCircle2 className="h-3 w-3" /> {t("completed")}
      </span>
    );
  }

  if (stage === "in_progress") {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-600">
        <Clock className="h-3 w-3" /> {t("inProgress")}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
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
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${toneMap[tier]}`}>
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
/*  Target Type Icon                                                   */
/* ------------------------------------------------------------------ */

const TYPE_ICON_MAP = {
  employer: Building2,
  employee: Users,
  finance: DollarSign,
} as const;

const TYPE_TONE_MAP = {
  employer: "workspace-tone-sky",
  employee: "workspace-tone-emerald",
  finance: "workspace-tone-amber",
} as const;

export function TargetTypeIcon({
  type,
  size = "md",
}: {
  type: "employer" | "employee" | "finance";
  size?: "sm" | "md" | "lg";
}) {
  const Icon = TYPE_ICON_MAP[type];
  const tone = TYPE_TONE_MAP[type];
  const sizeClass = size === "sm" ? "p-1.5" : size === "lg" ? "p-3.5" : "p-2.5";
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-6 w-6" : "h-5 w-5";

  return (
    <div className={`${tone} rounded-2xl ${sizeClass}`}>
      <Icon className={iconSize} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  KPI Stat Card                                                      */
/* ------------------------------------------------------------------ */

interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  subtext?: string;
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
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-primary">
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
        <div className={`${toneClassName} rounded-2xl p-2.5`}>{icon}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Unified Target Summary Card (employer + employee + finance)        */
/* ------------------------------------------------------------------ */

interface TargetSummaryCardProps {
  employerTarget: number;
  employeeTarget: number;
  financeTarget: number;
  employerAchieved: number;
  employeeAchieved: number;
  financeAchieved: number;
  currency?: string;
  compact?: boolean;
}

export function TargetSummaryCard({
  employerTarget, employeeTarget, financeTarget,
  employerAchieved, employeeAchieved, financeAchieved,
  currency = "AED", compact = false,
}: TargetSummaryCardProps) {
  const t = useTranslations("targetComponents");
  const types = [
    { type: "employer" as const, target: employerTarget, achieved: employerAchieved },
    { type: "employee" as const, target: employeeTarget, achieved: employeeAchieved },
    { type: "finance" as const, target: financeTarget, achieved: financeAchieved },
  ];

  return (
    <div className={`grid gap-3 ${compact ? "sm:grid-cols-3" : "sm:grid-cols-1 lg:grid-cols-3"}`}>
      {types.map(({ type, target: tgt, achieved }) => {
        const pct = tgt > 0 ? Math.min(Math.round((achieved / tgt) * 100), 999) : 0;
        const pending = Math.max(0, tgt - achieved);
        const isFinance = type === "finance";
        const fmt = (v: number) =>
          isFinance ? `${currency} ${formatCount(v)}` : formatCount(v);

        return (
          <div key={type} className="workspace-glass-panel card-pad rounded-xl">
            <div className="flex items-center gap-2 mb-3">
              <TargetTypeIcon type={type} size="sm" />
              <span className="text-sm font-semibold capitalize">{type}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm mb-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("assigned")}
                </p>
                <p className="font-semibold tabular-nums">{fmt(tgt)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("achieved")}
                </p>
                <p className="font-semibold tabular-nums text-primary">{fmt(achieved)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("balance")}
                </p>
                <p className="font-semibold tabular-nums text-amber-600">
                  {fmt(pending)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Progress value={Math.min(pct, 100)} className="h-2 flex-1" />
              <span className={`text-xs font-bold tabular-nums ${
                pct >= 75 ? "text-emerald-600" :
                pct >= 40 ? "text-amber-600" :
                "text-red-500"
              }`}>{pct}%</span>
            </div>
          </div>
        );
      })}
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
        <span className="text-[10px] text-muted-foreground">{sublabel}</span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Monthly Distribution Grid                                          */
/* ------------------------------------------------------------------ */

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

interface MonthlyAchievementData {
  month: number;
  employerTarget: number;
  employeeTarget: number;
  financeTarget: number;
  employerAchieved: number;
  employeeAchieved: number;
  financeAchieved: number;
  overallProgress: number;
}

export function MonthlyDistributionGrid({
  months,
  currency = "AED",
}: {
  months: MonthlyAchievementData[];
  currency?: string;
}) {
  const currentMonth = new Date().getMonth() + 1;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {months.map((m) => {
        const isCurrent = m.month === currentMonth;
        const isPast = m.month < currentMonth;
        return (
          <div
            key={m.month}
            className={`workspace-glass-panel rounded-xl transition-all ${ isCurrent ? "ring-2 ring-primary/30" : "" } ${isPast && m.overallProgress < 50 ? "border-red-500/20" : ""} chip-pad`}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground">
                {MONTHS_SHORT[m.month - 1]}
              </p>
              {isCurrent && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                  <Zap className="h-2.5 w-2.5" /> Now
                </span>
              )}
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Emp:</span>
                <span className="font-semibold tabular-nums">
                  {m.employerAchieved}/{m.employerTarget}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Empl:</span>
                <span className="font-semibold tabular-nums">
                  {m.employeeAchieved}/{m.employeeTarget}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fin:</span>
                <span className="font-semibold tabular-nums">
                  {currency} {formatCount(m.financeAchieved)}/{formatCount(m.financeTarget)}
                </span>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Progress value={Math.min(m.overallProgress, 100)} className="h-1.5 flex-1" />
              <span className={`text-[10px] font-bold tabular-nums ${
                m.overallProgress >= 75 ? "text-emerald-600" :
                m.overallProgress >= 40 ? "text-amber-600" :
                "text-muted-foreground"
              }`}>{m.overallProgress}%</span>
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
        🥇
      </span>
    );
  if (rank === 2)
    return (
      <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-slate-300/20 text-xs font-bold text-slate-500">
        🥈
      </span>
    );
  if (rank === 3)
    return (
      <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-orange-500/20 text-xs font-bold text-orange-600">
        🥉
      </span>
    );
  return (
    <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-muted text-[11px] font-bold tabular-nums text-muted-foreground">
      #{rank}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Quarter Card                                                       */
/* ------------------------------------------------------------------ */

interface QuarterData {
  label: string;
  employerTarget: number;
  employeeTarget: number;
  financeTarget: number;
}

export function QuarterlyBreakdownGrid({
  quarters,
  currency = "AED",
}: {
  quarters: QuarterData[];
  currency?: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {quarters.map((q) => (
        <div key={q.label} className="workspace-glass-panel card-pad rounded-xl">
          <p className="text-sm font-semibold text-primary mb-3">{q.label}</p>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Employer</span>
              </div>
              <span className="font-semibold tabular-nums">{formatCount(q.employerTarget)}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Employee</span>
              </div>
              <span className="font-semibold tabular-nums">{formatCount(q.employeeTarget)}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Finance</span>
              </div>
              <span className="font-semibold tabular-nums">{currency} {formatCount(q.financeTarget)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
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
