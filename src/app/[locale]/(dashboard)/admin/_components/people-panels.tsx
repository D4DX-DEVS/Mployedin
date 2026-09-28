import { Building2, Handshake, Users } from "lucide-react";
import { DonutChart, Panel, StatRows, type DonutSlice, type StatRow } from "@/components/shared/DashboardKit";
import type { PeopleOverview } from "@/lib/admin/dashboard/types";
import { formatCount } from "@/lib/ui/intlFormat";
import type { DashboardTranslator } from "./types";

const ROLE_KEYS: Record<string, string> = { job_seeker: "jobSeeker", employer: "employer", agent: "agent", super_agent: "superAgent", other: "other" };

interface Props {
  data: PeopleOverview;
  showRoles: boolean;
  days: number;
  locale: string;
  t: DashboardTranslator;
}

export function UsersByRolePanel({ data, locale, t }: Props) {
  const total = data.usersByRole.reduce((sum, row) => sum + row.count, 0);
  const slices: DonutSlice[] = data.usersByRole.map((row) => ({
    key: row.role,
    label: t(`roles.${ROLE_KEYS[row.role] ?? "unknown"}`),
    value: row.count,
    href: row.role === "other" ? undefined : `/${locale}/admin/users?role=${row.role}`,
  }));
  return (
    <Panel id="admin-users-by-role" icon={Users} title={t("people.usersByRole")} subtitle={t("people.usersByRoleSubtitle", { count: total })} action={{ href: `/${locale}/admin/users`, label: t("people.viewUsers") }}>
      <DonutChart slices={slices} totalLabel={t("kpi.total")} emptyLabel={t("people.empty")} />
    </Panel>
  );
}

export function EmployerHealthPanel({ data, days, locale, t }: Props) {
  const e = data.employers;
  if (!e) return null;
  const rows: StatRow[] = [
    { key: "active", label: t("employers.active"), value: formatCount(e.accountsActive7d), tone: "good" },
    { key: "inactive", label: t("employers.inactive"), value: formatCount(e.accountsInactive7d), tone: "warning" },
    { key: "new", label: t("employers.newCompanies", { days }), value: formatCount(e.newCompaniesInPeriod), tone: "info" },
    { key: "noJob", label: t("employers.noActiveJob"), value: formatCount(e.withoutActiveJob), tone: "neutral" },
    { key: "noApps", label: t("employers.noApplications"), value: formatCount(e.activeJobsButNoApplications), tone: "warning" },
  ];
  return (
    <Panel id="admin-employers" icon={Building2} title={t("employers.title")} subtitle={t("employers.subtitle", { companies: e.companies, accounts: e.accounts })} action={{ href: `/${locale}/admin/employers`, label: t("employers.viewEmployers") }}>
      <StatRows rows={rows} />
    </Panel>
  );
}

export function AgentOpsPanel({ data, days, locale, t }: Props) {
  const a = data.agents;
  if (!a) return null;
  const targets = a.targets.behind + a.targets.onPace + a.targets.achieved;
  const rows: StatRow[] = [
    { key: "signedIn", label: t("agents.signedIn"), value: formatCount(a.signedInThisWeek), tone: "good" },
    { key: "noActivity", label: t("agents.noActivity"), value: formatCount(a.notSignedInThisWeek), tone: "warning" },
    { key: "sourced", label: t("agents.candidatesSourced", { days }), value: formatCount(a.candidatesSourced), tone: "info" },
    { key: "interviews", label: t("agents.interviewsArranged", { days }), value: formatCount(a.interviewsArranged), tone: "info" },
    { key: "placements", label: t("agents.placements", { days }), value: formatCount(a.placements), tone: "good" },
    ...(targets > 0
      ? [
          { key: "behind", label: t("agents.pace.behindLabel"), value: formatCount(a.targets.behind), tone: "critical" as const, href: `/${locale}/admin/target-report` },
          { key: "achieved", label: t("agents.pace.achievedLabel"), value: formatCount(a.targets.achieved), tone: "good" as const, href: `/${locale}/admin/target-report` },
        ]
      : []),
  ];
  return (
    <Panel id="admin-agents" icon={Handshake} title={t("agents.title")} subtitle={t("agents.subtitle", { count: a.activeAgents })} action={{ href: `/${locale}/admin/agents`, label: t("agents.viewAgents") }}>
      <StatRows rows={rows} />
    </Panel>
  );
}
