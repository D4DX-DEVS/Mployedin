import { CalendarDays, CheckCircle2, ClipboardList, Goal, PlayCircle, RotateCcw } from "lucide-react";
import { Panel, StatRows, type StatRow } from "@/components/shared/DashboardKit";
import type { SuperAgentExhibitions, SuperAgentTargets } from "@/lib/superAgent/dashboardData";
import { formatCount } from "@/lib/ui/intlFormat";
import type { SuperAgentHref, SuperAgentTranslator } from "./types";

interface Props {
  exhibitions: SuperAgentExhibitions;
  targets: SuperAgentTargets;
  href: SuperAgentHref;
  t: SuperAgentTranslator;
}

/** Exhibition requests by workflow stage, and how much of the team has a target for the year. */
export function ExhibitionsPanel({ exhibitions, targets, href, t }: Props) {
  const missing = targets.agentsTotal - targets.agentsWithTarget;
  const rows: StatRow[] = [
    { key: "awaitingReview", label: t("exhibitions.awaitingReview"), value: formatCount(exhibitions.awaitingReview), tone: exhibitions.awaitingReview > 0 ? "warning" : "neutral", icon: ClipboardList, href: href("/exhibitions?status=pending_review") },
    { key: "revisionRequested", label: t("exhibitions.revisionRequested"), value: formatCount(exhibitions.revisionRequested), tone: "neutral", icon: RotateCcw, href: href("/exhibitions?status=revision_requested") },
    { key: "approved", label: t("exhibitions.approved"), value: formatCount(exhibitions.approved), tone: "info", icon: CheckCircle2, href: href("/exhibitions?status=approved") },
    { key: "active", label: t("exhibitions.active"), value: formatCount(exhibitions.active), tone: "good", icon: PlayCircle, href: href("/exhibitions?status=active") },
    {
      key: "targets",
      label: t("exhibitions.targetsSet", { year: targets.year }),
      value: t("exhibitions.targetsRatio", { withTarget: targets.agentsWithTarget, total: targets.agentsTotal }),
      tone: targets.agentsTotal === 0 ? "neutral" : missing > 0 ? "warning" : "good",
      icon: Goal,
      href: href("/target-management"),
    },
  ];
  return (
    <Panel
      id="super-agent-exhibitions"
      icon={CalendarDays}
      iconClassName="bg-violet-100 text-violet-800"
      title={t("exhibitions.title")}
      subtitle={t("exhibitions.description")}
      action={{ href: href("/exhibitions"), label: t("exhibitions.viewAll") }}
    >
      <StatRows rows={rows} />
    </Panel>
  );
}
