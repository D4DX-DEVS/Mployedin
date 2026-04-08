"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAnalyticsOverview,
  useAnalyticsPipeline,
  useAnalyticsHistorical,
  useAnalyticsJobs,
  useAnalyticsResponseTime,
} from "@/hooks/useAnalytics";
import type {
  AnalyticsData,
  PipelineData,
  HistoricalData,
  PerformanceData,
  ResponseTimeData,
  JobPerformance,
} from "@/hooks/useAnalytics";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  BarChart3,
  TrendingUp,
  Briefcase,
  AlertTriangle,
  RefreshCw,
  Filter,
  Clock,
  ArrowDownRight,
  Users,
  Calendar,
  Eye,
  Zap,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";

/* ── Constants ── */

const STAGE_NAMES: Record<string, string> = {
  applied: "Applied",
  shortlisted: "Shortlisted",
  interview_scheduled: "Interview",
  selected: "Selected",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

const STAGE_COLORS: Record<string, string> = {
  applied: "#3b82f6",
  shortlisted: "#6366f1",
  interview_scheduled: "#8b5cf6",
  selected: "#f59e0b",
  offer: "#10b981",
  hired: "#059669",
  rejected: "#ef4444",
  withdrawn: "#94a3b8",
};

const SOURCE_COLORS: Record<string, string> = {
  easy_apply: "#3b82f6",
  full_form: "#8b5cf6",
  direct: "#10b981",
  auto_apply: "#f59e0b",
};

const FUNNEL_STAGES = [
  "applied",
  "shortlisted",
  "interview_scheduled",
  "offer",
  "hired",
];

const AUTO_REFRESH_MS = 60_000;

type TabKey = "pipeline" | "historical" | "performance" | "response";
type DateRange = "7d" | "30d" | "90d" | "180d" | "custom";

/* ── Component ── */

export default function AnalyticsPage() {
  const queryClient = useQueryClient();
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [activeTab, setActiveTab] = useState<TabKey>("pipeline");
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  // React Query hooks
  const overviewQuery = useAnalyticsOverview(activeTab === "pipeline");
  const pipelineQuery = useAnalyticsPipeline(
    selectedJobId,
    activeTab === "pipeline"
  );
  const historicalQuery = useAnalyticsHistorical(
    {
      range: dateRange,
      customStart: dateRange === "custom" ? customStart : undefined,
      customEnd: dateRange === "custom" ? customEnd : undefined,
    },
    activeTab === "historical"
  );
  const performanceQuery = useAnalyticsJobs(activeTab === "performance");
  const responseTimeQuery = useAnalyticsResponseTime(activeTab === "response");

  // Derive data from queries
  const data = overviewQuery.data ?? null;
  const pipeline = pipelineQuery.data ?? null;
  const historical = historicalQuery.data ?? null;
  const performance = performanceQuery.data ?? null;
  const responseTime = responseTimeQuery.data ?? null;

  const loading =
    (activeTab === "pipeline" &&
      (overviewQuery.isLoading || pipelineQuery.isLoading)) ||
    (activeTab === "historical" && historicalQuery.isLoading) ||
    (activeTab === "performance" && performanceQuery.isLoading) ||
    (activeTab === "response" && responseTimeQuery.isLoading);

  const error =
    overviewQuery.error ??
    pipelineQuery.error ??
    historicalQuery.error ??
    performanceQuery.error ??
    responseTimeQuery.error;

  const refreshing =
    overviewQuery.isFetching || pipelineQuery.isFetching;

  // Refresh handler
  const handleRefresh = () => {
    if (activeTab === "pipeline") {
      overviewQuery.refetch();
      pipelineQuery.refetch();
    } else if (activeTab === "historical") {
      historicalQuery.refetch();
    } else if (activeTab === "performance") {
      performanceQuery.refetch();
    } else {
      responseTimeQuery.refetch();
    }
    setLastRefresh(new Date());
  };

  useEffect(() => {
    document.title = "Analytics · MPLOYEDIN";
  }, []);

  /* ── Loading / Error ── */

  if (loading) {
    return (
      <div className="space-y-8">
        <PageHeader
          title="Analytics"
          description="Pipeline funnel, trends & historical insights"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm animate-pulse"
            >
              <div className="h-4 bg-slate-200 rounded w-20 mb-3" />
              <div className="h-8 bg-slate-200 rounded w-16 mb-2" />
              <div className="h-3 bg-slate-100 rounded w-24" />
            </div>
          ))}
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm animate-pulse">
          <div className="h-5 bg-slate-200 rounded w-40 mb-6" />
          <div className="h-64 bg-slate-100 rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-8">
        <PageHeader
          title="Analytics"
          description="Pipeline funnel, trends & historical insights"
        />
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-600">
            Error: {error instanceof Error ? error.message : String(error)}
          </p>
          <button
            onClick={handleRefresh}
            className="mt-2 text-sm text-red-700 underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with tabs + refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader
          title="Analytics"
          description="Pipeline funnel, trends & historical insights"
        />
        <div className="flex items-center gap-3">
          {/* Refresh */}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
            title="Refresh now"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
            />
            <span className="hidden sm:inline">
              {lastRefresh.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </button>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab("pipeline")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === "pipeline"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <BarChart3 className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
          Pipeline
        </button>
        <button
          onClick={() => setActiveTab("historical")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === "historical"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Clock className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
          Historical
        </button>
        <button
          onClick={() => setActiveTab("performance")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === "performance"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Eye className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
          Performance
        </button>
        <button
          onClick={() => setActiveTab("response")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === "response"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Zap className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
          Response Time
        </button>
      </div>

      {activeTab === "pipeline" && data && pipeline && (
        <PipelineTab
          data={data}
          pipeline={pipeline}
          selectedJobId={selectedJobId}
          setSelectedJobId={setSelectedJobId}
        />
      )}

      {activeTab === "historical" && historical && (
        <HistoricalTab
          historical={historical}
          dateRange={dateRange}
          setDateRange={setDateRange}
          customStart={customStart}
          setCustomStart={setCustomStart}
          customEnd={customEnd}
          setCustomEnd={setCustomEnd}
        />
      )}

      {activeTab === "performance" && performance && (
        <PerformanceTab performance={performance} />
      )}

      {activeTab === "response" && responseTime && (
        <ResponseTimeTab data={responseTime} />
      )}

      {/* Auto-refresh footer */}
      {activeTab === "pipeline" && (
        <p className="text-xs text-slate-400 text-center">
          Auto-refreshes every 60 seconds
        </p>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Pipeline Tab (existing functionality)
   ══════════════════════════════════════════════════════════════════ */

function PipelineTab({
  data,
  pipeline,
  selectedJobId,
  setSelectedJobId,
}: {
  data: AnalyticsData;
  pipeline: PipelineData;
  selectedJobId: string;
  setSelectedJobId: (id: string) => void;
}) {
  const conversionRates = {
    appliedToShortlisted:
      data.conversion.applied > 0
        ? ((data.conversion.shortlisted / data.conversion.applied) * 100).toFixed(1)
        : "0",
    shortlistedToInterview:
      data.conversion.shortlisted > 0
        ? ((data.conversion.interview / data.conversion.shortlisted) * 100).toFixed(1)
        : "0",
    interviewToSelected:
      data.conversion.interview > 0
        ? ((data.conversion.selected / data.conversion.interview) * 100).toFixed(1)
        : "0",
    selectedToHired:
      data.conversion.selected > 0
        ? ((data.conversion.hired / data.conversion.selected) * 100).toFixed(1)
        : "0",
    appliedToHired:
      data.conversion.applied > 0
        ? ((data.conversion.hired / data.conversion.applied) * 100).toFixed(1)
        : "0",
  };

  const funnelChartData = FUNNEL_STAGES.map((stage) => {
    const found = pipeline.stageDistribution.find((s) => s.stage === stage);
    return {
      stage: STAGE_NAMES[stage] || stage,
      count: found?.count ?? 0,
      fill: STAGE_COLORS[stage] || "#94a3b8",
    };
  });

  const trendChartData = data.trend.map((t) => {
    const d = new Date(t.date);
    return {
      date: `${d.getMonth() + 1}/${d.getDate()}`,
      fullDate: t.date,
      count: t.count,
    };
  });

  const jobOptions = pipeline.perJob;
  const totalApplications = data.conversion.applied;

  return (
    <>
      {/* Job filter */}
      {jobOptions.length > 0 && (
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={selectedJobId}
            onChange={(e) => setSelectedJobId(e.target.value)}
            className="text-sm border border-slate-300 rounded-md px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All Jobs</option>
            {jobOptions.map((j) => (
              <option key={j.jobId} value={j.jobId}>
                {j.title} ({j.total})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Stalled Candidates Alert */}
      {pipeline.stalledCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {pipeline.stalledCount} stalled candidate
              {pipeline.stalledCount > 1 ? "s" : ""}
            </p>
            <p className="text-sm text-amber-700 mt-0.5">
              These applications have had no activity for 7+ days. Review them
              to keep your pipeline moving.
            </p>
          </div>
        </div>
      )}

      {/* Conversion Rate Cards */}
      <section>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <ConversionCard label="Applied" count={data.conversion.applied} subtitle="100% of total" color="blue" />
          <ConversionCard label="Shortlisted" count={data.conversion.shortlisted} subtitle={`${conversionRates.appliedToShortlisted}% from Applied`} color="indigo" />
          <ConversionCard label="Interview" count={data.conversion.interview} subtitle={`${conversionRates.shortlistedToInterview}% from Shortlisted`} color="purple" />
          <ConversionCard label="Selected" count={data.conversion.selected} subtitle={`${conversionRates.interviewToSelected}% from Interview`} color="amber" />
          <ConversionCard label="Hired" count={data.conversion.hired} subtitle={`${conversionRates.appliedToHired}% overall hire rate`} color="green" />
        </div>
      </section>

      {/* Pipeline Funnel */}
      <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-6 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-slate-600" />
          Pipeline Funnel
        </h2>

        {funnelChartData.every((d) => d.count === 0) ? (
          <p className="text-center text-slate-500 py-8">No application data available</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={funnelChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="stage" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} />
              <YAxis tick={{ fontSize: 12, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px" }} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={60}>
                {funnelChartData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}

        {/* Conversion rates */}
        <div className="mt-4 flex flex-wrap gap-3">
          <RateBadge label="Applied → Shortlisted" value={pipeline.conversionRates.appliedToShortlisted} />
          <RateBadge label="Shortlisted → Interview" value={pipeline.conversionRates.shortlistedToInterview} />
          <RateBadge label="Interview → Offer" value={pipeline.conversionRates.interviewToOffer} />
          <RateBadge label="Offer → Hired" value={pipeline.conversionRates.offerToHired} />
          <RateBadge label="Overall Hire Rate" value={pipeline.conversionRates.overallHireRate} highlight />
        </div>
      </section>

      {/* Application Trend */}
      <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-6 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-slate-600" />
          Daily Applications (Last 30 Days)
        </h2>

        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={trendChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} interval={Math.floor(trendChartData.length / 8)} />
            <YAxis tick={{ fontSize: 12, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} allowDecimals={false} />
            <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px" }} labelFormatter={(label) => `Date: ${label}`} />
            <Area type="monotone" dataKey="count" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
          </AreaChart>
        </ResponsiveContainer>
      </section>

      {/* Per-Job Breakdown */}
      {pipeline.perJob.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-6 flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-slate-600" />
            Per-Job Pipeline Breakdown
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Job Title</th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-700">Total</th>
                  {FUNNEL_STAGES.map((s) => (
                    <th key={s} className="text-center py-3 px-4 font-semibold text-slate-700">{STAGE_NAMES[s]}</th>
                  ))}
                  <th className="text-center py-3 px-4 font-semibold text-slate-700">Rejected</th>
                </tr>
              </thead>
              <tbody>
                {pipeline.perJob.map((job) => (
                  <tr key={job.jobId} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4 text-slate-900 font-medium max-w-[200px] truncate">{job.title}</td>
                    <td className="text-center py-3 px-4 text-slate-800 font-bold">{job.total}</td>
                    {FUNNEL_STAGES.map((stage) => {
                      const stageCount = job.stages.find((s) => s.status === stage)?.count ?? 0;
                      return (
                        <td key={stage} className="text-center py-3 px-4 text-slate-600">
                          {stageCount > 0 ? (
                            <span className="inline-block min-w-[28px] px-2 py-0.5 rounded-full text-xs font-semibold text-white" style={{ backgroundColor: STAGE_COLORS[stage] }}>{stageCount}</span>
                          ) : (
                            <span className="text-slate-300">0</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="text-center py-3 px-4 text-slate-600">
                      {(() => {
                        const c = job.stages.find((s) => s.status === "rejected")?.count ?? 0;
                        return c > 0 ? (
                          <span className="inline-block min-w-[28px] px-2 py-0.5 rounded-full text-xs font-semibold text-white bg-red-500">{c}</span>
                        ) : (
                          <span className="text-slate-300">0</span>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Top Jobs Table */}
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
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Historical Tab (Phase 6.2)
   ══════════════════════════════════════════════════════════════════ */

function HistoricalTab({
  historical,
  dateRange,
  setDateRange,
  customStart,
  setCustomStart,
  customEnd,
  setCustomEnd,
}: {
  historical: HistoricalData;
  dateRange: DateRange;
  setDateRange: (r: DateRange) => void;
  customStart: string;
  setCustomStart: (v: string) => void;
  customEnd: string;
  setCustomEnd: (v: string) => void;
}) {
  const trendChartData = historical.trend.map((t) => {
    const d = new Date(t.date);
    return {
      date: `${d.getMonth() + 1}/${d.getDate()}`,
      fullDate: t.date,
      count: t.count,
    };
  });

  const sourceChartData = historical.sourceBreakdown.map((s) => ({
    name: s.label,
    value: s.count,
    fill: SOURCE_COLORS[s.source] || "#94a3b8",
  }));

  return (
    <>
      {/* Date Range Picker */}
      <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Calendar className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-medium text-slate-700">Period:</span>
          {(["7d", "30d", "90d", "180d"] as DateRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setDateRange(r)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                dateRange === r
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {r === "7d" ? "7 Days" : r === "30d" ? "30 Days" : r === "90d" ? "90 Days" : "180 Days"}
            </button>
          ))}
          <button
            onClick={() => setDateRange("custom")}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              dateRange === "custom"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Custom
          </button>
          {dateRange === "custom" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="text-sm border border-slate-300 rounded-md px-2 py-1.5"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="text-sm border border-slate-300 rounded-md px-2 py-1.5"
              />
            </div>
          )}
          <span className="text-xs text-slate-400 ml-auto">
            {historical.dateRange.start} — {historical.dateRange.end} · {historical.totalApplications} applications
          </span>
        </div>
      </section>

      {/* Application Trend (with date range) */}
      <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-6 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-slate-600" />
          Applications Over Time
        </h2>

        {trendChartData.length === 0 ? (
          <p className="text-center text-slate-500 py-8">No data for this period</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={trendChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "#64748b" }}
                axisLine={{ stroke: "#e2e8f0" }}
                interval={Math.max(0, Math.floor(trendChartData.length / 10))}
              />
              <YAxis tick={{ fontSize: 12, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px" }}
                labelFormatter={(_, payload) => {
                  const item = payload?.[0]?.payload as { fullDate?: string } | undefined;
                  return item?.fullDate ? `Date: ${item.fullDate}` : "";
                }}
              />
              <Area type="monotone" dataKey="count" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </section>

      {/* Two-column: Source Distribution + Drop-off */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Source Distribution */}
        <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-6 flex items-center gap-2">
            <Users className="w-5 h-5 text-slate-600" />
            Application Sources
          </h2>

          {sourceChartData.length === 0 ? (
            <p className="text-center text-slate-500 py-8">No source data available</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={sourceChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={4}
                    dataKey="value"
                    label={({ name, percent }: { name?: string; percent?: number }) =>
                      `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {sourceChartData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px" }}
                    formatter={(value) => [value ?? 0, "Applications"]}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>

              {/* Source table */}
              <div className="mt-4 space-y-2">
                {historical.sourceBreakdown.map((s) => (
                  <div key={s.source} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: SOURCE_COLORS[s.source] || "#94a3b8" }}
                      />
                      <span className="text-slate-700">{s.label}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-slate-900">{s.count}</span>
                      <span className="text-slate-500 w-10 text-right">{s.pct}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {/* Drop-off Rates */}
        <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-6 flex items-center gap-2">
            <ArrowDownRight className="w-5 h-5 text-slate-600" />
            Stage Drop-off Rates
          </h2>

          {historical.dropOff.length === 0 ? (
            <p className="text-center text-slate-500 py-8">No data available</p>
          ) : (
            <div className="space-y-4">
              {historical.dropOff.map((d) => (
                <div key={d.stage}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-slate-700">
                      {d.stageName} → {d.nextStageName}
                    </span>
                    <span
                      className={`text-sm font-semibold ${
                        d.dropOffPct > 70
                          ? "text-red-600"
                          : d.dropOffPct > 40
                          ? "text-amber-600"
                          : "text-green-600"
                      }`}
                    >
                      {d.dropOffPct}% drop-off
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2.5">
                    <div
                      className={`h-2.5 rounded-full transition-all ${
                        d.dropOffPct > 70
                          ? "bg-red-400"
                          : d.dropOffPct > 40
                          ? "bg-amber-400"
                          : "bg-green-400"
                      }`}
                      style={{ width: `${100 - d.dropOffPct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-slate-400 mt-1">
                    <span>{d.count} at {d.stageName}</span>
                    <span>{d.nextCount} reached {d.nextStageName}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Time-to-Hire per Stage */}
      <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-6 flex items-center gap-2">
          <Clock className="w-5 h-5 text-slate-600" />
          Time-to-Hire by Stage
        </h2>

        {historical.timeToHire.length === 0 ? (
          <p className="text-center text-slate-500 py-8">
            Not enough status history data to calculate stage durations
          </p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={historical.timeToHire}
                margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="transition"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={{ stroke: "#e2e8f0" }}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "#64748b" }}
                  axisLine={{ stroke: "#e2e8f0" }}
                  label={{ value: "Days", angle: -90, position: "insideLeft", style: { fontSize: 12, fill: "#94a3b8" } }}
                />
                <Tooltip
                  contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px" }}
                  formatter={(value, name) => {
                    if (name === "avgDays") return [`${value} days`, "Avg"];
                    if (name === "medianDays") return [`${value} days`, "Median"];
                    return [value ?? 0, name ?? ""];
                  }}
                />
                <Bar dataKey="avgDays" name="avgDays" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={50} />
                <Bar dataKey="medianDays" name="medianDays" fill="#a5b4fc" radius={[4, 4, 0, 0]} maxBarSize={50} />
              </BarChart>
            </ResponsiveContainer>

            {/* Detail table */}
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Stage Transition</th>
                    <th className="text-right py-3 px-4 font-semibold text-slate-700">Avg Days</th>
                    <th className="text-right py-3 px-4 font-semibold text-slate-700">Median Days</th>
                    <th className="text-right py-3 px-4 font-semibold text-slate-700">Transitions</th>
                  </tr>
                </thead>
                <tbody>
                  {historical.timeToHire.map((t) => (
                    <tr key={t.transition} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-4 text-slate-900 font-medium">{t.transition}</td>
                      <td className="text-right py-3 px-4 text-slate-700 font-semibold">{t.avgDays}</td>
                      <td className="text-right py-3 px-4 text-slate-600">{t.medianDays}</td>
                      <td className="text-right py-3 px-4 text-slate-500">{t.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* Per-Job Time-to-Hire */}
      {historical.perJobTimeToHire.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-6 flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-slate-600" />
            Time-in-Stage by Job
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Job</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Transition</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Avg Days</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Count</th>
                </tr>
              </thead>
              <tbody>
                {historical.perJobTimeToHire.map((job) =>
                  job.stages.map((s, idx) => (
                    <tr
                      key={`${job.jobId}-${s.transition}`}
                      className="border-b border-slate-100 hover:bg-slate-50"
                    >
                      {idx === 0 && (
                        <td
                          className="py-3 px-4 text-slate-900 font-medium max-w-[200px] truncate"
                          rowSpan={job.stages.length}
                        >
                          {job.title}
                        </td>
                      )}
                      <td className="py-3 px-4 text-slate-700">{s.transition}</td>
                      <td className="text-right py-3 px-4 text-slate-700 font-semibold">
                        <span
                          className={`${
                            s.avgDays > 7
                              ? "text-red-600"
                              : s.avgDays > 3
                              ? "text-amber-600"
                              : "text-green-600"
                          }`}
                        >
                          {s.avgDays}
                        </span>
                      </td>
                      <td className="text-right py-3 px-4 text-slate-500">{s.count}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Performance Tab (Phase 6.3)
   ══════════════════════════════════════════════════════════════════ */

function PerformanceTab({ performance }: { performance: PerformanceData }) {
  const { jobs, summary } = performance;

  return (
    <>
      {/* Summary Cards */}
      <section>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
          <SummaryCard label="Total Jobs" value={summary.totalJobs} />
          <SummaryCard label="Active" value={summary.activeJobs} color="green" />
          <SummaryCard label="Views" value={summary.totalViews} color="blue" />
          <SummaryCard label="Unique Views" value={summary.totalUniqueViews} color="indigo" />
          <SummaryCard label="Applications" value={summary.totalApplications} color="purple" />
          <SummaryCard label="Conversion" value={`${summary.overallConversion}%`} color="amber" />
          <SummaryCard
            label="Underperforming"
            value={summary.underperforming}
            color={summary.underperforming > 0 ? "red" : "green"}
          />
        </div>
      </section>

      {/* Job Performance Table */}
      <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-6 flex items-center gap-2">
          <Eye className="w-5 h-5 text-slate-600" />
          Job Performance Breakdown
        </h2>

        {jobs.length === 0 ? (
          <p className="text-center text-slate-500 py-8">No jobs created yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Job Title</th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-700">Status</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Views</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Unique</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Applications</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Conv. Rate</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Avg Match</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Days Active</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.jobId} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4 text-slate-900 font-medium max-w-[200px] truncate">{job.title}</td>
                    <td className="text-center py-3 px-4">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          job.status === "active"
                            ? "bg-green-100 text-green-700"
                            : job.status === "closed"
                            ? "bg-slate-100 text-slate-600"
                            : job.status === "expired"
                            ? "bg-red-100 text-red-600"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {job.status}
                      </span>
                    </td>
                    <td className="text-right py-3 px-4 text-slate-700">{job.views}</td>
                    <td className="text-right py-3 px-4 text-slate-600">{job.uniqueViews}</td>
                    <td className="text-right py-3 px-4 text-slate-700 font-semibold">{job.applications}</td>
                    <td className="text-right py-3 px-4">
                      <span
                        className={`font-semibold ${
                          job.conversionRate >= 10
                            ? "text-green-600"
                            : job.conversionRate >= 3
                            ? "text-amber-600"
                            : "text-red-600"
                        }`}
                      >
                        {job.conversionRate}%
                      </span>
                    </td>
                    <td className="text-right py-3 px-4 text-slate-600">
                      {job.avgMatchScore > 0 ? `${job.avgMatchScore}%` : "—"}
                    </td>
                    <td className="text-right py-3 px-4 text-slate-500">{job.daysActive}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* AI Insights */}
      {jobs.some((j) => j.insight) && (
        <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Insights & Recommendations
          </h2>
          <div className="space-y-3">
            {jobs
              .filter((j) => j.insight)
              .map((job) => (
                <div
                  key={job.jobId}
                  className={`flex items-start gap-3 p-3 rounded-lg ${
                    job.insight?.includes("Excellent")
                      ? "bg-green-50 border border-green-200"
                      : "bg-amber-50 border border-amber-200"
                  }`}
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900">{job.title}</p>
                    <p className="text-sm text-slate-600 mt-0.5">{job.insight}</p>
                  </div>
                  <span className="text-xs text-slate-500 shrink-0">
                    {job.views} views · {job.applications} apps
                  </span>
                </div>
              ))}
          </div>
        </section>
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Response Time Tab (Phase 6.4)
   ══════════════════════════════════════════════════════════════════ */

function ResponseTimeTab({ data }: { data: ResponseTimeData }) {
  const { overall, commitment, perJob, distribution } = data;

  const formatHours = (h: number) => {
    if (h < 1) return "< 1 hour";
    if (h < 24) return `${Math.round(h)} hours`;
    const days = Math.round((h / 24) * 10) / 10;
    return `${days} day${days !== 1 ? "s" : ""}`;
  };

  return (
    <>
      {/* Overall Summary */}
      <section>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <p className="text-sm font-medium text-slate-600">Avg Response Time</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{formatHours(overall.avgHours)}</p>
            <p className="text-xs text-slate-500 mt-1">{overall.avgDays} days average</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <p className="text-sm font-medium text-slate-600">Median Response Time</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{formatHours(overall.medianHours)}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <p className="text-sm font-medium text-slate-600">Applications Measured</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{overall.totalMeasured}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <p className="text-sm font-medium text-slate-600">Your Commitment</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {commitment ? `${commitment} day${commitment > 1 ? "s" : ""}` : "Not set"}
            </p>
            {commitment && overall.avgDays > commitment && (
              <p className="text-xs text-red-600 mt-1 font-medium">⚠ Exceeding commitment</p>
            )}
            {commitment && overall.avgDays <= commitment && overall.totalMeasured > 0 && (
              <p className="text-xs text-green-600 mt-1 font-medium">✓ Meeting commitment</p>
            )}
          </div>
        </div>
      </section>

      {/* Distribution Chart */}
      <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-6 flex items-center gap-2">
          <Clock className="w-5 h-5 text-slate-600" />
          Response Time Distribution
        </h2>

        {distribution.every((d) => d.count === 0) ? (
          <p className="text-center text-slate-500 py-8">No response time data available yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={distribution} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} />
              <YAxis tick={{ fontSize: 12, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px" }} />
              <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={60} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>

      {/* Per-Job Response Time */}
      {perJob.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-6 flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-slate-600" />
            Response Time by Job
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Job Title</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Avg Response</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Median</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Measured</th>
                </tr>
              </thead>
              <tbody>
                {perJob.map((job) => (
                  <tr key={job.jobId} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4 text-slate-900 font-medium max-w-[250px] truncate">{job.title}</td>
                    <td className="text-right py-3 px-4">
                      <span
                        className={`font-semibold ${
                          job.avgHours > 168
                            ? "text-red-600"
                            : job.avgHours > 48
                            ? "text-amber-600"
                            : "text-green-600"
                        }`}
                      >
                        {formatHours(job.avgHours)}
                      </span>
                    </td>
                    <td className="text-right py-3 px-4 text-slate-600">{formatHours(job.medianHours)}</td>
                    <td className="text-right py-3 px-4 text-slate-500">{job.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

/* ── Sub-components ── */

const COLOR_MAP: Record<string, { text: string; icon: string }> = {
  blue: { text: "text-blue-600", icon: "text-blue-400" },
  indigo: { text: "text-indigo-600", icon: "text-indigo-400" },
  purple: { text: "text-purple-600", icon: "text-purple-400" },
  amber: { text: "text-amber-600", icon: "text-amber-400" },
  green: { text: "text-green-600", icon: "text-green-400" },
  red: { text: "text-red-600", icon: "text-red-400" },
};

function SummaryCard({
  label,
  value,
  color = "blue",
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  const colors = COLOR_MAP[color] || COLOR_MAP.blue;
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${colors.text}`}>{value}</p>
    </div>
  );
}

function ConversionCard({
  label,
  count,
  subtitle,
  color,
}: {
  label: string;
  count: number;
  subtitle: string;
  color: string;
}) {
  const colors = COLOR_MAP[color] || COLOR_MAP.blue;
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-600">{label}</p>
          <p className={`text-3xl font-bold mt-2 ${colors.text}`}>{count}</p>
        </div>
        <TrendingUp className={`w-5 h-5 ${colors.icon}`} />
      </div>
      <p className="text-xs text-slate-500 mt-3">{subtitle}</p>
    </div>
  );
}

function RateBadge({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full ${
        highlight
          ? "bg-green-100 text-green-800 font-semibold"
          : "bg-slate-100 text-slate-700"
      }`}
    >
      {label}: <strong>{value}%</strong>
    </span>
  );
}
