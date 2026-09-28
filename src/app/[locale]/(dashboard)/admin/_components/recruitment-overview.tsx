import Link from "next/link";
import { AlarmClock, ArrowRight, CalendarX2, FilePen, Gauge, PauseCircle, PieChart, Timer, Workflow } from "lucide-react";
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
  rejected: "bg-primary",
  withdrawn: "bg-primary/50",
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
              className="grid min-h-8 grid-cols-[8rem_1fr_auto] items-center gap-3 rounded-md px-1 transition-colors hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={t("pipeline.stageAria", { label, count: stage.count })}
            >
              <span className="truncate text-xs text-muted-foreground">{label}</span>
              <span className="h-2 overflow-hidden rounded-full bg-secondary">
                <span className={`block h-full rounded-full ${STAGE_BARS[stage.status] ?? "bg-primary"}`} style={{ width: `${width}%` }} />
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
      <ul className="flex flex-col gap-2">
        {steps.map((step) => {
          const value = rate(step.part, step.whole);
          return (
            <li key={step.key} data-funnel-step={step.key}>
              <div className="flex items-baseline justify-between gap-2 [flex-wrap:nowrap]">
                <span className="truncate text-xs text-muted-foreground">{t(`funnel.${step.key}`)}</span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{value === null ? "—" : `${value}%`}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${value ?? 0}%` }} />
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
      iconClassName="bg-primary/10 text-primary"
      title={t("recruitment.title")}
      description={t("recruitment.description")}
    >
      <div className={`grid items-stretch gap-2.5 ${grid.grid}`}>
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
                // Active total lives in Platform snapshot + card subtitle; repeating it here duplicated the same number twice.
                {
                  key: "jobs-low-volume",
                  icon: Gauge,
                  tone: jobs.lowVolume > 0 ? "sky" : "slate",
                  value: jobs.lowVolume,
                  label: t("jobHealth.lowVolume"),
                  meta: shareOf(jobs.lowVolume, jobs.activeJobs),
                },
                {
                  key: "jobs-expiring",
                  icon: AlarmClock,
                  tone: jobs.expiringSoon > 0 ? "sky" : "slate",
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

/** A small executive pulse for the default dashboard view. Detailed pipeline, job and funnel cards live in Quick analysis. */
export function AdminRecruitmentPulse({ data, show, locale, t }: Props) {
  const total = data.pipeline.reduce((sum, stage) => sum + stage.count, 0);
  const interviewRate = rate(data.funnel.reachedInterview, data.funnel.applications);
  const metrics = [
    show.applications && {
      label: t("recruitment.pipelineTitle"),
      value: formatCount(total),
      detail: t("recruitment.pipelineSubtitle", { count: total }),
      href: `/${locale}/admin/applications`,
      tone: "bg-primary/10 text-primary",
    },
    show.applications && {
      label: t("funnel.toInterview"),
      value: interviewRate === null ? "—" : `${interviewRate}%`,
      detail: t("funnel.reached.toInterview", { part: data.funnel.reachedInterview, whole: data.funnel.applications }),
      href: `/${locale}/admin/applications?status=interview_scheduled`,
      tone: "bg-primary/10 text-primary",
    },
    show.jobs && {
      label: t("jobHealth.lowVolume"),
      value: formatCount(data.jobs.lowVolume),
      detail: t("jobHealth.subtitle", { count: data.jobs.activeJobs }),
      href: `/${locale}/admin/jobs`,
      tone: "bg-primary/10 text-primary",
    },
  ].filter(Boolean) as Array<{ label: string; value: string; detail: string; href: string; tone: string }>;
  const pulseAction = show.applications
    ? { href: `/${locale}/admin/applications`, label: t("recruitment.viewApplications") }
    : show.jobs
      ? { href: `/${locale}/admin/jobs`, label: t("jobHealth.viewJobs") }
      : undefined;

  return (
    <>
      <DashboardSection
        id="admin-recruitment-pulse"
        icon={Workflow}
        iconClassName="bg-primary/10 text-primary"
        title={t("recruitment.title")}
        description={t("recruitment.description")}
        action={pulseAction}
      >
        <div className={`grid gap-2.5 ${cardGrid(metrics.length).grid}`}>
          {metrics.map((metric) => (
            <Link
              key={metric.label}
              href={metric.href}
              className="group flex min-w-0 items-center gap-3 rounded-xl bg-card/80 p-3 ring-1 ring-inset ring-border/60 transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${metric.tone}`}>
                <Workflow className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-foreground">{metric.label}</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">{metric.detail}</span>
              </span>
              <span className="shrink-0 text-xl font-semibold tabular-nums text-foreground">{metric.value}</span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </DashboardSection>
      <AdminRecruitmentAnalytics data={data} show={show} locale={locale} t={t} />
    </>
  );
}

/** Detailed charts live in their own band below the compact recruitment pulse. */
export function AdminRecruitmentAnalytics({ data, show, locale, t }: Pick<Props, "data" | "show" | "locale" | "t">) {
  const cards = [show.applications && "pipeline", show.jobs && "jobs"].filter(Boolean) as string[];
  const grid = cardGrid(cards.length, 2);
  const cell = (card: string) => grid.cell(cards.indexOf(card));

  if (cards.length === 0) return null;

  return (
    <DashboardSection
      id="admin-recruitment-analytics"
      icon={PieChart}
      iconClassName="bg-primary/10 text-primary"
      title={t("recruitment.analyticsTitle")}
      description={t("recruitment.analyticsDescription")}
    >
      <div className={`grid items-stretch gap-2.5 ${grid.grid}`}>
        {show.applications && (
          <DashboardCard
            title={t("recruitment.pipelineTitle")}
            subtitle={t("recruitment.pipelineSubtitle", { count: data.pipeline.reduce((sum, stage) => sum + stage.count, 0) })}
            action={{ href: `/${locale}/admin/applications`, label: t("recruitment.viewApplications") }}
            className={cell("pipeline")}
          >
            <PipelineDonut data={data} t={t} />
          </DashboardCard>
        )}
        {show.jobs && (
          <DashboardCard
            title={t("jobHealth.title")}
            subtitle={t("jobHealth.subtitle", { count: data.jobs.activeJobs })}
            action={{ href: `/${locale}/admin/jobs`, label: t("jobHealth.viewJobs") }}
            className={cell("jobs")}
          >
            <StatList
              rows={[
                { key: "jobs-active", icon: Workflow, tone: "sky", value: data.jobs.activeJobs, label: t("jobHealth.active") },
                { key: "jobs-low-volume", icon: Gauge, tone: data.jobs.lowVolume > 0 ? "sky" : "slate", value: data.jobs.lowVolume, label: t("jobHealth.lowVolume") },
                { key: "jobs-expiring", icon: AlarmClock, tone: data.jobs.expiringSoon > 0 ? "sky" : "slate", value: data.jobs.expiringSoon, label: t("jobHealth.expiringSoon") },
                { key: "jobs-paused", icon: PauseCircle, tone: "slate", value: data.jobs.paused, label: t("jobHealth.paused") },
              ]}
            />
          </DashboardCard>
        )}
      </div>
    </DashboardSection>
  );
}

function PipelineDonut({ data, t }: Pick<Props, "data" | "t">) {
  const stages = data.pipeline.filter((stage) => stage.count > 0);
  const total = stages.reduce((sum, stage) => sum + stage.count, 0);
  const colors = ["hsl(var(--primary))", "#16a34a"];
  let cursor = 0;
  const segments = stages.map((stage, index) => {
    const start = total > 0 ? (cursor / total) * 360 : 0;
    cursor += stage.count;
    const end = total > 0 ? (cursor / total) * 360 : 0;
    return { stage, color: colors[index % colors.length], start, end };
  });
  const gradient = segments.length > 0
    ? `conic-gradient(${segments.map((segment) => `${segment.color} ${segment.start}deg ${segment.end}deg`).join(", ")})`
    : "hsl(var(--muted))";

  return (
    <div
      className="flex min-w-0 items-center gap-3 rounded-xl bg-card/80 p-3 ring-1 ring-inset ring-border/60"
      role="group"
      aria-label={t("recruitment.pipelineSubtitle", { count: total })}
    >
      <div className="relative h-20 w-20 shrink-0 rounded-full p-2" style={{ background: gradient }} aria-hidden="true">
        <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-card text-center">
          <PieChart className="mb-0.5 h-3.5 w-3.5 text-primary" />
          <span className="text-lg font-semibold leading-5 tabular-nums text-foreground">{formatCount(total)}</span>
        </div>
      </div>
      <div className="min-w-0 space-y-1">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <PieChart className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          {t("recruitment.pipelineTitle")}
        </p>
        <ul className="space-y-0.5">
          {segments.map(({ stage, color }) => {
            const label = t(`statuses.${STATUS_KEYS[stage.status] ?? "unknown"}`);
            return (
              <li key={stage.status} className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
                <span className="truncate">{label}</span>
                <span className="ms-auto tabular-nums text-foreground">{stage.count}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
