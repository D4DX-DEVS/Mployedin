import { PieChart } from "lucide-react";
import { DonutChart, Panel, type DonutSlice } from "@/components/shared/DashboardKit";
import type { ApplicationStatus } from "@/models/Application";
import { formatCount } from "@/lib/ui/intlFormat";
import type { AgentTranslator } from "./types";

/** Message key per status under `pipelineStatus.statuses`. */
const STATUS_KEYS: Record<ApplicationStatus, string> = {
  applied: "applied",
  shortlisted: "shortlisted",
  interview_scheduled: "interviewScheduled",
  selected: "selected",
  offer: "offer",
  hired: "hired",
  rejected: "rejected",
  withdrawn: "withdrawn",
};

/** Status colours, the same ones the admin pipeline uses. */
const STATUS_COLORS: Record<ApplicationStatus, string> = {
  applied: "#0242CE",
  shortlisted: "#eda100",
  interview_scheduled: "#4a3aa7",
  selected: "#1baf7a",
  offer: "#eb6834",
  hired: "#008300",
  rejected: "#e34948",
  withdrawn: "#94a3b8",
};

export const APPLICATION_STATUS_ORDER: readonly ApplicationStatus[] = [
  "applied",
  "shortlisted",
  "interview_scheduled",
  "selected",
  "offer",
  "hired",
  "rejected",
  "withdrawn",
];

interface Props {
  /** Applications on the agent's roles, counted per status. */
  byStatus: Partial<Record<ApplicationStatus, number>>;
  locale: string;
  t: AgentTranslator;
}

/** Where every candidate on the agent's roles stands, as a share of the whole. */
export function AgentPipelinePanel({ byStatus, locale, t }: Props) {
  const total = Object.values(byStatus).reduce((sum, n) => sum + (n ?? 0), 0);
  const slices: DonutSlice[] = APPLICATION_STATUS_ORDER.filter((status) => (byStatus[status] ?? 0) > 0).map((status) => ({
    key: status,
    label: t(`pipelineStatus.statuses.${STATUS_KEYS[status]}`),
    value: byStatus[status] ?? 0,
    color: STATUS_COLORS[status],
    href: `/${locale}/agent/candidates?status=${status}`,
  }));
  return (
    <Panel
      id="agent-pipeline"
      icon={PieChart}
      title={t("pipelineStatus.title")}
      subtitle={t("pipelineStatus.subtitle", { count: total })}
      action={{ href: `/${locale}/agent/candidates`, label: t("pipelineStatus.viewAll") }}
    >
      <DonutChart slices={slices} total={formatCount(total)} totalLabel={t("pipelineStatus.total")} emptyLabel={t("pipelineStatus.empty")} />
    </Panel>
  );
}
