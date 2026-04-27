"use client";

import Link from "next/link";
import { Briefcase, FileText, Clock, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

interface CurrentOpeningsListProps {
  activeJobs: number;
  totalApplications: number;
  locale: string;
}

export function CurrentOpeningsList({
  activeJobs,
  totalApplications,
  locale,
}: CurrentOpeningsListProps) {
  const t = useTranslations("employerDashboard.statsCards");

  return (
    <section className="workspace-panel-surface overflow-hidden rounded-[28px]">
      <div className="border-b border-border/60 px-5 py-5 sm:px-6">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <Briefcase className="h-3.5 w-3.5 text-sky-600" />
          {t("currentOpenings")}
        </div>
        <h2 className="mt-3 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{t("jumpToQueues")}</h2>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
          {t("openRolesDesc")}
        </p>
      </div>

      <div className="space-y-2.5 px-4 py-4 sm:px-5 sm:py-5">
        <Link
          href={`/${locale}/employer/jobs`}
          className="group flex items-center gap-3 rounded-[20px] border border-border bg-background/80 px-3.5 py-3.5 transition-all hover:-translate-y-0.5 hover:border-sky-500/25 sm:px-4 sm:py-4"
        >
          <div className="rounded-2xl bg-sky-50 p-2.5 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300">
            <Briefcase className="h-4 w-4 shrink-0" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("roles")}</p>
            <span className="mt-1 block text-sm font-medium text-foreground/85">{t("activeJobs")}</span>
          </div>
          <span className="text-lg font-semibold tracking-tight text-foreground">{activeJobs}</span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-sky-600 dark:group-hover:text-sky-300" />
        </Link>

        <Link
          href={`/${locale}/employer/applications`}
          className="group flex items-center gap-3 rounded-[20px] border border-border bg-background/80 px-3.5 py-3.5 transition-all hover:-translate-y-0.5 hover:border-sky-500/25 sm:px-4 sm:py-4"
        >
          <div className="rounded-2xl bg-amber-50 p-2.5 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300">
            <FileText className="h-4 w-4 shrink-0" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("candidates")}</p>
            <span className="mt-1 block text-sm font-medium text-foreground/85">{t("allApplications")}</span>
          </div>
          <span className="text-lg font-semibold tracking-tight text-foreground">{totalApplications}</span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-sky-600 dark:group-hover:text-sky-300" />
        </Link>
      </div>
    </section>
  );
}

interface OpeningsStatsProps {
  activeJobs: number;
  totalApplications: number;
}

export function OpeningsStats({ activeJobs, totalApplications }: OpeningsStatsProps) {
  const t = useTranslations("employerDashboard.statsCards");

  return (
    <section className="workspace-panel-surface rounded-[28px] p-4 sm:p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("currentPortfolio")}</p>
      <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{t("seeHiringVolume")}</h2>
      <div className="mt-4 space-y-2.5">
        <div className="rounded-2xl border border-border bg-background/80 px-3.5 py-3.5 sm:px-4 sm:py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("activeJobs")}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{activeJobs}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("rolesOpenForNew")}</p>
        </div>
        <div className="rounded-2xl border border-border bg-background/60 px-3.5 py-3.5 sm:px-4 sm:py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("openApplications")}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{totalApplications}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("candidatesMoving")}</p>
        </div>
      </div>
    </section>
  );
}

interface TimeToHireProps {
  avgDays: number | null;
}

export function TimeToHire({ avgDays }: TimeToHireProps) {
  const t = useTranslations("employerDashboard.statsCards");

  return (
    <section className="rounded-[28px] border border-amber-200 bg-[linear-gradient(180deg,_rgba(255,251,235,0.98),_rgba(255,247,237,0.96))] p-4 shadow-[0_24px_60px_-46px_rgba(245,158,11,0.32)] dark:border-amber-500/25 dark:bg-[linear-gradient(180deg,_rgba(120,53,15,0.28),_rgba(15,23,42,0.96))] sm:p-5">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
        <Clock className="h-3.5 w-3.5" />
        {t("timeToHire")}
      </div>
      <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground dark:text-amber-50 sm:text-2xl">{t("monitorSpeed")}</h2>
      {avgDays !== null ? (
        <>
          <p className="mt-4 text-4xl font-semibold tracking-tight text-foreground dark:text-amber-50">
            {Math.round(avgDays)}
            <span className="ml-2 text-base font-medium text-muted-foreground dark:text-amber-100/80">{t("days")}</span>
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground dark:text-amber-100/75">{t("avgTimePlacement")}</p>
        </>
      ) : (
        <>
          <p className="mt-4 text-4xl font-semibold tracking-tight text-muted-foreground dark:text-amber-100/70">\u2014</p>
          <p className="mt-1.5 text-sm text-muted-foreground dark:text-amber-100/75">{t("noHiresYet")}</p>
        </>
      )}
    </section>
  );
}
