"use client";

import { useLocale, useTranslations } from "next-intl";
import { FileCheck2 } from "lucide-react";
import { formatListDate } from "@/lib/ui/intlFormat";
import { ApplicationStatusPill } from "@/components/shared/ApplicationStatusPill";
import type { SeekerApplicationRow } from "@/lib/jobseekers/hiringStatus";
import type { JobApplicationSummary, JobExportSummary } from "@/lib/cv/cvExportHistory";

/** What the list API adds to each seeker row about applications and CV exports. */
export interface SeekerHistoryFields {
  /** Their newest application status change, any job. */
  lastApplication?: SeekerApplicationRow;
  applicationCount?: number;
  /** Only when a job is chosen. */
  forJob?: { application: JobApplicationSummary | null; exported: JobExportSummary | null };
}

/** "Last application" column: the job, the client, where it stands and when; or "Not applied yet". */
export function LastApplicationCell({ row }: { row: SeekerHistoryFields }) {
  const tr = useTranslations("adminJobSeekers");
  const locale = useLocale();
  const app = row.lastApplication;
  if (!app) {
    return (
      <span className="inline-flex whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
        {tr("notAppliedYet")}
      </span>
    );
  }
  const more = (row.applicationCount ?? 1) - 1;
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <span dir="auto" className="line-clamp-2 font-medium text-foreground/90">{app.jobTitle}</span>
      {app.company && <span dir="auto" className="line-clamp-1 text-muted-foreground">{app.company}</span>}
      <span className="flex flex-wrap items-center gap-1.5">
        <ApplicationStatusPill status={app.status} />
        <span className="whitespace-nowrap tabular-nums text-muted-foreground">{formatListDate(app.updatedAt, locale)}</span>
      </span>
      {more > 0 && <span className="text-primary">{tr("moreApplications", { count: more })}</span>}
    </div>
  );
}

/** "For this job" column: did they apply to it, and was their CV already exported for it. */
export function ForJobCell({ row }: { row: SeekerHistoryFields }) {
  const tr = useTranslations("adminJobSeekers");
  const locale = useLocale();
  const forJob = row.forJob;
  if (!forJob) return <span className="text-muted-foreground">—</span>;
  const { application, exported } = forJob;
  if (!application && !exported) {
    // The common case stays quiet, so the rows that need attention stand out.
    return <span className="text-muted-foreground">{tr("forJobFresh")}</span>;
  }
  return (
    <div className="flex flex-col items-start gap-1">
      {application && (
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-foreground/90">{tr("forJobApplied")}</span>
          <ApplicationStatusPill status={application.status} />
        </span>
      )}
      {exported && <ExportedLine exported={exported} locale={locale} />}
    </div>
  );
}

function ExportedLine({ exported, locale }: { exported: JobExportSummary; locale: string }) {
  const tr = useTranslations("adminJobSeekers");
  const date = formatListDate(exported.lastAt, locale);
  return (
    <span className="flex flex-col items-start gap-0.5">
      <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-800">
        <FileCheck2 className="size-3 shrink-0" aria-hidden="true" />
        {exported.count > 1 ? tr("forJobExportedTimes", { count: exported.count, date }) : tr("forJobExported", { date })}
      </span>
      {exported.lastBy && <span className="text-muted-foreground">{tr("forJobExportedBy", { name: exported.lastBy })}</span>}
    </span>
  );
}

/** Phones: the same facts as one compact block under the role. */
export function SeekerHistoryLine({ row }: { row: SeekerHistoryFields }) {
  const tr = useTranslations("adminJobSeekers");
  const locale = useLocale();
  const app = row.lastApplication;
  return (
    <div className="space-y-1.5">
      {row.forJob && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground">{tr("forJobShort")}</span>
          {row.forJob.application && <ApplicationStatusPill status={row.forJob.application.status} />}
          {row.forJob.exported && (
            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-800">
              <FileCheck2 className="size-3" aria-hidden="true" />
              {tr("forJobExported", { date: formatListDate(row.forJob.exported.lastAt, locale) })}
            </span>
          )}
          {!row.forJob.application && !row.forJob.exported && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{tr("forJobFresh")}</span>
          )}
        </div>
      )}
      {app ? (
        <p className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
          <span>{tr("lastApplicationShort")}</span>
          <bdi className="line-clamp-1 font-medium text-foreground/80">{[app.jobTitle, app.company].filter(Boolean).join(" · ")}</bdi>
          <ApplicationStatusPill status={app.status} />
        </p>
      ) : (
        <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{tr("notAppliedYet")}</span>
      )}
    </div>
  );
}
