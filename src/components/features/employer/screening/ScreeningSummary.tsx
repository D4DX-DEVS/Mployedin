"use client";

/**
 * How every applicant to one job answered its screening questions.
 *
 * Shown inside the job itself (Overview) and on Insights → Screening Answers.
 * It used to exist only on that Insights page, behind a job picker, so an
 * employer looking at a job had to leave it and pick the same job again to see
 * how its questions were answered (owner, 2026-11-11). One candidate's own
 * answers are a different view: Applications → the candidate.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { BarChart3, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

interface QuestionAnalytic {
  questionId: string;
  label: string;
  type: string;
  totalResponses: number;
  distribution?: Record<string, number>;
  sampleAnswers?: string[];
  numericStats?: { avg: number; min: number; max: number };
  dateStats?: { earliest: string; latest: string };
}

interface AnalyticsData {
  jobId: string;
  jobTitle: string;
  totalApplications: number;
  questions: QuestionAnalytic[];
}

interface ScreeningSummaryProps {
  jobId: string;
  /** Name the job above the questions: for a page that is not already about one job. */
  showJob?: boolean;
}

export function ScreeningSummary({ jobId, showJob = false }: ScreeningSummaryProps) {
  const t = useTranslations("employerScreening");
  const tc = useTranslations("employerCommon");
  const locale = useLocale();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/employers/screening-analytics?jobId=${encodeURIComponent(jobId)}`);
      if (res.ok) {
        setData((await res.json()) as AnalyticsData);
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
  }, [jobId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        {[1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />)}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="workspace-detail-empty">
        <div className="workspace-detail-empty-icon"><BarChart3 className="h-5 w-5" aria-hidden="true" /></div>
        <p className="text-sm font-semibold text-foreground">{t("noAnalytics")}</p>
        {error && <p className="mt-1 text-sm text-muted-foreground">{error}</p>}
        <Button variant="outline" className="mt-4 rounded-xl" onClick={() => { void load(); }}>
          {tc("tryAgain")}
        </Button>
      </div>
    );
  }

  if (data.questions.length === 0) {
    return (
      <div className="workspace-detail-empty">
        <div className="workspace-detail-empty-icon"><BarChart3 className="h-5 w-5" aria-hidden="true" /></div>
        <p className="text-sm font-semibold text-foreground">{t("noQuestionsOnJob")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("noQuestionsOnJobHint")}</p>
        <Button asChild variant="outline" className="mt-4 rounded-xl">
          <Link href={`/${locale}/employer/jobs/${data.jobId}/edit`}>{t("editJob")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      {/* Head: which job (when the page is not already about it), and how many applications answered. */}
      {showJob ? (
        <div className="flex items-center gap-3 border-b border-border pb-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
            <BarChart3 className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{data.jobTitle}</p>
            <p className="text-xs text-muted-foreground">{t("applicationsWithAnswers", { count: data.totalApplications })}</p>
          </div>
        </div>
      ) : (
        <p className="border-b border-border pb-3 text-xs text-muted-foreground">
          {t("applicationsWithAnswers", { count: data.totalApplications })}
        </p>
      )}

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

            {/* Distribution for choice questions */}
            {q.distribution && (
              <div className="space-y-2">
                {Object.entries(q.distribution)
                  .sort(([, a], [, b]) => b - a)
                  .map(([option, count]) => {
                    const pct = q.totalResponses > 0 ? Math.round((count / q.totalResponses) * 100) : 0;
                    return (
                      <div key={option} className="flex items-center gap-3">
                        <span className="w-24 truncate text-sm text-foreground sm:w-32">{option}</span>
                        <div className="h-6 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="flex h-full items-center rounded-full bg-primary/20 px-2"
                            style={{ width: `${Math.max(pct, 5)}%` }}
                          >
                            <span className="text-xs font-medium text-foreground">{pct}%</span>
                          </div>
                        </div>
                        <span className="w-10 text-end text-xs text-muted-foreground">{count}</span>
                      </div>
                    );
                  })}
              </div>
            )}

            {/* Numeric stats */}
            {q.numericStats && (
              <div className="flex flex-wrap gap-3">
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

            {/* Date range: same tiles as the numeric stats. A date question
                ("earliest start date") used to render its response count and
                nothing else. */}
            {q.dateStats && (
              <div className="flex flex-wrap gap-3">
                {[
                  { label: t("earliest"), value: q.dateStats.earliest },
                  { label: t("latest"), value: q.dateStats.latest },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-lg bg-muted px-4 py-2 text-center">
                    <p className="text-lg font-bold text-foreground">
                      {new Date(stat.value).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Sample answers for text questions */}
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
  );
}
