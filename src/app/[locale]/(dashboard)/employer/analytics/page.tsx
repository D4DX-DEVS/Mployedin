"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { BarChart3, TrendingUp, Briefcase } from "lucide-react";

interface FunnelStage {
  stage: string;
  count: number;
}

interface TrendData {
  date: string;
  count: number;
}

interface TopJob {
  jobId: string;
  title: string;
  count: number;
}

interface ConversionMetrics {
  applied: number;
  shortlisted: number;
  interview: number;
  selected: number;
  hired: number;
}

interface AnalyticsData {
  funnel: FunnelStage[];
  trend: TrendData[];
  topJobs: TopJob[];
  conversion: ConversionMetrics;
}

const stageDisplayNames: Record<string, string> = {
  applied: "Applied",
  shortlisted: "Shortlisted",
  interview_scheduled: "Interview Scheduled",
  selected: "Selected",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

const stageColors: Record<string, string> = {
  applied: "bg-blue-500",
  shortlisted: "bg-indigo-500",
  interview_scheduled: "bg-purple-500",
  selected: "bg-amber-500",
  rejected: "bg-red-500",
  withdrawn: "bg-slate-400",
};

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Analytics · MPLOYEDIN";
  }, []);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/employers/analytics");
        if (!response.ok) {
          throw new Error("Failed to fetch analytics");
        }
        const json = (await response.json()) as AnalyticsData;
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="space-y-8">
        <PageHeader title="Analytics" description="Pipeline funnel, application trends & conversion metrics" />
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-8">
        <PageHeader title="Analytics" description="Pipeline funnel, application trends & conversion metrics" />
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-600">Error: {error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-8">
        <PageHeader title="Analytics" description="Pipeline funnel, application trends & conversion metrics" />
        <div className="text-center py-12">
          <p className="text-muted-foreground">No data available</p>
        </div>
      </div>
    );
  }

  // Calculate conversion percentages
  const conversionRates = {
    appliedToShortlisted: data.conversion.applied > 0 ? ((data.conversion.shortlisted / data.conversion.applied) * 100).toFixed(1) : "0",
    shortlistedToInterview: data.conversion.shortlisted > 0 ? ((data.conversion.interview / data.conversion.shortlisted) * 100).toFixed(1) : "0",
    interviewToSelected: data.conversion.interview > 0 ? ((data.conversion.selected / data.conversion.interview) * 100).toFixed(1) : "0",
    selectedToHired: data.conversion.selected > 0 ? ((data.conversion.hired / data.conversion.selected) * 100).toFixed(1) : "0",
    appliedToHired: data.conversion.applied > 0 ? ((data.conversion.hired / data.conversion.applied) * 100).toFixed(1) : "0",
  };

  // Get max count for funnel scaling
  const maxFunnelCount = Math.max(...data.funnel.map((f) => f.count), 1);

  // Get max count for trend scaling
  const maxTrendCount = Math.max(...data.trend.map((t) => t.count), 1);

  // Calculate total applications
  const totalApplications = data.conversion.applied;

  return (
    <div className="space-y-8">
      <PageHeader title="Analytics" description="Pipeline funnel, application trends & conversion metrics" />

      {/* Section A: Conversion Rate Cards */}
      <section>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Applied Card */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Applied</p>
                <p className="text-3xl font-bold text-blue-600 mt-2">{data.conversion.applied}</p>
              </div>
              <BarChart3 className="w-5 h-5 text-blue-400" />
            </div>
            <p className="text-xs text-slate-500 mt-3">100% of total</p>
          </div>

          {/* Shortlisted Card */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Shortlisted</p>
                <p className="text-3xl font-bold text-indigo-600 mt-2">{data.conversion.shortlisted}</p>
              </div>
              <TrendingUp className="w-5 h-5 text-indigo-400" />
            </div>
            <p className="text-xs text-slate-500 mt-3">{conversionRates.appliedToShortlisted}% from Applied</p>
          </div>

          {/* Interview Card */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Interview</p>
                <p className="text-3xl font-bold text-purple-600 mt-2">{data.conversion.interview}</p>
              </div>
              <TrendingUp className="w-5 h-5 text-purple-400" />
            </div>
            <p className="text-xs text-slate-500 mt-3">{conversionRates.shortlistedToInterview}% from Shortlisted</p>
          </div>

          {/* Selected Card */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Selected</p>
                <p className="text-3xl font-bold text-amber-600 mt-2">{data.conversion.selected}</p>
              </div>
              <TrendingUp className="w-5 h-5 text-amber-400" />
            </div>
            <p className="text-xs text-slate-500 mt-3">{conversionRates.interviewToSelected}% from Interview</p>
          </div>

          {/* Hired Card */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Hired</p>
                <p className="text-3xl font-bold text-green-600 mt-2">{data.conversion.hired}</p>
              </div>
              <TrendingUp className="w-5 h-5 text-green-400" />
            </div>
            <p className="text-xs text-slate-500 mt-3">{conversionRates.appliedToHired}% from Applied</p>
          </div>
        </div>
      </section>

      {/* Section B: Pipeline Funnel (Horizontal Bar Chart) */}
      <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-6 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-slate-600" />
          Pipeline Funnel
        </h2>

        {data.funnel.length === 0 ? (
          <p className="text-center text-slate-500 py-8">No application data available</p>
        ) : (
          <div className="space-y-5">
            {data.funnel.map((stage, idx) => {
              const percentage = (stage.count / maxFunnelCount) * 100;
              const displayName = stageDisplayNames[stage.stage] || stage.stage;
              const bgColor = stageColors[stage.stage] || "bg-slate-400";

              return (
                <div key={idx} className="flex items-center gap-4">
                  <div className="w-32 text-sm font-medium text-slate-700 truncate">{displayName}</div>
                  <div className="flex-1">
                    <div className="w-full h-10 bg-slate-100 rounded-md overflow-hidden">
                      <div className={`h-full ${bgColor} flex items-center justify-center transition-all`} style={{ width: `${percentage}%` }}>
                        {percentage > 10 && <span className="text-xs font-semibold text-white">{percentage.toFixed(0)}%</span>}
                      </div>
                    </div>
                  </div>
                  <div className="w-16 text-right text-sm font-semibold text-slate-900">{stage.count}</div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Section C: Daily Applications Trend (30 days) */}
      <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-6 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-slate-600" />
          Daily Applications (Last 30 Days)
        </h2>

        <div className="overflow-x-auto">
          <div className="inline-flex gap-2 pb-8 min-w-full">
            {data.trend.map((day, idx) => {
              const percentage = (day.count / maxTrendCount) * 100 || 0;
              const date = new Date(day.date);
              const dayOfMonth = date.getDate();

              return (
                <div key={idx} className="flex flex-col items-center gap-1">
                  {/* Count label (appears above if count > 0) */}
                  {day.count > 0 && <span className="text-xs font-medium text-slate-600 h-5">{day.count}</span>}

                  {/* Bar */}
                  <div className="w-6 h-40 bg-slate-100 rounded-sm flex flex-col-reverse overflow-hidden">
                    {percentage > 0 && (
                      <div
                        className="bg-blue-500 w-full transition-all"
                        style={{
                          height: `${Math.max(percentage, 5)}%`,
                        }}
                      />
                    )}
                  </div>

                  {/* Day label below */}
                  <span className="text-xs font-medium text-slate-600 mt-1">{dayOfMonth}</span>
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-xs text-slate-500 mt-4">Day of month shown on x-axis</p>
      </section>

      {/* Section D: Top Jobs Table */}
      <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-6 flex items-center gap-2">
          <Briefcase className="w-5 h-5 text-slate-600" />
          Top Jobs by Applications
        </h2>

        {data.topJobs.length === 0 ? (
          <p className="text-center text-slate-500 py-8">No job applications yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Job Title</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Applications</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">% of Total</th>
                </tr>
              </thead>
              <tbody>
                {data.topJobs.map((job, idx) => {
                  const percentage = totalApplications > 0 ? ((job.count / totalApplications) * 100).toFixed(1) : "0";

                  return (
                    <tr key={idx} className="border-b border-slate-200 hover:bg-slate-50">
                      <td className="py-3 px-4 text-slate-900 font-medium">{job.title}</td>
                      <td className="text-right py-3 px-4 text-slate-700 font-semibold">{job.count}</td>
                      <td className="text-right py-3 px-4 text-slate-600">{percentage}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
