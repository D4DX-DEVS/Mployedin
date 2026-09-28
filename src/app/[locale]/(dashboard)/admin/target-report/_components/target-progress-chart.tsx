"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { TrendingUp } from "lucide-react";
import { ReportCardHeader, ReportEmpty, reportCardClassName } from "@/components/features/admin/reports/ReportCard";
import { TrendLineChart } from "@/components/features/admin/reports/TrendLineChart";
import { formatCount } from "@/lib/ui/intlFormat";
import type { TargetMetric, TargetMonth } from "./types";

const METRICS: TargetMetric[] = ["employers", "employees", "finance"];
const METRIC_LABEL_KEYS: Record<TargetMetric, string> = {
  employers: "metricEmployers",
  employees: "metricEmployees",
  finance: "metricFinance",
};
const ACHIEVED_COLOR: Record<TargetMetric, string> = {
  employers: "#3b82f6",
  employees: "#8b5cf6",
  finance: "#d97706",
};
const TARGET_COLOR = "#94a3b8";

/**
 * Target against achieved per month, one metric at a time. The old chart drew
 * six lines at once — counts and thousands of dirhams on the same axis.
 */
export function TargetProgressChart({ monthly, year, currency, locale, className = "" }: {
  monthly: TargetMonth[];
  year: number;
  /** Main finance currency; null when no plan has a finance target. */
  currency: string | null;
  locale: string;
  className?: string;
}) {
  const t = useTranslations("adminTargetReport");
  const [metric, setMetric] = useState<TargetMetric>("employers");
  const points = monthly.map((point) => ({
    month: point.month,
    values: { target: point[metric].target, achieved: point[metric].achieved },
  }));
  const hasData = points.some((point) => point.values.target > 0 || point.values.achieved > 0);
  const formatTick = metric === "finance" && currency
    ? (value: number) => formatCount(value, { notation: "compact", maximumFractionDigits: 1 }, locale)
    : (value: number) => formatCount(Math.round(value), undefined, locale);
  const metricLabel = t(METRIC_LABEL_KEYS[metric]);

  return (
    <section className={`${reportCardClassName} ${className}`} aria-label={t("monthlyProgress")}>
      <ReportCardHeader
        title={t("monthlyProgress")}
        description={t("monthlyProgressDescription")}
        icon={TrendingUp}
        tone="workspace-tone-sky"
        action={(
          <div role="group" aria-label={t("metricSwitchLabel")} className="inline-flex gap-1 rounded-xl bg-secondary/60 p-1">
            {METRICS.map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={metric === key}
                onClick={() => setMetric(key)}
                className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition-colors ${
                  metric === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t(METRIC_LABEL_KEYS[key])}
              </button>
            ))}
          </div>
        )}
      />

      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs font-medium text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="h-0.5 w-4 border-t-2 border-dashed" style={{ borderColor: TARGET_COLOR }} /> {t("seriesTarget")}
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ACHIEVED_COLOR[metric] }} /> {t("seriesAchieved")}
        </span>
        {metric === "finance" && currency ? <span>{t("amountsIn", { currency })}</span> : null}
      </div>

      {hasData ? (
        <div className="mt-4 flex flex-1 items-center rounded-2xl border border-border/70 bg-secondary/30 p-3">
          <TrendLineChart
            series={[
              { key: "target", color: TARGET_COLOR, dashed: true },
              { key: "achieved", color: ACHIEVED_COLOR[metric] },
            ]}
            points={points}
            locale={locale}
            ariaLabel={t("chartAria", { metric: metricLabel, year })}
            formatTick={formatTick}
          />
        </div>
      ) : (
        <ReportEmpty>{t("noMonthlyData", { metric: metricLabel, year })}</ReportEmpty>
      )}
    </section>
  );
}
