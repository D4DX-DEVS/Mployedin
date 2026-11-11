"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { ScreeningSummary } from "@/components/features/employer/screening/ScreeningSummary";
import { BarChart3 } from "lucide-react";
import { StackedLabelled } from "@/components/shared/LabelledControl";

/**
 * Insights → Screening Answers: pick any job and see how its screening
 * questions were answered. The same summary also sits inside each job
 * (Overview), so this page is for comparing across jobs, not the only way in.
 */
export default function ScreeningAnalyticsPage() {
  const t = useTranslations("employerScreening");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [jobs, setJobs] = useState<{ _id: string; title: string; hasQuestions: boolean }[]>([]);
  const [jobsLoaded, setJobsLoaded] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState("");

  // Fetch employer's jobs
  useEffect(() => {
    (async () => {
      try {
        // `myJobs=true`: without it the jobs API returns the public active feed,
        // so the dropdown listed other employers' jobs and their analytics
        // request came back 404 ("Job not found or unauthorized").
        const res = await fetch("/api/jobs?limit=100&myJobs=true");
        if (res.ok) {
          const d = await res.json();
          // Every job is listed: a job without screening questions gets a
          // clear explanation (and an edit link) instead of vanishing from the
          // picker, which read as "no jobs" to employers who had plenty.
          const jobList = (d.jobs ?? d.items ?? []).map((j: Record<string, unknown>) => ({
            _id: String(j._id),
            title: j.title as string,
            hasQuestions: ((j.screeningQuestions as unknown[] | undefined)?.length ?? 0) > 0,
          }));
          setJobs(jobList);
        } else {
          toast.error(t("loadJobsFailed"));
        }
      } catch {
        toast.error(t("loadJobsFailed"));
      } finally {
        setJobsLoaded(true);
      }
    })();
  }, [t]);

  return (
    <div className="page-container">
      <WorkspaceHeader title={t("title")} context={t("description")} />

      {/* Toolbar: the job picker only. Every job is listed, so the list itself
          has to say which ones have no questions — otherwise the only way to
          find out is to select each job in turn and read the same empty state.
          The trigger keeps the bare title; the marker belongs in the list. */}
      <div className="workspace-toolbar">
        <StackedLabelled label={tCommon("job")} className="workspace-toolbar-select sm:basis-[26rem]">
          {(id) => (
            <SearchableSelect
              id={id}
              className="w-full h-11 rounded-xl border-border bg-background sm:h-10"
              value={selectedJobId}
              onValueChange={setSelectedJobId}
              placeholder={t("selectJob")}
              options={jobs.map((j) => ({
                value: j._id,
                label: j.hasQuestions ? j.title : t("optionNoQuestions", { title: j.title }),
                triggerLabel: j.title,
              }))}
              ariaLabel={t("selectJob")}
            />
          )}
        </StackedLabelled>
      </div>

      <section className="workspace-panel-surface rounded-2xl panel-body">
        {selectedJobId ? (
          // Keyed on the job: a new pick starts from the loading state, never
          // from the last job's answers.
          <ScreeningSummary key={selectedJobId} jobId={selectedJobId} showJob />
        ) : (
          <div className="workspace-detail-empty">
            <div className="workspace-detail-empty-icon"><BarChart3 className="h-5 w-5" aria-hidden="true" /></div>
            {jobsLoaded && jobs.length === 0 ? (
              <>
                <p className="text-sm font-semibold text-foreground">{t("noJobsYet")}</p>
                <Button asChild className="mt-4 rounded-xl">
                  <Link href={`/${locale}/employer/jobs/new`}>{t("postAJob")}</Link>
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-foreground">{t("selectJob")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
