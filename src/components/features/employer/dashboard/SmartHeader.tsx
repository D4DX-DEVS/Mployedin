import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  Clock,
  FileText,
  Plus,
  Sparkles,
} from "lucide-react";

interface SmartHeaderProps {
  userName: string;
  newApplications: number;
  scheduledInterviews: number;
  activeJobCount: number;
  lastActivityMinutes: number | null;
  locale: string;
}

export function SmartHeader({
  userName,
  newApplications,
  scheduledInterviews,
  activeJobCount,
  lastActivityMinutes,
  locale,
}: SmartHeaderProps) {
  const t = useTranslations("employerDashboard.smartHeader");

  let subtitleKey: string;
  let eyebrowKey: string;

  if (newApplications > 0) {
    subtitleKey = "subtitleReview";
    eyebrowKey = "reviewQueueActive";
  } else if (scheduledInterviews > 0) {
    subtitleKey = "subtitleInterviews";
    eyebrowKey = "interviewMomentum";
  } else if (activeJobCount > 0) {
    subtitleKey = "subtitleActive";
    eyebrowKey = "employerWorkspace";
  } else {
    subtitleKey = "subtitleEmpty";
    eyebrowKey = "readyToLaunch";
  }

  const newJobHref = `/${locale}/employer/jobs/new`;
  const viewJobsHref = `/${locale}/employer/jobs`;
  const activityLabel = lastActivityMinutes !== null
    ? t("lastActivity", { time: formatTimeAgo(lastActivityMinutes, t) })
    : t("freshWorkspace");

  return (
    <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-5 sm:p-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl min-w-0">
          <Image src="/logo.png" alt="Mployedin" width={100} height={34} className="mb-4 h-auto w-[106px] object-contain" style={{ height: "auto" }} />
          <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">
            <Sparkles className="h-3.5 w-3.5" />
            {t(eyebrowKey)}
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
            {t("welcomeBack", { userName })}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {t(subtitleKey)}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/80 px-3 py-1 backdrop-blur">
              <Clock className="h-3.5 w-3.5 text-sky-600" />
              {activityLabel}
            </span>
            {newApplications > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50/90 px-3 py-1 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300">
                <FileText className="h-3.5 w-3.5" />
                {t("reviewQueueLive")}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row xl:min-w-[260px] xl:flex-col xl:justify-end">
          {activeJobCount > 0 ? (
            <Link
              href={viewJobsHref}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-background/80 px-4 text-sm font-semibold text-foreground transition hover:bg-background"
            >
              {t("viewJobs")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          ) : null}
          <Link
            href={newJobHref}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-700"
          >
            <Plus className="h-4 w-4" />
            {t("newJobPosting")}
          </Link>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="workspace-glass-panel rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("activeRoles")}</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{activeJobCount}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("activeRolesDesc")}</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-2.5 text-emerald-600">
              <BriefcaseBusiness className="h-5 w-5" />
            </div>
          </div>
        </div>

        <div className="workspace-glass-panel rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("needsReview")}</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{newApplications}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("needsReviewDesc")}</p>
            </div>
            <div className="rounded-2xl bg-amber-50 p-2.5 text-amber-600">
              <FileText className="h-5 w-5" />
            </div>
          </div>
        </div>

        <div className="workspace-glass-panel rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("interviewsSet")}</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{scheduledInterviews}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("interviewsSetDesc")}</p>
            </div>
            <div className="rounded-2xl bg-sky-50 p-2.5 text-sky-600">
              <CalendarDays className="h-5 w-5" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function formatTimeAgo(minutes: number, t: (key: string, values?: Record<string, string | number | Date>) => string): string {
  if (minutes < 1) return t("justNow");
  if (minutes < 60) return t("minAgo", { count: Math.round(minutes) });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  return t("daysAgo", { count: days });
}