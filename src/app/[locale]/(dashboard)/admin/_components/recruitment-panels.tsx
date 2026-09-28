import { Briefcase, Filter, PieChart } from "lucide-react";
import { BarList, DonutChart, Panel, StatRows, type BarListRow, type DonutSlice, type StatRow } from "@/components/shared/DashboardKit";
import type { RecruitmentOverview } from "@/lib/admin/dashboard/types";
import { formatCount } from "@/lib/ui/intlFormat";
import type { DashboardTranslator } from "./types";

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
  data: RecruitmentOverview;
  show: { applications: boolean; jobs: boolean };
  days: number;
  locale: string;
  t: DashboardTranslator;
}

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—");

export function FunnelPanel({ data, locale, t }: Props) {
  const f = data.funnel;
  const rows: BarListRow[] = [
    { key: "applications", label: t("snapshot.applications"), value: f.applications, note: "100%", href: `/${locale}/admin/applications` },
    { key: "interview", label: t("statuses.interviewScheduled"), value: f.reachedInterview, note: pct(f.reachedInterview, f.applications), href: `/${locale}/admin/applications?status=interview_scheduled` },
    { key: "offer", label: t("statuses.offer"), value: f.reachedOffer, note: pct(f.reachedOffer, f.applications), href: `/${locale}/admin/applications?status=offer` },
    { key: "hired", label: t("statuses.hired"), value: f.hired, note: pct(f.hired, f.applications), href: `/${locale}/admin/applications?status=hired` },
  ];
  return (
    <Panel id="admin-funnel" icon={Filter} title={t("funnel.title")} subtitle={t("funnel.subtitle", { count: f.applications })} bodyClassName="justify-between gap-4">
      <BarList rows={rows} max={f.applications} tone="ramp" />
      <dl className="grid grid-cols-2 gap-2 border-t border-border/60 pt-3 text-xs">
        <div>
          <dt className="text-muted-foreground">{t("funnel.firstReview")}</dt>
          <dd className="mt-0.5 text-base font-semibold tabular-nums text-foreground">{f.avgHoursToFirstReview == null ? t("funnel.noData") : t("funnel.hours", { value: f.avgHoursToFirstReview })}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("funnel.timeToHire")}</dt>
          <dd className="mt-0.5 text-base font-semibold tabular-nums text-foreground">{f.avgDaysToHire == null ? t("funnel.noData") : t("funnel.days", { value: f.avgDaysToHire })}</dd>
        </div>
      </dl>
    </Panel>
  );
}

export function PipelinePanel({ data, locale, t }: Props) {
  const total = data.pipeline.reduce((sum, stage) => sum + stage.count, 0);
  const slices: DonutSlice[] = data.pipeline.map((stage) => ({
    key: stage.status,
    label: t(`statuses.${STATUS_KEYS[stage.status] ?? "unknown"}`),
    value: stage.count,
    color: STATUS_COLORS[stage.status],
    href: `/${locale}/admin/applications?status=${stage.status}`,
  }));
  return (
    <Panel id="admin-pipeline" icon={PieChart} title={t("recruitment.pipelineTitle")} subtitle={t("recruitment.pipelineSubtitle", { count: total })} action={{ href: `/${locale}/admin/applications`, label: t("recruitment.viewApplications") }}>
      <DonutChart slices={slices} totalLabel={t("kpi.total")} emptyLabel={t("recruitment.empty")} />
    </Panel>
  );
}

export function JobHealthPanel({ data, days, locale, t }: Props) {
  const j = data.jobs;
  const rows: StatRow[] = [
    { key: "active", label: t("jobHealth.active"), value: formatCount(j.activeJobs), tone: "good", href: `/${locale}/admin/jobs?status=active` },
    { key: "lowVolume", label: t("jobHealth.lowVolume"), value: formatCount(j.lowVolume), tone: "warning" },
    { key: "expiringSoon", label: t("jobHealth.expiringSoon"), value: formatCount(j.expiringSoon), tone: "warning", href: `/${locale}/admin/jobs?expiring=7d` },
    { key: "paused", label: t("jobHealth.paused"), value: formatCount(j.paused), tone: "neutral", href: `/${locale}/admin/jobs?status=paused` },
    { key: "drafts", label: t("jobHealth.drafts"), value: formatCount(j.drafts), tone: "info", href: `/${locale}/admin/jobs?status=draft` },
    { key: "expired", label: t("jobHealth.expiredInPeriod", { days }), value: formatCount(j.expiredInPeriod), tone: "neutral", href: `/${locale}/admin/jobs?status=expired` },
  ];
  return (
    <Panel id="admin-job-health" icon={Briefcase} title={t("jobHealth.title")} subtitle={t("jobHealth.subtitle", { count: j.activeJobs })} action={{ href: `/${locale}/admin/jobs`, label: t("jobHealth.viewJobs") }}>
      <StatRows rows={rows} />
    </Panel>
  );
}
