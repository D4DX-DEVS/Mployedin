import { Activity } from "lucide-react";
import { Panel, TrendChart, type TrendPoint } from "@/components/shared/DashboardKit";
import type { ActivityMonth } from "@/lib/superAgent/dashboardData";
import type { SuperAgentHref, SuperAgentTranslator } from "./types";

interface Props {
  activity: readonly ActivityMonth[];
  locale: string;
  href: SuperAgentHref;
  t: SuperAgentTranslator;
}

/** Leads, jobs posted and applications per month across the team, on one axis. */
export function ActivityTrendPanel({ activity, locale, href, t }: Props) {
  const monthLabel = new Intl.DateTimeFormat(locale === "ar" ? "ar-u-nu-latn" : locale, { month: "short", timeZone: "UTC" });
  const points: TrendPoint[] = activity.map((m) => {
    const [y, mo] = m.month.split("-").map(Number);
    return { label: monthLabel.format(new Date(Date.UTC(y, mo - 1, 1))), leads: m.leads, jobs: m.jobs, applications: m.applications };
  });
  const series = [
    { key: "leads", label: t("funnel.leads") },
    { key: "jobs", label: t("funnel.jobs") },
    { key: "applications", label: t("funnel.applications") },
  ];
  return (
    <Panel
      id="super-agent-activity"
      icon={Activity}
      title={t("activity.title")}
      subtitle={t("activity.description")}
      action={{ href: href("/reports"), label: t("activity.viewReports") }}
    >
      <TrendChart series={series} points={points} emptyLabel={t("activity.emptyTitle")} height={250} />
    </Panel>
  );
}
