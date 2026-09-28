import { Users2 } from "lucide-react";
import { DonutChart, Panel, STATUS_COLOR, type DonutSlice } from "@/components/shared/DashboardKit";
import type { SuperAgentTeamSplit } from "@/lib/superAgent/dashboardData";
import { formatCount } from "@/lib/ui/intlFormat";
import type { SuperAgentHref, SuperAgentTranslator } from "./types";

interface Props {
  team: SuperAgentTeamSplit;
  href: SuperAgentHref;
  t: SuperAgentTranslator;
}

/** The roster as three states — working, idle, deactivated — each opening the roster filtered to it. */
export function TeamSplitPanel({ team, href, t }: Props) {
  const slices: DonutSlice[] = [
    { key: "engaged", label: t("team.engaged"), value: team.engaged, color: STATUS_COLOR.good, href: href("/agents?status=active") },
    { key: "idle", label: t("team.idle"), value: team.idle, color: STATUS_COLOR.warning, href: href("/agents?performance=no_activity") },
    { key: "inactive", label: t("team.inactive"), value: team.inactive, color: STATUS_COLOR.critical, href: href("/agents?status=inactive") },
  ];
  return (
    <Panel
      id="super-agent-team-split"
      icon={Users2}
      title={t("team.title")}
      subtitle={t("team.description")}
      action={{ href: href("/agents"), label: t("team.viewRoster") }}
    >
      <DonutChart slices={slices} total={formatCount(team.total)} totalLabel={t("team.totalLabel")} emptyLabel={t("team.empty")} />
    </Panel>
  );
}
