"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { BriefcaseBusiness, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useJobDetail } from "@/hooks/useJobs";

interface JobScopeStripProps {
  jobId: string;
  locale: string;
  /** Clears the `?jobId=` scope on the cross-job page. */
  onClear: () => void;
}

/**
 * One-line notice on a cross-job Hiring page (Interviews, Background checks…)
 * when it is scoped to a single job via `?jobId=`. Links back into that
 * job's workspace and lets the employer widen to every job.
 */
export function JobScopeStrip({ jobId, locale, onClear }: JobScopeStripProps) {
  const t = useTranslations("employerJobWorkspace");
  const { data: job } = useJobDetail(jobId);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border/60 bg-status-applied-bg/40 text-xs text-muted-foreground chip-pad">
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <BriefcaseBusiness className="h-3.5 w-3.5 shrink-0 text-status-applied" aria-hidden />
        <span>{t("scopedToJob")}</span>
        {job?.title ? <span className="truncate font-semibold text-foreground">{job.title}</span> : null}
      </span>
      <span className="ms-auto inline-flex items-center gap-1">
        <Button asChild variant="ghost" size="sm" className="h-9 rounded-lg px-2 text-xs sm:h-8">
          <Link href={`/${locale}/employer/jobs/${jobId}`}>{t("openThisJob")}</Link>
        </Button>
        <Button variant="ghost" size="sm" className="h-9 gap-1 rounded-lg px-2 text-xs sm:h-8" onClick={onClear}>
          <X className="h-3.5 w-3.5" aria-hidden /> {t("clearJobScope")}
        </Button>
      </span>
    </div>
  );
}
