import Link from "next/link";
import { AlarmClock, ArrowDown, CalendarX2, FilePen, Funnel, Gauge, PauseCircle, Percent, Timer, Workflow } from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
  /** Pipeline needs `applications`; job health needs `jobs`. */
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
 * Where applications are now and which jobs need a hand. How far applications
 * get over time is the hiring funnel on the Overview tab, not repeated here.
 * "No applications" is an action-queue count and is not repeated either.
 */
export function AdminRecruitmentOverview({ data, show, days, locale, t }: Props) {
  const { jobs } = data;
  const total = data.pipeline.reduce((sum, stage) => sum + stage.count, 0);
  const cards = [show.applications && "pipeline", show.jobs && "jobs"].filter(Boolean) as string[];
  const grid = cardGrid(cards.length, 2);
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
      </div>
    </DashboardSection>
  );
}

const FUNNEL_STAGES = [
  { key: "applications", count: (funnel: HiringFunnel) => funnel.applications },
  { key: "reachedInterview", count: (funnel: HiringFunnel) => funnel.reachedInterview },
  { key: "reachedOffer", count: (funnel: HiringFunnel) => funnel.reachedOffer },
  { key: "hired", count: (funnel: HiringFunnel) => funnel.hired },
] as const;

/** The step into each stage after the first, keyed like the `funnel.reached.*` sentences. */
const FUNNEL_STEPS = ["toInterview", "toOffer", "toHire"] as const;

/**
 * Label | bar | count, the same three columns as the pipeline chart on Quick
 * analysis, so both bar charts read the same way.
 */
const FUNNEL_ROW = "grid grid-cols-[7.5rem_minmax(0,1fr)_2.75rem] items-center gap-3 sm:grid-cols-[8.5rem_minmax(0,1fr)_3rem]";

interface Speed {
  key: string;
  icon: LucideIcon;
  label: string;
  /** The number, printed large; null when there is nothing to average. */
  value: string | null;
  /** Unit printed small beside the number, like "All time" beside a snapshot total. */
  unit?: string;
  detail?: string;
}

function speedTiles(funnel: HiringFunnel, locale: string, t: DashboardTranslator): Speed[] {
  const decimal = (value: number) => formatCount(value, { maximumFractionDigits: 1 }, locale);
  const reviewHours = funnel.avgHoursToFirstReview;
  const reviewInDays = reviewHours !== null && reviewHours >= 48;
  const hireRate = rate(funnel.hired, funnel.applications);
  return [
    {
      key: "firstReview",
      icon: Timer,
      label: t("funnel.firstReview"),
      value: reviewHours === null ? null : decimal(reviewInDays ? reviewHours / 24 : reviewHours),
      unit: t(reviewInDays ? "funnel.unitDays" : "funnel.unitHours"),
    },
    {
      key: "timeToHire",
      icon: Gauge,
      label: t("funnel.timeToHire"),
      value: funnel.avgDaysToHire === null ? null : decimal(funnel.avgDaysToHire),
      unit: t("funnel.unitDays"),
    },
    {
      key: "hireRate",
      icon: Percent,
      label: t("funnel.hireRate"),
      value: hireRate === null ? null : `${decimal(hireRate)}%`,
      detail: t("funnel.hireRateDetail", { part: funnel.hired, whole: funnel.applications }),
    },
  ];
}

/**
 * How far applications get and how fast: one bar per stage, sized by how many
 * applications ever reached it. The part of the stage before that did not get
 * this far stays on the bar as a lighter segment, so the drop-off is visible,
 * and the line between two bars gives the conversion and the count lost. Every
 * application to date — the period picker does not narrow it, and the subtitle
 * says so. Stage counts are history ("ever reached"), which no list filters
 * on, so the bars are not links; the section links to the list.
 *
 * Colours: primary for the stage, #94AEEA (bg-[#94AEEA]) for the drop-off — one
 * hue, validated as an ordinal pair (light end 2.15:1 on the card surface).
 */
export function AdminHiringFunnel({ funnel, locale, t }: { funnel: HiringFunnel; locale: string; t: DashboardTranslator }) {
  const stages = FUNNEL_STAGES.map((stage) => ({ key: stage.key, count: stage.count(funnel) }));
  const max = Math.max(1, stages[0].count);
  const percent = (count: number) => `${(count / max) * 100}%`;

  return (
    <DashboardSection
      id="admin-hiring-funnel"
      icon={Funnel}
      iconClassName="bg-primary/10 text-primary"
      title={t("funnel.title")}
      description={t("funnel.description")}
      action={{ href: `/${locale}/admin/applications`, label: t("recruitment.viewApplications") }}
    >
      <div className="grid items-stretch gap-2.5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="workspace-subtle-surface flex min-w-0 flex-col rounded-xl p-3 shadow-[0_8px_24px_-20px_rgba(15,23,42,0.35)] sm:p-4" data-surface="light-card">
          <p className="text-xs text-muted-foreground">{t("funnel.subtitle", { count: funnel.applications })}</p>
          {funnel.applications === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{t("funnel.empty")}</p>
          ) : (
            <ol className="mt-3 flex flex-1 flex-col">
              {/* Each later stage grows to fill the height beside the tiles; its conversion line takes the
                  growth, so the line sits centred in the gap between two bars rather than on top of one. */}
              {stages.map((stage, index) => {
                const step = index > 0 ? FUNNEL_STEPS[index - 1] : null;
                const previous = index > 0 ? stages[index - 1].count : 0;
                const dropped = Math.max(0, previous - stage.count);
                const converted = step ? rate(stage.count, previous) : null;
                // With nobody at the stage before there is no rate; say so in words, not with a dash.
                const sentence = !step ? undefined : previous === 0 ? t("funnel.stepEmpty") : t(`funnel.reached.${step}`, { part: stage.count, whole: previous });
                return (
                  <li key={stage.key} className={step ? "flex flex-1 flex-col" : undefined} data-funnel-stage={stage.key}>
                    {step && (
                      <p className={`${FUNNEL_ROW} flex-1 py-1.5`} data-funnel-step={step}>
                        <span aria-hidden="true" />
                        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground [flex-wrap:nowrap]">
                          <ArrowDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          {converted === null ? (
                            <span className="truncate">{sentence}</span>
                          ) : (
                            <>
                              <span className="font-semibold tabular-nums text-foreground">{`${converted}%`}</span>
                              <span aria-hidden="true">{t("funnel.converted")}</span>
                              {/* Phones keep the rate; the light segment still shows the drop. */}
                              {dropped > 0 && (
                                <span className="hidden truncate sm:inline" aria-hidden="true">
                                  · {t("funnel.dropped", { count: formatCount(dropped) })}
                                </span>
                              )}
                              <span className="sr-only">{sentence}</span>
                            </>
                          )}
                        </span>
                      </p>
                    )}
                    <div className={`${FUNNEL_ROW} rounded-md`} title={sentence}>
                      <span className="truncate text-xs text-foreground sm:text-sm">{t(`funnel.stages.${stage.key}`)}</span>
                      {/* Stage, then a 2px gap, then the drop-off: together they span the stage before. */}
                      <span className="flex h-5 min-w-0 gap-0.5 [flex-wrap:nowrap] sm:h-6" aria-hidden="true">
                        {stage.count > 0 && <span className="h-full shrink-0 rounded-e bg-primary" style={{ width: percent(stage.count) }} data-bar="stage" />}
                        {dropped > 0 && <span className="h-full min-w-0 rounded-e bg-[#94AEEA]" style={{ width: percent(dropped) }} data-bar="dropped" />}
                      </span>
                      <span className="text-end text-sm font-semibold tabular-nums text-foreground">{formatCount(stage.count)}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <ul className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-1">
          {speedTiles(funnel, locale, t).map((tile) => {
            const Icon = tile.icon;
            return (
              <li
                key={tile.key}
                className="flex min-w-0 items-center gap-2.5 rounded-xl bg-card/80 p-3 ring-1 ring-inset ring-border/60 [flex-wrap:nowrap] sm:flex-col sm:items-start sm:justify-center sm:gap-1.5"
                data-funnel-time={tile.key}
              >
                {/* Same anatomy as a Platform snapshot card: icon + semibold label, then the number with its unit small. */}
                <span className="flex min-w-0 flex-1 items-center gap-2 [flex-wrap:nowrap] sm:flex-none">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 text-xs font-semibold text-foreground">{tile.label}</span>
                </span>
                {tile.value === null ? (
                  <span className="shrink-0 text-xs text-muted-foreground">{t("funnel.noData")}</span>
                ) : (
                  <span className="flex shrink-0 items-baseline gap-1.5 [flex-wrap:nowrap]">
                    <span className="text-lg font-semibold tabular-nums tracking-tight text-foreground sm:text-2xl">{tile.value}</span>
                    {tile.unit && <span className="text-xs text-muted-foreground">{tile.unit}</span>}
                  </span>
                )}
                {tile.detail && <span className="hidden text-xs text-muted-foreground sm:block">{tile.detail}</span>}
              </li>
            );
          })}
        </ul>
      </div>
    </DashboardSection>
  );
}
