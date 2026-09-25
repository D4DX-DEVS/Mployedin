import Link from "next/link";
import { AlarmClock, Briefcase, CalendarX2, FilePen, Gauge, PauseCircle, Timer, Workflow } from "lucide-react";
import type { ApplicationStatus } from "@/models/Application";
import type { HiringFunnel, RecruitmentOverview } from "@/lib/admin/dashboard/types";
import { formatCount } from "@/lib/ui/intlFormat";
import { cardGrid, DashboardCard, DashboardSection } from "./dashboard-section";
import { shareOf, StatList } from "./stat-list";
import type { DashboardTranslator } from "./types";

const STATUS_KEYS: Partial<Record<ApplicationStatus, string>> = {
  applied: "applied",
  shortlisted: "shortlisted",
  interview_scheduled: "interviewScheduled",
  selected: "selected",
  offer: "offer",
  hired: "hired",
  rejected: "rejected",
  withdrawn: "withdrawn",
};

const STAGE_BARS: Partial<Record<ApplicationStatus, string>> = {
  hired: "bg-emerald-500",
  rejected: "bg-rose-500",
  withdrawn: "bg-slate-400",
};

/** One decimal place; null when there is nothing to divide by. */
function rate(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}

interface Props {
  data: RecruitmentOverview;
  /** Pipeline and funnel need `applications`; job health needs `jobs`. */
  show: { applications: boolean; jobs: boolean };
  days: number;
  locale: string;
  t: DashboardTranslator;
}

function Pipeline({ data, locale, t }: Pick<Props, "data" | "locale" | "t">) {
  const total = data.pipeline.reduce((sum, stage) => sum + stage.count, 0);
  const max = Math.max(1, ...data.pipeline.map((stage) => stage.count));
  return (
    <ul className="-mx-1 flex flex-1 flex-col justify-between">
      {data.pipeline.map((stage) => {
        const label = t(`statuses.${STATUS_KEYS[stage.status] ?? "unknown"}`);
        const width = stage.count === 0 ? 0 : Math.max(3, Math.round((stage.count / max) * 100));
        const share = shareOf(stage.count, total);
        return (
          <li key={stage.status} data-stage={stage.status}>
            <Link
              href={`/${locale}/admin/applications?status=${stage.status}`}
              className="grid min-h-9 grid-cols-[8rem_1fr_auto] items-center gap-3 rounded-md px-1 transition-colors hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:min-h-8"
              aria-label={t("pipeline.stageAria", { label, count: stage.count })}
            >
              <span className="truncate text-xs text-muted-foreground">{label}</span>
              <span className="h-2 overflow-hidden rounded-full bg-secondary">
                <span className={`block h-full rounded-full ${STAGE_BARS[stage.status] ?? "bg-violet-500"}`} style={{ width: `${width}%` }} />
              </span>
              <span className="min-w-16 text-end text-xs tabular-nums text-foreground">
                <span className="font-semibold">{formatCount(stage.count)}</span>
                {share && <span className="ms-1 text-muted-foreground">{share}</span>}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Stage-to-stage conversion. Each step divides by the stage before it, so a
 * weak step shows up as a low percentage rather than being hidden inside an
 * overall hire rate.
 */
function Funnel({ funnel, t }: { funnel: HiringFunnel; t: DashboardTranslator }) {
  const steps = [
    { key: "toInterview", part: funnel.reachedInterview, whole: funnel.applications },
    { key: "toOffer", part: funnel.reachedOffer, whole: funnel.reachedInterview },
    { key: "toHire", part: funnel.hired, whole: funnel.reachedOffer },
  ] as const;
  const reviewHours = funnel.avgHoursToFirstReview;
  const reviewInDays = reviewHours !== null && reviewHours >= 48;
  const times = [
    {
      key: "firstReview",
      icon: Timer,
      value: reviewInDays ? Math.round((reviewHours / 24) * 10) / 10 : reviewHours,
      unit: reviewInDays ? "days" : "hours",
    },
    { key: "timeToHire", icon: Gauge, value: funnel.avgDaysToHire, unit: "days" },
  ] as const;

  return (
    <>
      <ul className="flex flex-col gap-2.5">
        {steps.map((step) => {
          const value = rate(step.part, step.whole);
          return (
            <li key={step.key} data-funnel-step={step.key}>
              <div className="flex items-baseline justify-between gap-2 [flex-wrap:nowrap]">
                <span className="truncate text-xs text-muted-foreground">{t(`funnel.${step.key}`)}</span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{value === null ? "—" : `${value}%`}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
                <span className="block h-full rounded-full bg-violet-500" style={{ width: `${value ?? 0}%` }} />
              </div>
              <p className="mt-0.5 text-xs leading-4 text-muted-foreground">{t(`funnel.reached.${step.key}`, { part: step.part, whole: step.whole })}</p>
            </li>
          );
        })}
      </ul>
      <dl className="mt-auto grid grid-cols-2 gap-2 pt-3">
        {times.map((time) => {
          const Icon = time.icon;
          return (
            <div key={time.key} className="rounded-lg bg-card/80 px-2.5 py-2 ring-1 ring-inset ring-border/60" data-funnel-time={time.key}>
              <dt className="flex items-center gap-1.5 text-xs leading-4 text-muted-foreground [flex-wrap:nowrap]">
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0">{t(`funnel.${time.key}`)}</span>
              </dt>
              <dd className="mt-1 text-base font-semibold tabular-nums text-foreground">
                {time.value === null ? <span className="text-xs font-normal text-muted-foreground">{t("funnel.noData")}</span> : t(`funnel.${time.unit}`, { value: time.value })}
              </dd>
            </div>
          );
        })}
      </dl>
    </>
  );
}

/**
 * Where applications are now, which jobs need a hand, and how well each stage
 * converts. "No applications" is an action-queue count and is not repeated.
 */
export function AdminRecruitmentOverview({ data, show, days, locale, t }: Props) {
  const { jobs, funnel } = data;
  const total = data.pipeline.reduce((sum, stage) => sum + stage.count, 0);
  const cards = [show.applications && "pipeline", show.jobs && "jobs", show.applications && "funnel"].filter(Boolean) as string[];
  const grid = cardGrid(cards.length);
  const cell = (card: string) => grid.cell(cards.indexOf(card));

  return (
    <DashboardSection
      id="admin-recruitment"
      icon={Workflow}
      iconClassName="bg-violet-100 text-violet-800"
      title={t("recruitment.title")}
      description={t("recruitment.description")}
    >
      <div className={`grid items-stretch gap-3 ${grid.grid}`}>
        {show.applications && (
          <DashboardCard
            title={t("recruitment.pipelineTitle")}
            subtitle={t("recruitment.pipelineSubtitle", { count: total })}
            action={{ href: `/${locale}/admin/applications`, label: t("recruitment.viewApplications") }}
            className={cell("pipeline")}
          >
            <Pipeline data={data} locale={locale} t={t} />
          </DashboardCard>
        )}

        {show.jobs && (
          <DashboardCard
            title={t("jobHealth.title")}
            subtitle={t("jobHealth.subtitle", { count: jobs.activeJobs })}
            action={{ href: `/${locale}/admin/jobs`, label: t("jobHealth.viewJobs") }}
            className={cell("jobs")}
          >
            <StatList
              rows={[
                { key: "jobs-active", icon: Briefcase, tone: "emerald", value: jobs.activeJobs, label: t("jobHealth.active"), href: `/${locale}/admin/jobs?status=active` },
                {
                  key: "jobs-low-volume",
                  icon: Gauge,
                  tone: jobs.lowVolume > 0 ? "amber" : "slate",
                  value: jobs.lowVolume,
                  label: t("jobHealth.lowVolume"),
                  meta: shareOf(jobs.lowVolume, jobs.activeJobs),
                },
                {
                  key: "jobs-expiring",
                  icon: AlarmClock,
                  tone: jobs.expiringSoon > 0 ? "amber" : "slate",
                  value: jobs.expiringSoon,
                  label: t("jobHealth.expiringSoon"),
                  href: `/${locale}/admin/jobs?expiring=7d`,
                },
                { key: "jobs-paused", icon: PauseCircle, tone: "slate", value: jobs.paused, label: t("jobHealth.paused"), href: `/${locale}/admin/jobs?status=paused` },
                { key: "jobs-drafts", icon: FilePen, tone: "slate", value: jobs.drafts, label: t("jobHealth.drafts"), href: `/${locale}/admin/jobs?status=draft` },
                { key: "jobs-expired", icon: CalendarX2, tone: "slate", value: jobs.expiredInPeriod, label: t("jobHealth.expiredInPeriod", { days }) },
              ]}
            />
          </DashboardCard>
        )}

        {show.applications && (
          <DashboardCard title={t("funnel.title")} subtitle={t("funnel.subtitle", { count: funnel.applications })} className={cell("funnel")}>
            <Funnel funnel={funnel} t={t} />
          </DashboardCard>
        )}
      </div>
    </DashboardSection>
  );
}
