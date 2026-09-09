"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Users, Star, CalendarDays, BadgeCheck, FileText, CheckCircle2, type LucideIcon } from "lucide-react";
import { PIPELINE_STAGES, STAGE_LABEL_KEYS, type PipelineStage } from "@/lib/hiring/pipeline";
import type { JobHiringSummary } from "@/hooks/useJobHiringSummary";
import { formatCount } from "@/lib/ui/intlFormat";

export const STAGE_ICON: Record<PipelineStage, LucideIcon> = {
  applied: Users,
  shortlisted: Star,
  interview_scheduled: CalendarDays,
  selected: BadgeCheck,
  offer: FileText,
  hired: CheckCircle2,
};

const STAGE_ICON_CLASS: Record<PipelineStage, string> = {
  applied: "bg-primary/10 text-primary",
  shortlisted: "bg-emerald-50 text-emerald-700",
  interview_scheduled: "bg-violet-50 text-violet-700",
  selected: "bg-amber-50 text-amber-700",
  offer: "bg-sky-50 text-sky-700",
  hired: "bg-emerald-50 text-emerald-700",
};

interface HiringProgressProps {
  summary?: JobHiringSummary;
  jobHref: string;
}

/**
 * Overview "Hiring progress": total applicants plus one cell per canonical
 * stage, each opening the tab that actually holds those candidates.
 *
 * This is the only place the funnel is spelled out — the job header carries
 * just the job identity and the tabs carry their own counts.
 *
 * Two cells deliberately do not report a raw stage count, because a raw stage
 * count contradicted the tabs beside it:
 *  - Applied shows every applicant, not just those still sitting at `applied`.
 *    "Applied 0" next to "Applications 3" read as a bug, every time.
 *  - Interviewing counts candidates with an interview in flight, so it can no
 *    longer say 0 while the Interviews tab says 1 (which happens whenever
 *    someone moves a candidate back over a scheduled interview).
 */
export function HiringProgress({ summary, jobHref }: HiringProgressProps) {
  const t = useTranslations("employerJobWorkspace");
  const tp = useTranslations("hiringPipeline");
  const counts = summary?.statusCounts;

  return (
    <section aria-labelledby="job-progress-heading" className="card-base panel-body">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div>
          <h2 id="job-progress-heading" className="heading-section font-semibold text-foreground">{t("hiringProgressTitle")}</h2>
          <p className="text-xs text-muted-foreground">{t("hiringProgressHint")}</p>
        </div>
        {summary ? (
          <Link href={`${jobHref}/applications`} className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-2 hover:underline sm:min-h-0">
            {t("hiringProgressTotal", { count: summary.total })}
          </Link>
        ) : (
          <span className="h-4 w-24 animate-pulse rounded bg-muted/60" aria-hidden />
        )}
      </div>
      <ol className="grid grid-cols-3 gap-2 sm:grid-cols-6" aria-busy={!summary || undefined}>
        {PIPELINE_STAGES.map((stage) => {
          const Icon = STAGE_ICON[stage];
          const label = tp(STAGE_LABEL_KEYS[stage]);
          const count = !summary || !counts
            ? undefined
            : stage === "applied"
              ? summary.total
              : stage === "interview_scheduled"
                ? summary.interviews.interviewingCandidates
                : counts[stage] ?? 0;
          // Each cell opens where its candidates actually are: the whole list
          // for Applied, the Interviews tab for Interviewing, a stage filter
          // for the rest.
          const href = stage === "applied"
            ? `${jobHref}/applications`
            : stage === "interview_scheduled"
              ? `${jobHref}/interviews`
              : `${jobHref}/applications?status=${stage}`;
          return (
            <li key={stage} className="min-w-0">
              <Link
                href={href}
                aria-label={count === undefined ? label : t("boardColumnLabel", { stage: label, count })}
                className="flex min-h-11 flex-col items-center gap-1 rounded-xl border border-border/70 bg-background px-2 py-2 text-center transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${STAGE_ICON_CLASS[stage]}`} aria-hidden>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-lg font-semibold leading-none tabular-nums text-foreground">{count === undefined ? "—" : formatCount(count)}</span>
                <span className="truncate text-[11px] font-medium text-muted-foreground">{label}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
