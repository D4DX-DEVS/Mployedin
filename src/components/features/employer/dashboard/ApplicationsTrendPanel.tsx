import { useTranslations } from "next-intl";
import { Activity } from "lucide-react";
import { Panel, TrendChart, type TrendPoint, type TrendSeries } from "@/components/shared/DashboardKit";
import type { EmployerDailyPoint } from "@/lib/dashboard/employerStats";

interface Props {
  daily: readonly EmployerDailyPoint[];
  days: number;
  locale: string;
}

/** Applications received and interviews scheduled per day of the window, on one axis. */
export function ApplicationsTrendPanel({ daily, days, locale }: Props) {
  const t = useTranslations("employerDashboard.overview.trend");
  const fmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-u-nu-latn" : "en-GB", { day: "numeric", month: "short" });
  const points: TrendPoint[] = daily.map((d) => ({
    label: fmt.format(new Date(d.day)),
    applications: d.applications,
    interviews: d.interviews,
  }));
  const series: TrendSeries[] = [
    { key: "applications", label: t("applications") },
    { key: "interviews", label: t("interviews") },
  ];
  const total = daily.reduce((sum, d) => sum + d.applications, 0);

  return (
    <Panel
      id="employer-trend"
      icon={Activity}
      title={t("title")}
      subtitle={t("subtitle", { count: total, days })}
      action={{ href: `/${locale}/employer/analytics`, label: t("viewAnalytics") }}
    >
      <TrendChart series={series} points={points} emptyLabel={t("empty")} height={250} />
    </Panel>
  );
}
