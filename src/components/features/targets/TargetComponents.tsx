"use client";

import { Progress } from "@/components/ui/progress";
import {
  Building2, Users, DollarSign, AlertTriangle, CheckCircle2,
  Clock, TrendingUp, TrendingDown, Target, Zap,
} from "lucide-react";

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
    isFinance ? `${currency} ${v.toLocaleString()}` : v.toLocaleString();
  const color =
    progress >= 75 ? "text-emerald-600 dark:text-emerald-400" :
    progress >= 40 ? "text-amber-600 dark:text-amber-400" :
    "text-red-500 dark:text-red-400";

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
  if (risk === "high")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
        <AlertTriangle className="h-3 w-3" /> High
      </span>
    );
  if (risk === "medium")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
        <Clock className="h-3 w-3" /> Medium
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
      <CheckCircle2 className="h-3 w-3" /> Low
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Performance Badge (progress bar + pct)                             */
/* ------------------------------------------------------------------ */

export function PerformanceBadge({ pct }: { pct: number }) {
  const color =
    pct >= 75 ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10" :
    pct >= 40 ? "text-amber-600 dark:text-amber-400 bg-amber-500/10" :
    "text-red-600 dark:text-red-400 bg-red-500/10";
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
    <div className="workspace-glass-panel rounded-2xl p-4">
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
              trend === "up" ? "text-emerald-600 dark:text-emerald-400" :
              trend === "down" ? "text-red-600 dark:text-red-400" :
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
          isFinance ? `${currency} ${v.toLocaleString()}` : v.toLocaleString();

        return (
          <div key={type} className="workspace-glass-panel rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <TargetTypeIcon type={type} size="sm" />
              <span className="text-sm font-semibold capitalize">{type}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm mb-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Target
                </p>
                <p className="font-semibold tabular-nums">{fmt(tgt)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Achieved
                </p>
                <p className="font-semibold tabular-nums text-primary">{fmt(achieved)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Pending
                </p>
                <p className="font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                  {fmt(pending)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Progress value={Math.min(pct, 100)} className="h-2 flex-1" />
              <span className={`text-xs font-bold tabular-nums ${
                pct >= 75 ? "text-emerald-600 dark:text-emerald-400" :
                pct >= 40 ? "text-amber-600 dark:text-amber-400" :
                "text-red-500 dark:text-red-400"
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
    <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {months.map((m) => {
        const isCurrent = m.month === currentMonth;
        const isPast = m.month < currentMonth;
        return (
          <div
            key={m.month}
            className={`workspace-glass-panel rounded-xl p-3 transition-all ${
              isCurrent ? "ring-2 ring-primary/30" : ""
            } ${isPast && m.overallProgress < 50 ? "border-red-500/20" : ""}`}
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
                  {currency} {m.financeAchieved.toLocaleString()}/{m.financeTarget.toLocaleString()}
                </span>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Progress value={Math.min(m.overallProgress, 100)} className="h-1.5 flex-1" />
              <span className={`text-[10px] font-bold tabular-nums ${
                m.overallProgress >= 75 ? "text-emerald-600 dark:text-emerald-400" :
                m.overallProgress >= 40 ? "text-amber-600 dark:text-amber-400" :
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
      <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-yellow-500/20 text-xs font-bold text-yellow-600 dark:text-yellow-400">
        🥇
      </span>
    );
  if (rank === 2)
    return (
      <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-slate-300/20 text-xs font-bold text-slate-500 dark:text-slate-400">
        🥈
      </span>
    );
  if (rank === 3)
    return (
      <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-orange-500/20 text-xs font-bold text-orange-600 dark:text-orange-400">
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
        <div key={q.label} className="workspace-glass-panel rounded-xl p-4">
          <p className="text-sm font-semibold text-primary mb-3">{q.label}</p>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Employer</span>
              </div>
              <span className="font-semibold tabular-nums">{q.employerTarget.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Employee</span>
              </div>
              <span className="font-semibold tabular-nums">{q.employeeTarget.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Finance</span>
              </div>
              <span className="font-semibold tabular-nums">{currency} {q.financeTarget.toLocaleString()}</span>
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
  title = "No targets found",
  description = "Assign annual targets to begin planning",
  action,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-16">
      <div className="rounded-2xl bg-muted/50 p-4">
        <Target className="h-8 w-8 text-muted-foreground/40" />
      </div>
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <p className="text-xs text-muted-foreground max-w-sm text-center">{description}</p>
      {action}
    </div>
  );
}
