"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { BarChart3, MessageSquare } from "lucide-react";

interface QuestionAnalytic {
  questionId: string;
  label: string;
  type: string;
  totalResponses: number;
  distribution?: Record<string, number>;
  sampleAnswers?: string[];
  numericStats?: { avg: number; min: number; max: number };
}

interface AnalyticsData {
  jobId: string;
  jobTitle: string;
  totalApplications: number;
  questions: QuestionAnalytic[];
}

export default function ScreeningAnalyticsPage() {
  const t = useTranslations("employerScreening");
  const tc = useTranslations("employerCommon");
  const locale = useLocale();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const fetchAnalytics = useCallback(async (jobId: string) => {
    if (!jobId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/employers/screening-analytics?jobId=${jobId}`);
      if (res.ok) {
        setData(await res.json());
      } else {
        // Keep the reason on the page: a toast alone left "No analytics" behind
        // with no hint that the request had failed.
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setData(null);
        setError(body?.error ? `${t("loadFailed")} (${body.error})` : t("loadFailed"));
      }
    } catch {
      setData(null);
      setError(t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (selectedJobId) fetchAnalytics(selectedJobId);
  }, [selectedJobId, fetchAnalytics]);

  return (
    <div className="page-container">
      <WorkspaceHeader title={t("title")} context={t("description")} />

      {/* Toolbar: the job picker only. Jobs without screening questions have
          nothing to show, so they never appear in the list. */}
      <div className="workspace-toolbar">
        <SearchableSelect
          className="workspace-toolbar-select h-11 rounded-xl border-border bg-background sm:h-10"
          value={selectedJobId}
          onValueChange={setSelectedJobId}
          placeholder={t("selectJob")}
          options={jobs.map((j) => ({ value: j._id, label: j.title }))}
          ariaLabel={t("selectJob")}
        />
      </div>

      <section className="workspace-panel-surface rounded-2xl panel-body">
        {loading ? (
          <div className="space-y-3" aria-busy="true">
            {[1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />)}
          </div>
        ) : error ? (
          <div className="workspace-detail-empty">
            <div className="workspace-detail-empty-icon"><BarChart3 className="h-5 w-5" aria-hidden="true" /></div>
            <p className="text-sm font-semibold text-foreground">{t("noAnalytics")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" className="mt-4 rounded-xl" onClick={() => fetchAnalytics(selectedJobId)}>
              {tc("tryAgain")}
            </Button>
          </div>
        ) : data && data.questions.length === 0 ? (
          <div className="workspace-detail-empty">
            <div className="workspace-detail-empty-icon"><BarChart3 className="h-5 w-5" aria-hidden="true" /></div>
            <p className="text-sm font-semibold text-foreground">{t("noQuestionsOnJob")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("noQuestionsOnJobHint")}</p>
            <Button asChild variant="outline" className="mt-4 rounded-xl">
              <Link href={`/${locale}/employer/jobs/${data.jobId}/edit`}>{t("editJob")}</Link>
            </Button>
          </div>
        ) : data ? (
          <>
            {/* Panel head: which job, and how many applications answered. */}
            <div className="flex items-center gap-3 border-b border-border pb-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
                <BarChart3 className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{data.jobTitle}</p>
                <p className="text-xs text-muted-foreground">{t("applicationsWithAnswers", { count: data.totalApplications })}</p>
              </div>
            </div>

            {/* One divided list of questions rather than a stack of cards. */}
            <div className="divide-y divide-border/70">
              {data.questions.map((q, idx) => (
                <div key={q.questionId} className="py-4 first:pt-3 last:pb-0">
                  <div className="mb-3 flex items-start gap-3">
                    <span className="rounded bg-primary/10 px-2 py-1 text-xs font-bold text-primary">{t("questionNumber", { number: idx + 1 })}</span>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{q.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{q.type.replace("_", " ")} • {t("responses", { count: q.totalResponses })}</p>
                    </div>
                  </div>

                  {/* Distribution Chart for choice questions */}
                  {q.distribution && (
                    <div className="space-y-2">
                      {Object.entries(q.distribution)
                        .sort(([, a], [, b]) => b - a)
                        .map(([option, count]) => {
                          const pct = q.totalResponses > 0 ? Math.round((count / q.totalResponses) * 100) : 0;
                          return (
                            <div key={option} className="flex items-center gap-3">
                              <span className="w-32 truncate text-sm text-foreground">{option}</span>
                              <div className="h-6 flex-1 overflow-hidden rounded-full bg-muted">
                                <div
                                  className="flex h-full items-center rounded-full bg-primary/20 px-2"
                                  style={{ width: `${Math.max(pct, 5)}%` }}
                                >
                                  <span className="text-xs font-medium text-foreground">{pct}%</span>
                                </div>
                              </div>
                              <span className="w-10 text-right text-xs text-muted-foreground">{count}</span>
                            </div>
                          );
                        })}
                    </div>
                  )}

                  {/* Numeric Stats */}
                  {q.numericStats && (
                    <div className="flex gap-3">
                      {[
                        { label: t("average"), value: q.numericStats.avg },
                        { label: t("min"), value: q.numericStats.min },
                        { label: t("max"), value: q.numericStats.max },
                      ].map((stat) => (
                        <div key={stat.label} className="rounded-lg bg-muted px-4 py-2 text-center">
                          <p className="text-lg font-bold text-foreground">{stat.value}</p>
                          <p className="text-xs text-muted-foreground">{stat.label}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Sample Answers for text */}
                  {q.sampleAnswers && q.sampleAnswers.length > 0 && (
                    <div className="space-y-2">
                      <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                        <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" /> {t("sampleResponses")}
                      </p>
                      {q.sampleAnswers.slice(0, 5).map((ans, i) => (
                        <div key={i} className="rounded-lg bg-muted/50 p-2 text-sm text-foreground">
                          &ldquo;{ans}&rdquo;
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="workspace-detail-empty">
            <div className="workspace-detail-empty-icon"><BarChart3 className="h-5 w-5" aria-hidden="true" /></div>
            {jobsLoaded && jobs.length === 0 ? (
              <>
                <p className="text-sm font-semibold text-foreground">{t("noJobsYet")}</p>
                <Button asChild className="mt-4 rounded-xl">
                  <Link href={`/${locale}/employer/jobs/ai-create`}>{t("postAJob")}</Link>
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-foreground">{selectedJobId ? t("noAnalytics") : t("selectJob")}</p>
                {!selectedJobId && <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>}
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
