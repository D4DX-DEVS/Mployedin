import { useTranslations } from "next-intl";
import { Briefcase, CalendarX2, FilePenLine, Inbox, PauseCircle, PlayCircle } from "lucide-react";
import { Panel, StatRows, type StatRow } from "@/components/shared/DashboardKit";
import type { EmployerDashboardStats } from "@/lib/dashboard/employerStats";
import { formatCount } from "@/lib/ui/intlFormat";

interface Props {
  stats: Pick<EmployerDashboardStats, "activeJobCount" | "pausedJobCount" | "draftJobCount" | "expiringJobs7d" | "jobsWithoutApplications">;
  locale: string;
}

/** Where the employer's jobs stand: live, paused, unfinished, about to expire, or unanswered. */
export function JobsHealthPanel({ stats, locale }: Props) {
  const t = useTranslations("employerDashboard.overview.jobsHealth");
  const p = (path: string) => `/${locale}${path}`;
  const rows: StatRow[] = [
    { key: "active", label: t("active"), value: formatCount(stats.activeJobCount), tone: "good", icon: PlayCircle, href: p("/employer/jobs?status=active") },
    { key: "paused", label: t("paused"), value: formatCount(stats.pausedJobCount), tone: "neutral", icon: PauseCircle, href: p("/employer/jobs?status=paused") },
    { key: "drafts", label: t("drafts"), value: formatCount(stats.draftJobCount), tone: "info", icon: FilePenLine, href: p("/employer/jobs?status=draft") },
    { key: "expiring", label: t("expiring7d"), value: formatCount(stats.expiringJobs7d), tone: stats.expiringJobs7d > 0 ? "warning" : "neutral", icon: CalendarX2, href: p("/employer/jobs?status=active") },
    { key: "noApplications", label: t("noApplications"), value: formatCount(stats.jobsWithoutApplications), tone: stats.jobsWithoutApplications > 0 ? "warning" : "neutral", icon: Inbox, href: p("/employer/jobs?status=active") },
  ];

  return (
    <Panel
      id="employer-jobs-health"
      icon={Briefcase}
      title={t("title")}
      subtitle={t("subtitle", { count: stats.activeJobCount })}
      action={{ href: p("/employer/jobs"), label: t("viewJobs") }}
    >
      <StatRows rows={rows} />
    </Panel>
  );
}
