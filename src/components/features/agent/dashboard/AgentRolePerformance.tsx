import { BriefcaseBusiness } from "lucide-react";
import { BarList, Panel, type BarListRow } from "@/components/shared/DashboardKit";
import { formatCount } from "@/lib/ui/intlFormat";
import type { AgentTranslator } from "./types";

export interface AgentRoleMetric {
  jobId: string;
  title: string;
  status: string;
  applications: number;
  interviews: number;
  offers: number;
  interviewRate: number;
  offerRate: number;
}

interface Props {
  rows: readonly AgentRoleMetric[];
  /** Portfolio-wide conversion, for the subtitle. */
  totals: { applications: number; interviewRate: number; offerRate: number };
  locale: string;
  t: AgentTranslator;
}

/**
 * The busiest live roles by applications, one bar each with how far those
 * applications got. Each bar opens the role.
 */
export function AgentRolePerformance({ rows, totals, locale, t }: Props) {
  const bars: BarListRow[] = rows.map((row) => ({
    key: row.jobId,
    label: row.title,
    value: row.applications,
    valueLabel: formatCount(row.applications),
    note: t("rolePerformance.flow", { interviews: row.interviews, offers: row.offers }),
    href: `/${locale}/agent/jobs/${row.jobId}`,
  }));
  return (
    <Panel
      id="agent-role-performance"
      icon={BriefcaseBusiness}
      title={t("rolePerformance.title")}
      subtitle={
        totals.applications > 0
          ? t("rolePerformance.rates", { interviewRate: totals.interviewRate, offerRate: totals.offerRate })
          : t("rolePerformance.description")
      }
      action={{ href: `/${locale}/agent/jobs`, label: t("rolePerformance.reviewAll") }}
    >
      {bars.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
          <p className="text-sm font-medium text-foreground">{t("rolePerformance.emptyTitle")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("rolePerformance.emptyDescription")}</p>
        </div>
      ) : (
        <BarList rows={bars} />
      )}
    </Panel>
  );
}
