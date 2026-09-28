import { useTranslations } from "next-intl";
import { Trophy } from "lucide-react";
import { BarList, Panel, type BarListRow } from "@/components/shared/DashboardKit";
import type { EmployerTopJob } from "@/lib/dashboard/employerStats";
import { formatCount } from "@/lib/ui/intlFormat";

/** Non-live statuses worth flagging beside a job that is still drawing applications. */
const NOTED_STATUS = new Set(["draft", "paused", "closed", "expired"]);

interface Props {
  jobs: readonly EmployerTopJob[];
  days: number;
  locale: string;
}

/** The jobs drawing the most applications in the window, each linking to its applicant list. */
export function TopJobsPanel({ jobs, days, locale }: Props) {
  const t = useTranslations("employerDashboard.overview.topJobs");
  const total = jobs.reduce((sum, job) => sum + job.applications, 0);
  const rows: BarListRow[] = jobs.map((job) => ({
    key: job.id,
    label: job.title || t("untitled"),
    value: job.applications,
    valueLabel: formatCount(job.applications),
    note: NOTED_STATUS.has(job.status) ? t(`status.${job.status}`) : undefined,
    href: `/${locale}/employer/jobs/${job.id}/applications`,
  }));

  return (
    <Panel
      id="employer-top-jobs"
      icon={Trophy}
      title={t("title")}
      subtitle={t("subtitle", { count: total, days })}
      action={{ href: `/${locale}/employer/jobs`, label: t("viewJobs") }}
    >
      <BarList rows={rows} emptyLabel={t("empty")} tone="flat" />
    </Panel>
  );
}
