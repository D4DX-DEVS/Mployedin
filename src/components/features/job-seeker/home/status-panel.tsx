import { useTranslations } from "next-intl";
import { PieChart } from "lucide-react";
import { BLUE_RAMP, DonutChart, Panel, STATUS_COLOR, type DonutSlice } from "@/components/shared/DashboardKit";
import { formatCount } from "@/lib/ui/intlFormat";
import type { StatusBreakdown } from "./types";

interface Props {
  locale: string;
  breakdown: StatusBreakdown;
}

/**
 * Where the seeker's applications stand. Stages in pipeline order on the blue
 * ramp; "offer" folds in `selected` (chosen, offer being prepared); rejected in
 * the status red; withdrawn is the seeker's own action and stays out.
 */
export function ApplicationStatusPanel({ locale, breakdown }: Props) {
  const t = useTranslations("jobSeekerHome");
  const href = (status: string) => `/${locale}/job-seeker/applications?status=${status}`;
  const slices: DonutSlice[] = [
    { key: "applied", label: t("statusBreakdown.applied"), value: breakdown.applied, color: BLUE_RAMP[0], href: href("applied") },
    { key: "shortlisted", label: t("statusBreakdown.shortlisted"), value: breakdown.shortlisted, color: BLUE_RAMP[1], href: href("shortlisted") },
    { key: "interview", label: t("statusBreakdown.interview"), value: breakdown.interview_scheduled, color: BLUE_RAMP[2], href: href("interview_scheduled") },
    { key: "offer", label: t("statusBreakdown.offer"), value: breakdown.offer + breakdown.selected, color: BLUE_RAMP[3], href: href("offer") },
    { key: "hired", label: t("statusBreakdown.hired"), value: breakdown.hired, color: BLUE_RAMP[4], href: href("hired") },
    { key: "rejected", label: t("statusBreakdown.rejected"), value: breakdown.rejected, color: STATUS_COLOR.critical, href: href("rejected") },
  ];
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  return (
    <Panel
      id="job-seeker-status"
      icon={PieChart}
      title={t("statusBreakdown.title")}
      subtitle={t("statusBreakdown.subtitle")}
      action={{ href: `/${locale}/job-seeker/applications`, label: t("recentApplications.viewAll") }}
    >
      <DonutChart
        slices={slices}
        total={formatCount(total, undefined, locale)}
        totalLabel={t("statusBreakdown.total")}
        emptyLabel={t("statusBreakdown.empty")}
      />
    </Panel>
  );
}
