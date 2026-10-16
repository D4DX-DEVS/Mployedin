"use client";

import { useTranslations } from "next-intl";
import { TrendingUp } from "lucide-react";
import { ReportCardHeader, ReportEmpty, reportCardClassName } from "@/components/features/admin/reports/ReportCard";
import { TrendLineChart } from "@/components/features/admin/reports/TrendLineChart";
import { formatProfit } from "@/components/features/targets/profitFormat";
import type { TargetMonth } from "./types";

const ACHIEVED_COLOR = "#059669";
const TARGET_COLOR = "#94a3b8";

/** Profit target against profit achieved per month, in the one currency the totals are in. */
export function TargetProgressChart({ monthly, year, currency, locale, className = "" }: {
  monthly: TargetMonth[];
  year: number;
  /** Main currency; null when no plan has a target. */
  currency: string | null;
  locale: string;
  className?: string;
}) {
  const t = useTranslations("adminTargetReport");
  const points = monthly.map((point) => ({
    month: point.month,
    values: { target: point.target, achieved: point.achieved },
  }));
  const hasData = points.some((point) => point.values.target > 0 || point.values.achieved > 0);

  return (
    <section className={`${reportCardClassName} ${className}`} aria-label={t("monthlyProgress")}>
      <ReportCardHeader
        title={t("monthlyProgress")}
        description={t("monthlyProgressDescription")}
        icon={TrendingUp}
        tone="workspace-tone-sky"
      />

      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs font-medium text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="h-0.5 w-4 border-t-2 border-dashed" style={{ borderColor: TARGET_COLOR }} /> {t("seriesTarget")}
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ACHIEVED_COLOR }} /> {t("seriesProfit")}
        </span>
        {currency ? <span>{t("amountsIn", { currency })}</span> : null}
      </div>

      {hasData ? (
        <div className="mt-4 flex flex-1 items-center rounded-2xl border border-border/70 bg-secondary/30 p-3">
          <TrendLineChart
            series={[
              { key: "target", color: TARGET_COLOR, dashed: true },
              { key: "achieved", color: ACHIEVED_COLOR },
            ]}
            points={points}
            locale={locale}
            ariaLabel={t("chartAria", { year })}
            formatTick={(value) => formatProfit(value, null, locale, "compact")}
          />
        </div>
      ) : (
        <ReportEmpty>{t("noMonthlyData", { year })}</ReportEmpty>
      )}
    </section>
  );
}
