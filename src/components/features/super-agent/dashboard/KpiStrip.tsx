import { KpiTile, type KpiDirection } from "@/components/shared/DashboardKit";
import { formatCurrency } from "@/lib/currency";
import type { DailyActivity, SuperAgentCommissions, SuperAgentKpis } from "@/lib/superAgent/dashboardData";
import { formatCount } from "@/lib/ui/intlFormat";
import type { SuperAgentHref, SuperAgentTranslator } from "./types";

interface Delta {
  text?: string;
  direction: KpiDirection;
  label: string;
}

/**
 * This period against the one before it. A percentage when there is a base to
 * compare with, the raw count when the previous period was empty, and no pill
 * at all when both are zero — a "+0%" says nothing.
 */
export function periodDelta(current: number, previous: number, label: string, noChangeLabel: string): Delta {
  if (current === previous) return { direction: "flat", label: noChangeLabel, text: previous === 0 ? undefined : "0%" };
  if (previous === 0) return { direction: "up", text: `+${formatCount(current)}`, label };
  const pct = Math.round(((current - previous) / previous) * 100);
  return { direction: pct > 0 ? "up" : "down", text: `${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`, label };
}

interface Props {
  kpis: SuperAgentKpis;
  daily: readonly DailyActivity[];
  commissions: SuperAgentCommissions;
  href: SuperAgentHref;
  t: SuperAgentTranslator;
}

/** Six headline figures, each with its 30-day sparkline and its movement against the previous period. */
export function SuperAgentKpiStrip({ kpis, daily, commissions, href, t }: Props) {
  const spark = (field: keyof Omit<DailyActivity, "day">) => daily.map((d) => d[field]);
  const month = (current: number, previous: number) =>
    periodDelta(current, previous, t("kpi.vsLastMonth", { current, previous }), t("kpi.noChangeMonth"));
  const agents = month(kpis.newAgentsThisMonth, kpis.newAgentsLastMonth);
  const employers = month(kpis.newEmployersThisMonth, kpis.newEmployersLastMonth);
  const jobs = month(kpis.jobsPostedThisMonth, kpis.jobsPostedLastMonth);
  const placements = periodDelta(
    kpis.placementsLast30Days,
    kpis.placementsPrevious30Days,
    t("kpi.vsPrevious30", { current: kpis.placementsLast30Days, previous: kpis.placementsPrevious30Days }),
    t("kpi.noChange30"),
  );
  const { currency } = commissions;
  const money = (amount: number) => formatCurrency(amount, currency, "code");
  const paid = periodDelta(
    commissions.paidThisMonth.amount,
    commissions.paidLastMonth.amount,
    t("kpi.vsLastMonthPaid", { current: money(commissions.paidThisMonth.amount), previous: money(commissions.paidLastMonth.amount) }),
    t("kpi.noChangeMonth"),
  );

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" data-kpi-strip>
      <KpiTile
        label={t("kpis.activeAgents.label")}
        value={formatCount(kpis.activeAgents)}
        hint={t("kpi.addedThisMonth", { count: kpis.newAgentsThisMonth })}
        delta={agents.text}
        deltaDirection={agents.direction}
        deltaLabel={agents.label}
        spark={spark("agents")}
        icon="agents"
        href={href("/agents?status=active")}
      />
      <KpiTile
        label={t("kpi.employersInRegion")}
        value={formatCount(kpis.employers)}
        hint={t("kpi.addedThisMonth", { count: kpis.newEmployersThisMonth })}
        delta={employers.text}
        deltaDirection={employers.direction}
        deltaLabel={employers.label}
        spark={spark("employers")}
        icon="companies"
        href={href("/employers")}
      />
      <KpiTile
        label={t("kpi.liveRoles")}
        value={formatCount(kpis.activeJobs)}
        hint={t("kpiDelta.postedThisMonth", { count: kpis.jobsPostedThisMonth })}
        delta={jobs.text}
        deltaDirection={jobs.direction}
        deltaLabel={jobs.label}
        spark={spark("jobs")}
        icon="jobs"
        href={href("/jobs?status=active")}
      />
      <KpiTile
        label={t("kpi.placements30d")}
        value={formatCount(kpis.placementsLast30Days)}
        hint={t("kpi.previous30", { count: kpis.placementsPrevious30Days })}
        delta={placements.text}
        deltaDirection={placements.direction}
        deltaLabel={placements.label}
        spark={spark("placements")}
        icon="placements"
        href={href("/placements")}
      />
      <KpiTile
        label={t("kpi.commissionPending")}
        value={money(commissions.pending.amount)}
        hint={t("kpi.awaitingApproval", { count: commissions.pending.count })}
        spark={commissions.daily.map((d) => d.pending)}
        icon="revenue"
        href={href("/commissions?status=pending")}
        color="#eda100"
      />
      <KpiTile
        label={t("kpi.commissionPaidMonth")}
        value={money(commissions.paidThisMonth.amount)}
        hint={t("kpi.paidCount", { count: commissions.paidThisMonth.count })}
        delta={paid.text}
        deltaDirection={paid.direction}
        deltaLabel={paid.label}
        spark={commissions.daily.map((d) => d.paid)}
        icon="revenue"
        href={href("/commissions?status=paid")}
        color="#1baf7a"
      />
    </div>
  );
}
