"use client";

import { useState, useEffect, useCallback } from "react";
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
        }
      } catch { /* ignore */ }
    })();
  }, []);

  const fetchAnalytics = useCallback(async (jobId: string) => {
    if (!jobId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/employers/screening-analytics?jobId=${jobId}`);
      if (res.ok) setData(await res.json());
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedJobId) fetchAnalytics(selectedJobId);
  }, [selectedJobId, fetchAnalytics]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <FileQuestion className="w-6 h-6 text-primary" />
          Screening Questions Analytics
        </h1>
        <p className="text-muted-foreground mt-1">See how candidates are answering your screening questions</p>
      </div>

      {/* Job Selector */}
      <div className="bg-card border border-border rounded-xl p-4">
        <label className="text-sm font-medium text-foreground mb-2 block">Select a job with screening questions</label>
        <select
          value={selectedJobId}
          onChange={(e) => setSelectedJobId(e.target.value)}
          className="w-full max-w-md px-3 py-2 border border-border rounded-lg bg-background text-sm"
        >
          <option value="">Choose a job...</option>
          {jobs.map((j) => (
            <option key={j._id} value={j._id}>{j.title}</option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-32 bg-muted rounded-xl animate-pulse" />)}
        </div>
      )}

      {data && !loading && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="p-4 bg-card border border-border rounded-xl flex items-center gap-4">
            <div className="p-2 bg-primary/10 rounded-lg">
              <BarChart3 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-medium text-foreground">{data.jobTitle}</p>
              <p className="text-sm text-muted-foreground">{data.totalApplications} applications with screening answers</p>
            </div>
          </div>

          {/* Per-Question Analytics */}
          {data.questions.map((q, idx) => (
            <div key={q.questionId} className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-start gap-3 mb-4">
                <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded">Q{idx + 1}</span>
                <div>
                  <p className="font-medium text-foreground">{q.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{q.type.replace("_", " ")} • {q.totalResponses} responses</p>
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
                    <p className="text-xs text-muted-foreground">Average</p>
                  </div>
                  <div className="px-4 py-2 bg-muted rounded-lg text-center">
                    <p className="text-lg font-bold text-foreground">{q.numericStats.min}</p>
                    <p className="text-xs text-muted-foreground">Min</p>
                  </div>
                  <div className="px-4 py-2 bg-muted rounded-lg text-center">
                    <p className="text-lg font-bold text-foreground">{q.numericStats.max}</p>
                    <p className="text-xs text-muted-foreground">Max</p>
                  </div>
                </div>
              )}

              {/* Sample Answers for text */}
              {q.sampleAnswers && q.sampleAnswers.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <MessageSquare className="w-3.5 h-3.5" /> Sample Responses
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
        <div className="text-center py-12 text-muted-foreground">No analytics available for this job</div>
      )}
    </div>
  );
}
