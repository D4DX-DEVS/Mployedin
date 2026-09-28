import { Activity } from "lucide-react";
import { Panel, TrendChart, type TrendPoint } from "@/components/shared/DashboardKit";
import type { DailyTrend } from "@/lib/admin/dashboard/trends.server";
import type { DashboardTranslator } from "./types";

interface Props {
  daily: readonly DailyTrend[];
  show: { users: boolean; jobs: boolean; applications: boolean };
  days: number;
  locale: string;
  t: DashboardTranslator;
}

/** Daily sign-ups, jobs and applications over the period on one axis. */
export function ActivityTrendPanel({ daily, show, days, locale, t }: Props) {
  const fmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-u-nu-latn" : "en-GB", { day: "numeric", month: "short" });
  const points: TrendPoint[] = daily.map((d) => ({
    label: fmt.format(new Date(d.day)),
    users: d.users,
    jobs: d.jobs,
    applications: d.applications,
  }));
  const series = [
    show.users && { key: "users", label: t("trends.users") },
    show.jobs && { key: "jobs", label: t("trends.jobs") },
    show.applications && { key: "applications", label: t("trends.applications") },
  ].filter(Boolean) as { key: string; label: string }[];

  return (
    <Panel id="admin-trend" icon={Activity} title={t("trends.title")} subtitle={t("trends.description", { days })} action={{ href: `/${locale}/admin/analytics`, label: t("snapshot.viewAnalytics") }}>
      <TrendChart series={series} points={points} emptyLabel={t("trends.empty")} height={250} />
    </Panel>
  );
}
