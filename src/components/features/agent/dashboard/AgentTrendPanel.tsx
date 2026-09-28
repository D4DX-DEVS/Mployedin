import { Activity } from "lucide-react";
import { Panel, TrendChart, type TrendPoint, type TrendSeries } from "@/components/shared/DashboardKit";
import type { AgentDailyTrend } from "@/lib/agents/dashboardShapes";
import type { AgentTranslator } from "./types";

interface Props {
  daily: readonly AgentDailyTrend[];
  days: number;
  locale: string;
  t: AgentTranslator;
}

/** Leads created, applications received and placements made per day, on one axis. */
export function AgentTrendPanel({ daily, days, locale, t }: Props) {
  const fmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-u-nu-latn" : "en-GB", { day: "numeric", month: "short" });
  const points: TrendPoint[] = daily.map((d) => ({
    label: fmt.format(new Date(d.day)),
    leads: d.leads,
    applications: d.applications,
    placements: d.placements,
  }));
  const series: TrendSeries[] = [
    { key: "leads", label: t("trends.leads") },
    { key: "applications", label: t("trends.applications") },
    { key: "placements", label: t("trends.placements") },
  ];
  return (
    <Panel
      id="agent-trend"
      icon={Activity}
      title={t("trends.title")}
      subtitle={t("trends.subtitle", { days })}
      action={{ href: `/${locale}/agent/reports`, label: t("trends.viewReports") }}
    >
      <TrendChart series={series} points={points} emptyLabel={t("trends.empty")} height={250} />
    </Panel>
  );
}
