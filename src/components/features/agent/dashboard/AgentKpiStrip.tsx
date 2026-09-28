import { KpiTile, type KpiDirection } from "@/components/shared/DashboardKit";
import type { AgentActivityTrend, AgentDailyTrend } from "@/lib/agents/dashboardShapes";
import { formatCurrency } from "@/lib/currency";
import { formatCount } from "@/lib/ui/intlFormat";
import type { AgentTranslator } from "./types";

export interface AgentKpiData {
  /** Employers an admin assigned to this agent. */
  employerCount: number;
  activeJobs: number;
  /** Every role ever posted in the portfolio, any status. */
  vacanciesPosted: number;
  /** Placements across the whole portfolio, all time. */
  placementsTotal: number;
  trend: AgentActivityTrend;
  commission: { amount: number; currency: string; href: string };
}

interface Props {
  data: AgentKpiData;
  locale: string;
  t: AgentTranslator;
}

/** "+34%" / "−2" for the pill, and the sentence a screen reader gets instead. */
function delta(current: number, previous: number, days: number, t: AgentTranslator) {
  if (previous === 0) {
    return current === 0
      ? { text: undefined, direction: "flat" as KpiDirection, label: t("kpi.changeNone") }
      : { text: undefined, direction: "up" as KpiDirection, label: t("kpi.changeNew", { days }) };
  }
  const diff = current - previous;
  const direction: KpiDirection = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
  // Small baselines read better as counts: "+3" rather than "+300%".
  const asPercent = previous >= 10;
  const value = asPercent ? Math.round((Math.abs(diff) / previous) * 100) : Math.abs(diff);
  const text = diff === 0 ? undefined : `${direction === "down" ? "−" : "+"}${value}${asPercent ? "%" : ""}`;
  const label = diff === 0 ? t("kpi.changeFlat", { days }) : t(asPercent ? "kpi.changePercent" : "kpi.changeCount", { value, direction, days });
  return { text, direction, label };
}

/**
 * Six headline numbers: the size of the book, what is live, and what moved in
 * the last 30 days with a sparkline each. Every tile opens the list it counts.
 */
export function AgentKpiStrip({ data, locale, t }: Props) {
  const { trend } = data;
  const { days } = trend;
  const spark = (field: keyof AgentDailyTrend) => trend.daily.map((d) => Number(d[field]));
  const p = (path: string) => `/${locale}${path}`;

  const applications = delta(trend.current.applications, trend.previous.applications, days, t);
  const interviews = delta(trend.current.interviews, trend.previous.interviews, days, t);
  const placements = delta(trend.current.placements, trend.previous.placements, days, t);
  const roles = delta(trend.current.jobs, trend.previous.jobs, days, t);

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" data-kpi-strip>
      <KpiTile
        label={t("overview.activeAccounts")}
        value={formatCount(data.employerCount)}
        hint={t("kpi.assignedToYou")}
        icon="companies"
        href={p("/agent/employers")}
      />
      <KpiTile
        label={t("overview.liveRoles")}
        value={formatCount(data.activeJobs)}
        hint={t("kpi.ofPosted", { count: data.vacanciesPosted })}
        delta={roles.text}
        deltaDirection={roles.direction}
        deltaLabel={roles.label}
        spark={spark("jobs")}
        icon="jobs"
        href={p("/agent/jobs?status=active")}
      />
      <KpiTile
        label={t("kpi.candidatesSourced")}
        value={formatCount(trend.current.applications)}
        hint={t("kpi.lastDays", { days })}
        delta={applications.text}
        deltaDirection={applications.direction}
        deltaLabel={applications.label}
        spark={spark("applications")}
        icon="applications"
        href={p("/agent/candidates")}
      />
      <KpiTile
        label={t("kpi.interviewsArranged")}
        value={formatCount(trend.current.interviews)}
        hint={t("kpi.lastDays", { days })}
        delta={interviews.text}
        deltaDirection={interviews.direction}
        deltaLabel={interviews.label}
        spark={spark("interviews")}
        icon="interviews"
        href={p("/agent/interviews")}
      />
      <KpiTile
        label={t("kpi.placements")}
        value={formatCount(trend.current.placements)}
        hint={t("kpi.allTime", { count: data.placementsTotal })}
        delta={placements.text}
        deltaDirection={placements.direction}
        deltaLabel={placements.label}
        spark={spark("placements")}
        icon="placements"
        href={p("/agent/placements")}
      />
      <KpiTile
        label={t("overview.commissionThisMonth")}
        value={formatCurrency(data.commission.amount, data.commission.currency)}
        hint={t("kpi.commissionHint")}
        icon="revenue"
        href={data.commission.href}
        color="#1baf7a"
      />
    </div>
  );
}
