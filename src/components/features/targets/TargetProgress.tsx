"use client";

import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowDownRight, ArrowUpRight, CheckCircle2, Clock, Gauge, Hourglass, Minus, TrendingUp, Target as TargetIcon } from "lucide-react";
import type { CompletionStatus, Growth, TargetInsights } from "@/lib/targets/insights";
import type { ReportPeriod, TargetReport } from "@/lib/targets/profitReport";
import type { PeriodType } from "@/lib/targets/schedule";
import { cn } from "@/lib/utils";
import { PACE_CHIP } from "./pace";
import { usePeriodNamer } from "./periodLabels";
import { formatProfit } from "./profitFormat";

/** Everything the headline needs to draw one target, whether it came from the list or from a full report. */
export interface HeadlineData {
  year: number;
  currency: string;
  profitTarget: number;
  profitAchieved: number;
  profitProgress: number;
  expectedProgress: number;
  periodType: PeriodType;
  periods: ReportPeriod[];
  insights: TargetInsights;
}

export function headlineOfReport(report: TargetReport): HeadlineData {
  return {
    year: report.year,
    currency: report.currency,
    profitTarget: report.summary.profitTarget,
    profitAchieved: report.summary.profitAchieved,
    profitProgress: report.summary.profitProgress,
    expectedProgress: report.summary.expectedProgress,
    periodType: report.schedule.periodType,
    periods: report.schedule.periods,
    insights: report.summary.insights,
  };
}

/* Status never by colour alone: every chip carries its word. */
const STATUS_CHIP: Record<CompletionStatus, string> = {
  ...PACE_CHIP,
  notStarted: "border-border bg-secondary/60 text-muted-foreground",
};

const STATUS_LABEL: Record<CompletionStatus, string> = {
  achieved: "paceAchieved",
  onPace: "paceOnPace",
  behind: "paceBehind",
  notStarted: "paceNotStarted",
};

const STATUS_ICON = {
  achieved: CheckCircle2,
  onPace: Gauge,
  behind: Clock,
  notStarted: Hourglass,
} as const;

const BAR_TONE: Record<CompletionStatus, string> = {
  achieved: "bg-emerald-500",
  onPace: "bg-sky-500",
  behind: "bg-rose-500",
  notStarted: "bg-slate-400",
};

const chipClassName = "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold";

/** Where the target stands: achieved, on pace, behind, or not started. */
export function CompletionStatusChip({ status }: { status: CompletionStatus }) {
  const t = useTranslations("profitReport");
  const Icon = STATUS_ICON[status];
  return (
    <span className={cn(chipClassName, STATUS_CHIP[status])}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {t(STATUS_LABEL[status])}
    </span>
  );
}

/** Profit against the year before: up, down, flat, or "new" when there was nothing to compare with. */
export function GrowthChip({ growth, comparedYear }: { growth: Growth; comparedYear: number }) {
  const t = useTranslations("profitReport");
  if (growth.pct === null) {
    return (
      <span className={cn(chipClassName, growth.trend === "new" ? PACE_CHIP.achieved : "border-border bg-secondary/60 text-muted-foreground")}>
        {growth.trend === "new" ? <TrendingUp className="h-3.5 w-3.5" aria-hidden /> : <Minus className="h-3.5 w-3.5" aria-hidden />}
        {t(growth.trend === "new" ? "growthNew" : "growthNone", { year: comparedYear })}
      </span>
    );
  }
  const Icon = growth.trend === "up" ? ArrowUpRight : growth.trend === "down" ? ArrowDownRight : Minus;
  const sign = growth.pct > 0 ? "+" : growth.pct < 0 ? "−" : "";
  return (
    <span className={cn(chipClassName, growth.trend === "up" ? PACE_CHIP.achieved : growth.trend === "down" ? PACE_CHIP.behind : "border-border bg-secondary/60 text-muted-foreground")}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {t("growthVsYear", { percent: `${sign}${Math.abs(growth.pct)}`, year: comparedYear })}
    </span>
  );
}

/**
 * The target bar: profit achieved against the target, with a tick where the
 * schedule says the profit should be by now, so the gap reads at a glance.
 */
export function TargetBar({ data, className }: { data: HeadlineData; className?: string }) {
  const t = useTranslations("profitReport");
  const locale = useLocale();
  const money = (value: number) => formatProfit(value, data.currency, locale);
  const { insights, expectedProgress, profitProgress } = data;
  const hasTarget = data.profitTarget > 0;
  const showMarker = hasTarget && expectedProgress > 0 && expectedProgress < 100;

  return (
    <div className={className}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className="tabular-nums">
          <span className="text-lg font-semibold text-foreground">{money(data.profitAchieved)}</span>
          {hasTarget ? <span className="text-sm text-muted-foreground"> {t("ofTarget", { target: money(data.profitTarget) })}</span> : null}
        </p>
        <p className="text-lg font-semibold tabular-nums text-foreground">{hasTarget ? `${profitProgress}%` : "—"}</p>
      </div>
      <div
        role="progressbar"
        aria-label={t("barAria")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, profitProgress)}
        className="relative mt-2 h-3 rounded-full bg-secondary"
      >
        <span
          className={cn("block h-full rounded-full transition-all duration-500", BAR_TONE[insights.status])}
          style={{ width: `${Math.min(100, profitProgress)}%` }}
        />
        {showMarker ? (
          <span
            className="absolute -top-1 h-5 w-0.5 rounded bg-foreground/60"
            style={{ insetInlineStart: `${expectedProgress}%` }}
            title={t("expectedMarker", { percent: expectedProgress })}
          />
        ) : null}
      </div>
      {showMarker ? <p className="mt-1.5 text-xs text-muted-foreground">{t("expectedMarker", { percent: expectedProgress })}</p> : null}
    </div>
  );
}

function periodTone(period: ReportPeriod): string {
  if (period.status === "current") return "bg-sky-500";
  return period.profitProgress >= 100 ? "bg-emerald-500" : "bg-rose-500";
}

/** One slim bar per period of the schedule: how far each got against its own target. */
export function PeriodBars({ data, className }: { data: HeadlineData; className?: string }) {
  const t = useTranslations("profitReport");
  const namePeriod = usePeriodNamer();
  if (data.periods.length < 2) return null;

  return (
    <div className={className}>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {t("periodBarsTitle", { type: t(`period_${data.periodType}`).toLowerCase(), count: data.periods.length })}
      </p>
      <ul role="img" aria-label={t("periodBarsAria")} className="flex h-10 items-stretch gap-0.5">
        {data.periods.map((period, index) => (
          <li
            key={`${period.startDate}-${index}`}
            className="flex min-w-[3px] flex-1 items-end overflow-hidden rounded-sm bg-secondary"
            title={`${namePeriod(period, data.periodType, index, data.year)} · ${period.profitTarget > 0 ? `${period.profitProgress}%` : "—"}`}
          >
            {period.status === "upcoming" || period.profitAchieved <= 0 ? null : (
              <span className={cn("block w-full rounded-sm", periodTone(period))} style={{ height: `${Math.max(8, Math.min(100, period.profitProgress))}%` }} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Tile({ label, children, detail }: { label: string; children: ReactNode; detail?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-secondary/30 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">{children}</div>
      {detail ? <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

/** What is left, where it is heading, how long there is, and how the latest period went. */
export function TargetInsightTiles({ data, className }: { data: HeadlineData; className?: string }) {
  const t = useTranslations("profitReport");
  const locale = useLocale();
  const money = (value: number) => formatProfit(value, data.currency, locale);
  const { insights } = data;
  const { timeline, forecast, momentum } = insights;
  const hasTarget = data.profitTarget > 0;
  const elapsedPct = timeline && timeline.daysTotal > 0 ? Math.round((timeline.daysElapsed / timeline.daysTotal) * 100) : 0;

  return (
    <dl className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-4", className)}>
      <Tile
        label={t("tileRemaining")}
        detail={hasTarget ? t("tileRemainingDetail", { target: money(data.profitTarget) }) : t("kpiProfitNoTarget")}
      >
        {!hasTarget ? "—" : insights.remaining > 0 ? money(insights.remaining) : t("tileRemainingDone")}
      </Tile>

      <Tile
        label={t("tileForecast")}
        detail={
          forecast
            ? t("tileForecastDetail", { percent: forecast.progress })
            : insights.status === "notStarted"
              ? t("tileForecastNotStarted")
              : t("tileForecastEarly")
        }
      >
        {forecast ? money(forecast.profit) : "—"}
      </Tile>

      <Tile
        label={t("tileTime")}
        detail={timeline && timeline.daysToStart === 0 ? t("tileTimeElapsed", { percent: elapsedPct }) : undefined}
      >
        {!timeline
          ? "—"
          : timeline.daysToStart > 0
            ? t("tileTimeStarts", { count: timeline.daysToStart })
            : timeline.daysLeft > 0
              ? t("tileTimeLeft", { count: timeline.daysLeft })
              : t("tileTimeEnded")}
      </Tile>

      <Tile
        label={t("tileMomentum")}
        detail={momentum ? t("tileMomentumDetail", { amount: money(momentum.latest) }) : t("tileMomentumNone")}
      >
        {momentum?.pct != null
          ? `${momentum.pct > 0 ? "+" : momentum.pct < 0 ? "−" : ""}${Math.abs(momentum.pct)}%`
          : momentum?.trend === "new"
            ? t("growthNewShort")
            : "—"}
      </Tile>
    </dl>
  );
}

/**
 * One target at a glance: its completion status, growth, the target bar and the
 * bars of its periods. `full` adds the insight tiles underneath.
 */
export function TargetHeadline({ data, variant = "full", className }: { data: HeadlineData; variant?: "compact" | "full"; className?: string }) {
  const t = useTranslations("profitReport");
  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <CompletionStatusChip status={data.insights.status} />
        <GrowthChip growth={data.insights.yearOverYear} comparedYear={data.year - 1} />
        <span className={cn(chipClassName, "border-border bg-secondary/60 text-muted-foreground")}>
          <TargetIcon className="h-3.5 w-3.5" aria-hidden />
          {t(`period_${data.periodType}`)}
          {data.periods.length > 1 ? ` · ${data.periods.length}` : ""}
        </span>
      </div>
      <TargetBar data={data} />
      <PeriodBars data={data} />
      {variant === "full" ? <TargetInsightTiles data={data} /> : null}
    </div>
  );
}
