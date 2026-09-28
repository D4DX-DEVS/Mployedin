"use client";

import { useTranslations } from "next-intl";
import { TrendingUp } from "lucide-react";
import { ReportCardHeader, ReportEmpty, reportCardClassName } from "@/components/features/admin/reports/ReportCard";
import { TrendLineChart } from "@/components/features/admin/reports/TrendLineChart";

const SERIES = [
  { key: "started", color: "#3b82f6" },
  { key: "lost", color: "#e11d48" },
];

/**
 * New subscriptions against cancelled or expired ones, per month. The old
 * "Revenue trend (MRR)" charted the price of subscriptions by the month they
 * last renewed, which is neither MRR nor a trend.
 */
export function StartedLostChart({ activity, locale, className = "" }: {
  activity: { month: string; started: number; lost: number }[];
  locale: string;
  className?: string;
}) {
  const t = useTranslations("adminSubscriptionDashboard");

  return (
    <section className={`${reportCardClassName} ${className}`} aria-label={t("startedAndLost")}>
      <ReportCardHeader title={t("startedAndLost")} description={t("startedAndLostDescription")} icon={TrendingUp} tone="workspace-tone-sky" />

      <div className="mt-4 flex items-center gap-4 text-xs font-medium text-muted-foreground">
        <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> {t("seriesStarted")}</span>
        <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-rose-600" /> {t("seriesLost")}</span>
      </div>

      {activity.some((point) => point.started > 0 || point.lost > 0) ? (
        <div className="mt-4 flex flex-1 items-center rounded-2xl border border-border/70 bg-secondary/30 p-3">
          <TrendLineChart
            series={SERIES}
            points={activity.map((point) => ({ month: point.month, values: { started: point.started, lost: point.lost } }))}
            locale={locale}
            ariaLabel={t("startedAndLostChartAria")}
          />
        </div>
      ) : (
        <ReportEmpty>{t("noActivity")}</ReportEmpty>
      )}
    </section>
  );
}
