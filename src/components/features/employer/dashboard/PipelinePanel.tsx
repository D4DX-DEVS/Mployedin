import { useTranslations } from "next-intl";
import { PieChart } from "lucide-react";
import { DonutChart, Panel, type DonutSlice } from "@/components/shared/DashboardKit";
import type { EmployerStatusCount } from "@/lib/dashboard/employerStats";
import { formatCount } from "@/lib/ui/intlFormat";

/** Funnel order for the legend; unknown statuses trail in data order. */
const STATUS_ORDER = ["applied", "shortlisted", "interview_scheduled", "selected", "offer", "hired", "rejected", "withdrawn"];

const STATUS_KEYS: Record<string, string> = {
  applied: "applied",
  shortlisted: "shortlisted",
  interview_scheduled: "interviewScheduled",
  selected: "selected",
  offer: "offer",
  hired: "hired",
  rejected: "rejected",
  withdrawn: "withdrawn",
};

/** Status colours: the stages progress through the series palette; outcomes use status tones. */
const STATUS_COLORS: Record<string, string> = {
  applied: "#0242CE",
  shortlisted: "#eda100",
  interview_scheduled: "#4a3aa7",
  selected: "#1baf7a",
  offer: "#eb6834",
  hired: "#008300",
  rejected: "#e34948",
  withdrawn: "#94a3b8",
};

interface Props {
  pipeline: readonly EmployerStatusCount[];
  locale: string;
}

/** Every application by where it stands, each slice linking to that queue. */
export function PipelinePanel({ pipeline, locale }: Props) {
  const t = useTranslations("employerDashboard.overview.pipeline");
  const ordered = [...pipeline].sort((a, b) => {
    const ia = STATUS_ORDER.indexOf(a.status);
    const ib = STATUS_ORDER.indexOf(b.status);
    return (ia === -1 ? STATUS_ORDER.length : ia) - (ib === -1 ? STATUS_ORDER.length : ib);
  });
  const total = ordered.reduce((sum, row) => sum + row.count, 0);
  const slices: DonutSlice[] = ordered.map((row) => ({
    key: row.status,
    label: t(`statuses.${STATUS_KEYS[row.status] ?? "unknown"}`),
    value: row.count,
    color: STATUS_COLORS[row.status],
    href: `/${locale}/employer/applications?status=${row.status}`,
  }));

  return (
    <Panel
      id="employer-pipeline"
      icon={PieChart}
      title={t("title")}
      subtitle={t("subtitle", { count: total })}
      action={{ href: `/${locale}/employer/applications`, label: t("viewAll") }}
    >
      <DonutChart slices={slices} total={formatCount(total)} totalLabel={t("total")} emptyLabel={t("empty")} />
    </Panel>
  );
}
