"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { PageHero } from "@/components/shared/PageHero";
import { BarChart3, FileQuestion, Hash, MessageSquare, PieChart } from "lucide-react";

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
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<{ _id: string; title: string }[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");

  // Fetch employer's jobs
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/jobs?limit=50&status=active");
        if (res.ok) {
          const d = await res.json();
          const jobList = (d.jobs ?? d.items ?? [])
            .filter((j: Record<string, unknown>) => (j.screeningQuestions as unknown[])?.length > 0)
            .map((j: Record<string, unknown>) => ({ _id: String(j._id), title: j.title as string }));
          setJobs(jobList);
        } else {
          toast.error(t("loadJobsFailed"));
        }
      } catch {
        toast.error(t("loadJobsFailed"));
      }
    })();
  }, [t]);

  const fetchAnalytics = useCallback(async (jobId: string) => {
    if (!jobId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/employers/screening-analytics?jobId=${jobId}`);
      if (res.ok) setData(await res.json());
      else toast.error(t("loadFailed"));
    } catch {
      toast.error(t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (selectedJobId) fetchAnalytics(selectedJobId);
  }, [selectedJobId, fetchAnalytics]);

  return (
    <div className="page-container">
      <PageHero icon={FileQuestion} title={t("title")} description={t("description")} />

      {/* Bare toolbar row, not a panel: the card wrapper and its bottom border
          framed a single dropdown with nothing underneath. */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {t("selectJob")}
        </p>
        <SearchableSelect
          className="min-w-0 flex-1 sm:w-64 sm:flex-none"
          value={selectedJobId}
          onValueChange={setSelectedJobId}
          placeholder={t("chooseJob")}
          options={jobs.map((j) => ({ value: j._id, label: j.title }))}
          aria-label={t("selectJob")}
        />
      </div>

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-32 bg-muted rounded-xl animate-pulse" />)}
        </div>
      )}

      {data && !loading && (
        <div className="space-y-3 sm:space-y-4">
          {/* Summary */}
          <div className="bg-card border border-border rounded-xl flex items-center gap-4 card-pad">
            <div className="p-2 bg-primary/10 rounded-lg">
              <BarChart3 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-medium text-foreground">{data.jobTitle}</p>
              <p className="text-sm text-muted-foreground">{t("applicationsWithAnswers", { count: data.totalApplications })}</p>
            </div>
          </div>

          {/* Per-Question Analytics */}
          {data.questions.map((q, idx) => (
            <div key={q.questionId} className="bg-card border border-border rounded-xl panel-body">
              <div className="flex items-start gap-3 mb-4">
                <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded">{t("questionNumber", { number: idx + 1 })}</span>
                <div>
                  <p className="font-medium text-foreground">{q.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{q.type.replace("_", " ")} • {t("responses", { count: q.totalResponses })}</p>
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
                          <span className="text-sm text-foreground w-32 truncate">{option}</span>
                          <div className="flex-1 bg-muted rounded-full h-6 overflow-hidden">
                            <div
                              className="h-full bg-primary/20 rounded-full flex items-center px-2"
                              style={{ width: `${Math.max(pct, 5)}%` }}
                            >
                              <span className="text-xs font-medium text-foreground">{pct}%</span>
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground w-10 text-right">{count}</span>
                        </div>
                      );
                    })}
                </div>
              )}

              {/* Numeric Stats */}
              {q.numericStats && (
                <div className="flex gap-4">
                  <div className="px-4 py-2 bg-muted rounded-lg text-center">
                    <p className="text-lg font-bold text-foreground">{q.numericStats.avg}</p>
                    <p className="text-xs text-muted-foreground">{t("average")}</p>
                  </div>
                  <div className="px-4 py-2 bg-muted rounded-lg text-center">
                    <p className="text-lg font-bold text-foreground">{q.numericStats.min}</p>
                    <p className="text-xs text-muted-foreground">{t("min")}</p>
                  </div>
                  <div className="px-4 py-2 bg-muted rounded-lg text-center">
                    <p className="text-lg font-bold text-foreground">{q.numericStats.max}</p>
                    <p className="text-xs text-muted-foreground">{t("max")}</p>
                  </div>
                </div>
              )}

              {/* Sample Answers for text */}
              {q.sampleAnswers && q.sampleAnswers.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <MessageSquare className="w-3.5 h-3.5" /> {t("sampleResponses")}
                  </p>
                  {q.sampleAnswers.slice(0, 5).map((ans, i) => (
                    <div key={i} className="p-2 bg-muted/50 rounded-lg text-sm text-foreground">
                      &ldquo;{ans}&rdquo;
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!data && !loading && selectedJobId && (
        <div className="text-center py-12 text-muted-foreground">{t("noAnalytics")}</div>
      )}
    </div>
  );
}
