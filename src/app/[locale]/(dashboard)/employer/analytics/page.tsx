"use client";

import { useEffect, useState } from "react";
import {
  useAnalyticsOverview,
  useAnalyticsPipeline,
  useAnalyticsHistorical,
  useAnalyticsJobs,
  useAnalyticsResponseTime,
  type AnalyticsData,
  type PipelineData,
  type HistoricalData,
  type PerformanceData,
  type ResponseTimeData,
} from "@/hooks/useAnalytics";
import { cn } from "@/lib/utils";
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
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

type DateRange = "7d" | "30d" | "90d" | "180d" | "custom";

const AUTO_REFRESH_MS = 30000;

const ANALYTICS_TABS = [
  { key: "pipeline" as const, label: "Pipeline", icon: BarChart3, description: "Live funnel health and conversion metrics" },
  { key: "historical" as const, label: "Historical", icon: TrendingUp, description: "Trends, drop-off, and time-to-hire benchmarks" },
  { key: "performance" as const, label: "Performance", icon: Eye, description: "Job-level visibility and application lift" },
  { key: "response" as const, label: "Response Time", icon: Clock, description: "Service-level tracking and commitment promises" },
];

const FUNNEL_STAGES = ["applied", "shortlisted", "interview", "offer", "hired"];

const STAGE_NAMES: Record<string, string> = {
  applied: "Applied",
  shortlisted: "Shortlisted",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
};

const STAGE_COLORS: Record<string, string> = {
  applied: "#3b82f6",
  shortlisted: "#6366f1",
  interview: "#8b5cf6",
  offer: "#f59e0b",
  hired: "#10b981",
  rejected: "#ef4444",
};

const SOURCE_COLORS: Record<string, string> = {
  direct: "#3b82f6",
  referral: "#10b981",
  linkedin: "#0a66c2",
  indeed: "#2164f3",
  other: "#94a3b8",
};

export default function EmployerAnalyticsPage() {
  const [activeTab, setActiveTab] = useState<typeof ANALYTICS_TABS[number]["key"]>("pipeline");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);

  const { data, error, isLoading, refetch: refetchOverview } = useAnalyticsOverview();
  const { data: pipeline, refetch: refetchPipeline } = useAnalyticsPipeline(selectedJobId);
  const { data: historical, refetch: refetchHistorical } = useAnalyticsHistorical(
    { range: dateRange, customStart, customEnd },
    activeTab === "historical"
  );
  const { data: performance, refetch: refetchPerformance } = useAnalyticsJobs(activeTab === "performance");
  const { data: responseTime, refetch: refetchResponseTime } = useAnalyticsResponseTime(activeTab === "response");

  const activeTabMeta = ANALYTICS_TABS.find((t) => t.key === activeTab) || ANALYTICS_TABS[0];

  const headlineMetrics =
    activeTab === "pipeline" && data && pipeline
      ? [
          {
            label: "Total Applied",
            value: data.conversion.applied,
            description: "All inbound applications",
            icon: Users,
            color: "blue",
          },
          {
            label: "In Pipeline",
            value: data.conversion.applied - data.conversion.hired - (pipeline.perJob.reduce((sum, j) => sum + (j.stages.find((s) => s.status === "rejected")?.count || 0), 0)),
            description: "Active candidates right now",
            icon: TrendingUp,
            color: "indigo",
          },
          {
            label: "Conversion Rate",
            value: `${pipeline.conversionRates.overallHireRate}%`,
            description: "End-to-end hire rate",
            icon: Zap,
            color: "purple",
          },
          {
            label: "Hired (All-Time)",
            value: data.conversion.hired,
            description: "Successful placements",
            icon: Sparkles,
            color: "green",
          },
        ]
      : [];

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const refreshActions: Promise<unknown>[] = [refetchOverview(), refetchPipeline()];

      if (activeTab === "historical") {
        refreshActions.push(refetchHistorical());
      }

      if (activeTab === "performance") {
        refreshActions.push(refetchPerformance());
      }

      if (activeTab === "response") {
        refreshActions.push(refetchResponseTime());
      }

      await Promise.all(refreshActions);
      setLastRefresh(new Date());
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (activeTab === "pipeline") {
      interval = setInterval(() => {
        refetchOverview();
        refetchPipeline();
        setLastRefresh(new Date());
      }, AUTO_REFRESH_MS);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeTab, refetchOverview, refetchPipeline]);

  if (isLoading) {
    return (
      <div className="page-container employer-legacy-surface space-y-6">
        <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
          <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">
            <Sparkles className="h-3.5 w-3.5" />
            Analytics workspace
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
            Analytics
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Pipeline funnel, trends, performance, and response-time insights in the same modern employer workspace.
          </p>
        </section>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-[120px] animate-pulse rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(248,250,252,0.94))] shadow-[0_24px_60px_-46px_rgba(15,23,42,0.35)]"
            />
          ))}
        </div>

        <div className="h-[360px] animate-pulse rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(248,250,252,0.96))] shadow-[0_24px_60px_-46px_rgba(15,23,42,0.35)]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-container employer-legacy-surface space-y-6">
        <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
          <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">
            <Sparkles className="h-3.5 w-3.5" />
            Analytics workspace
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
            Analytics
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Pipeline funnel, trends, performance, and response-time insights in the same modern employer workspace.
          </p>
        </section>

        <AnalyticsPanel className="border-red-500/20 bg-red-500/5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-500">
                Unable to load analytics
              </p>
              <p className="mt-2 text-sm leading-6 text-red-700 dark:text-red-200">
                Error: {error instanceof Error ? error.message : String(error)}
              </p>
            </div>
            <button
              onClick={handleRefresh}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-background/80 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-500/10 dark:text-red-200"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </button>
          </div>
        </AnalyticsPanel>
      </div>
    );
  }

  return (
    <div className="page-container employer-legacy-surface space-y-6">
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">
              <activeTabMeta.icon className="h-3.5 w-3.5" />
              {activeTabMeta.label}
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
              Analytics Command Center
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Review funnel health, hiring velocity, job-level performance, and response commitments from one cleaner employer workspace.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="workspace-glass-panel rounded-2xl px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                View Focus
              </p>
                <p className="mt-1 text-lg font-semibold text-foreground">{activeTabMeta.label}</p>
                <p className="text-xs text-muted-foreground">{activeTabMeta.description}</p>
            </div>
            <div className="workspace-glass-panel rounded-2xl px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Last Refresh
                  </p>
                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {lastRefresh.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {activeTab === "pipeline"
                      ? `Live pipeline checks auto-refresh every ${AUTO_REFRESH_MS / 1000} seconds.`
                      : "Manual refresh keeps this view current on demand."}
                  </p>
                </div>
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background/80 text-muted-foreground transition hover:border-sky-500/25 hover:text-sky-700 dark:hover:text-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
                  title="Refresh now"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        {headlineMetrics.length > 0 && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {headlineMetrics.map((metric) => (
              <HeroMetricCard
                key={metric.label}
                label={metric.label}
                value={metric.value}
                description={metric.description}
                icon={metric.icon}
                color={metric.color}
              />
            ))}
          </div>
        )}
      </section>

      <AnalyticsPanel className="p-3 sm:p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {ANALYTICS_TABS.map((tab) => {
              const Icon = tab.icon;

              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition",
                    activeTab === tab.key
                      ? "bg-slate-950 text-white shadow-[0_16px_36px_-28px_rgba(15,23,42,0.9)]"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Current Lens
            </p>
            <p className="mt-1 font-medium text-slate-900">{activeTabMeta.description}</p>
          </div>
        </div>
      </AnalyticsPanel>

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

      {activeTab === "pipeline" && (
        <p className="text-center text-xs text-muted-foreground">
          Live pipeline analytics refresh automatically every {AUTO_REFRESH_MS / 1000} seconds.
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
    <div className="space-y-6">
      {jobOptions.length > 0 && (
        <AnalyticsPanel>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <AnalyticsSectionHeader
              title="Pipeline scope"
              description="Focus this funnel on one role or keep the full portfolio visible."
              icon={Filter}
              eyebrow="Job filter"
            />
            <div className="min-w-full lg:min-w-[280px] xl:min-w-[340px]">
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Selected job
              </label>
              <select
                value={selectedJobId}
                onChange={(e) => setSelectedJobId(e.target.value)}
                className="w-full rounded-2xl border border-border bg-background/80 px-4 py-3 text-sm text-foreground shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100 dark:focus:ring-sky-500/20"
              >
                <option value="">All Jobs</option>
                {jobOptions.map((j) => (
                  <option key={j.jobId} value={j.jobId}>
                    {j.title} ({j.total})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </AnalyticsPanel>
      )}

      {pipeline.stalledCount > 0 && (
        <div className="rounded-[28px] border border-amber-200 bg-[linear-gradient(180deg,_rgba(255,251,235,0.98),_rgba(255,247,237,0.96))] p-5 shadow-[0_24px_60px_-46px_rgba(245,158,11,0.38)]">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-amber-100 p-3 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">
                Action needed
              </p>
              <p className="mt-2 text-lg font-semibold text-amber-950">
                {pipeline.stalledCount} stalled candidate{pipeline.stalledCount > 1 ? "s" : ""}
              </p>
              <p className="mt-1 text-sm leading-6 text-amber-800">
                These applications have had no activity for 7+ days. Review them to keep your pipeline moving.
              </p>
            </div>
          </div>
        </div>
      )}

      <section>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <ConversionCard label="Applied" count={data.conversion.applied} subtitle="100% of total" color="blue" />
          <ConversionCard label="Shortlisted" count={data.conversion.shortlisted} subtitle={`${conversionRates.appliedToShortlisted}% from Applied`} color="indigo" />
          <ConversionCard label="Interview" count={data.conversion.interview} subtitle={`${conversionRates.shortlistedToInterview}% from Shortlisted`} color="purple" />
          <ConversionCard label="Selected" count={data.conversion.selected} subtitle={`${conversionRates.interviewToSelected}% from Interview`} color="amber" />
          <ConversionCard label="Hired" count={data.conversion.hired} subtitle={`${conversionRates.appliedToHired}% overall hire rate`} color="green" />
        </div>
      </section>

      <AnalyticsPanel>
        <AnalyticsSectionHeader
          title="Pipeline Funnel"
          description="See how candidate volume compresses from first application to final hire."
          icon={BarChart3}
          eyebrow="Conversion"
        />

        {funnelChartData.every((d) => d.count === 0) ? (
          <p className="py-10 text-center text-slate-500">No application data available</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={funnelChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="stage" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} />
              <YAxis tick={{ fontSize: 12, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: "16px", border: "1px solid #e2e8f0", fontSize: "13px", boxShadow: "0 18px 45px -30px rgba(15, 23, 42, 0.4)" }} />
              <Bar dataKey="count" radius={[8, 8, 0, 0]} maxBarSize={60}>
                {funnelChartData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <RateBadge label="Applied → Shortlisted" value={pipeline.conversionRates.appliedToShortlisted} />
          <RateBadge label="Shortlisted → Interview" value={pipeline.conversionRates.shortlistedToInterview} />
          <RateBadge label="Interview → Offer" value={pipeline.conversionRates.interviewToOffer} />
          <RateBadge label="Offer → Hired" value={pipeline.conversionRates.offerToHired} />
          <RateBadge label="Overall Hire Rate" value={pipeline.conversionRates.overallHireRate} highlight />
        </div>
      </AnalyticsPanel>

      <AnalyticsPanel>
        <AnalyticsSectionHeader
          title="Daily Applications"
          description="Track inbound candidate momentum across the last 30 days."
          icon={TrendingUp}
          eyebrow="Trend"
        />

        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={trendChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} interval={Math.floor(trendChartData.length / 8)} />
            <YAxis tick={{ fontSize: 12, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} allowDecimals={false} />
            <Tooltip contentStyle={{ borderRadius: "16px", border: "1px solid #e2e8f0", fontSize: "13px", boxShadow: "0 18px 45px -30px rgba(15, 23, 42, 0.4)" }} labelFormatter={(label) => `Date: ${label}`} />
            <Area type="monotone" dataKey="count" stroke="#0ea5e9" fill="#38bdf8" fillOpacity={0.18} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
          </AreaChart>
        </ResponsiveContainer>
      </AnalyticsPanel>

      {pipeline.perJob.length > 0 && (
        <AnalyticsPanel className="overflow-hidden p-0">
          <div className="border-b border-border/60 px-5 py-5 sm:px-6">
            <AnalyticsSectionHeader
              title="Per-Job Pipeline Breakdown"
              description="Compare each role across the main funnel stages without leaving analytics."
              icon={Briefcase}
              eyebrow="Job detail"
              compact
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-background/60">
                  <th className="px-4 py-3 text-left font-semibold text-foreground/85">Job Title</th>
                  <th className="px-4 py-3 text-center font-semibold text-foreground/85">Total</th>
                  {FUNNEL_STAGES.map((s) => (
                    <th key={s} className="px-4 py-3 text-center font-semibold text-foreground/85">{STAGE_NAMES[s]}</th>
                  ))}
                  <th className="px-4 py-3 text-center font-semibold text-foreground/85">Rejected</th>
                </tr>
              </thead>
              <tbody>
                {pipeline.perJob.map((job) => (
                  <tr key={job.jobId} className="border-b border-border/40 transition hover:bg-background/60">
                    <td className="max-w-[240px] truncate px-4 py-3 font-medium text-foreground">{job.title}</td>
                    <td className="px-4 py-3 text-center text-base font-bold text-foreground">{job.total}</td>
                    {FUNNEL_STAGES.map((stage) => {
                      const stageCount = job.stages.find((s) => s.status === stage)?.count ?? 0;
                      return (
                        <td key={stage} className="px-4 py-3 text-center text-muted-foreground">
                          {stageCount > 0 ? (
                            <span className="inline-flex min-w-[30px] items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold text-white" style={{ backgroundColor: STAGE_COLORS[stage] }}>
                              {stageCount}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/60">0</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-center text-muted-foreground">
                      {(() => {
                        const count = job.stages.find((s) => s.status === "rejected")?.count ?? 0;
                        return count > 0 ? (
                          <span className="inline-flex min-w-[30px] items-center justify-center rounded-full bg-red-500 px-2 py-0.5 text-xs font-semibold text-white">
                            {count}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/60">0</span>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AnalyticsPanel>
      )}

      <AnalyticsPanel className="overflow-hidden p-0">
        <div className="border-b border-border/60 px-5 py-5 sm:px-6">
          <AnalyticsSectionHeader
            title="Top Jobs by Applications"
            description="Identify which roles currently attract the highest candidate attention."
            icon={Briefcase}
            eyebrow="Top roles"
            compact
          />
        </div>

        {data.topJobs.length === 0 ? (
          <p className="px-6 py-12 text-center text-slate-500">No job applications yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-background/60">
                  <th className="px-4 py-3 text-left font-semibold text-foreground/85">Job Title</th>
                  <th className="px-4 py-3 text-right font-semibold text-foreground/85">Applications</th>
                  <th className="px-4 py-3 text-right font-semibold text-foreground/85">% of Total</th>
                </tr>
              </thead>
              <tbody>
                {data.topJobs.map((job, idx) => {
                  const percentage = totalApplications > 0 ? ((job.count / totalApplications) * 100).toFixed(1) : "0";
                  return (
                    <tr key={idx} className="border-b border-border/40 transition hover:bg-background/60">
                      <td className="px-4 py-3 font-medium text-foreground">{job.title}</td>
                      <td className="px-4 py-3 text-right font-semibold text-foreground/85">{job.count}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{percentage}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AnalyticsPanel>
    </div>
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
    <div className="space-y-6">
      <AnalyticsPanel>
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-2xl bg-slate-100 p-2 text-slate-600">
            <Calendar className="h-4 w-4" />
          </div>
          <div className="mr-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Date range</p>
            <p className="mt-1 text-sm font-medium text-slate-900">Compare historical patterns over any hiring window.</p>
          </div>
          {(["7d", "30d", "90d", "180d"] as DateRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setDateRange(r)}
              className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                dateRange === r
                  ? "bg-slate-950 text-white shadow-[0_16px_36px_-28px_rgba(15,23,42,0.9)]"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {r === "7d" ? "7 Days" : r === "30d" ? "30 Days" : r === "90d" ? "90 Days" : "180 Days"}
            </button>
          ))}
          <button
            onClick={() => setDateRange("custom")}
            className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
              dateRange === "custom"
                ? "bg-slate-950 text-white shadow-[0_16px_36px_-28px_rgba(15,23,42,0.9)]"
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
                className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              />
            </div>
          )}
          <span className="ml-auto rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">
            {historical.dateRange.start} — {historical.dateRange.end} · {historical.totalApplications} applications
          </span>
        </div>
      </AnalyticsPanel>

      <AnalyticsPanel>
        <AnalyticsSectionHeader
          title="Applications Over Time"
          description="Spot trendlines, surges, and soft periods across the selected date range."
          icon={TrendingUp}
          eyebrow="Trend"
        />

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
                contentStyle={{ borderRadius: "16px", border: "1px solid #e2e8f0", fontSize: "13px", boxShadow: "0 18px 45px -30px rgba(15, 23, 42, 0.4)" }}
                labelFormatter={(_, payload) => {
                  const item = payload?.[0]?.payload as { fullDate?: string } | undefined;
                  return item?.fullDate ? `Date: ${item.fullDate}` : "";
                }}
              />
              <Area type="monotone" dataKey="count" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </AnalyticsPanel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AnalyticsPanel>
          <AnalyticsSectionHeader
            title="Application Sources"
            description="See which channels are contributing the most candidates."
            icon={Users}
            eyebrow="Attribution"
          />

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
                    contentStyle={{ borderRadius: "16px", border: "1px solid #e2e8f0", fontSize: "13px", boxShadow: "0 18px 45px -30px rgba(15, 23, 42, 0.4)" }}
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
        </AnalyticsPanel>

        <AnalyticsPanel>
          <AnalyticsSectionHeader
            title="Stage Drop-off Rates"
            description="Pinpoint where candidates are slipping out between major transitions."
            icon={ArrowDownRight}
            eyebrow="Leak points"
          />

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
        </AnalyticsPanel>
      </div>

      <AnalyticsPanel>
        <AnalyticsSectionHeader
          title="Time-to-Hire by Stage"
          description="Benchmark average and median time spent between key hiring transitions."
          icon={Clock}
          eyebrow="Speed"
        />

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
                  contentStyle={{ borderRadius: "16px", border: "1px solid #e2e8f0", fontSize: "13px", boxShadow: "0 18px 45px -30px rgba(15, 23, 42, 0.4)" }}
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

            <div className="mt-6 overflow-x-auto rounded-[24px] border border-slate-200">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80">
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
      </AnalyticsPanel>

      {historical.perJobTimeToHire.length > 0 && (
        <AnalyticsPanel className="overflow-hidden p-0">
          <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
            <AnalyticsSectionHeader
              title="Time-in-Stage by Job"
              description="Compare stage timing by role to identify roles that stall more often."
              icon={Briefcase}
              eyebrow="Job benchmark"
              compact
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80">
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
        </AnalyticsPanel>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Performance Tab (Phase 6.3)
   ══════════════════════════════════════════════════════════════════ */

function PerformanceTab({ performance }: { performance: PerformanceData }) {
  const { jobs, summary } = performance;

  return (
    <div className="space-y-6">
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

      <AnalyticsPanel className="overflow-hidden p-0">
        <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
          <AnalyticsSectionHeader
            title="Job Performance Breakdown"
            description="Review visibility, application lift, and conversion quality role by role."
            icon={Eye}
            eyebrow="Job performance"
            compact
          />
        </div>

        {jobs.length === 0 ? (
          <p className="px-6 py-12 text-center text-slate-500">No jobs created yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80">
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
                  <tr key={job.jobId} className="border-b border-slate-100 transition hover:bg-sky-50/40">
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
      </AnalyticsPanel>

      {jobs.some((j) => j.insight) && (
        <AnalyticsPanel>
          <AnalyticsSectionHeader
            title="Insights & Recommendations"
            description="Highlight listings that deserve a title, salary, or positioning adjustment."
            icon={AlertTriangle}
            eyebrow="Recommendations"
          />
          <div className="space-y-3">
            {jobs
              .filter((j) => j.insight)
              .map((job) => (
                <div
                  key={job.jobId}
                  className={`flex items-start gap-3 p-3 rounded-lg ${
                    job.insight?.includes("Excellent")
                      ? "border border-green-200 bg-green-50"
                      : "border border-amber-200 bg-amber-50"
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
        </AnalyticsPanel>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Response Time Tab (Phase 6.4)
   ══════════════════════════════════════════════════════════════════ */

function ResponseTimeTab({ data }: { data: ResponseTimeData }) {
  const { overall, commitment, perJob, distribution } = data;

  return (
    <div className="space-y-6">
      <section>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard label="Avg Response Time" value={formatHoursLabel(overall.avgHours)} description={`${overall.avgDays} days average`} color="blue" />
          <SummaryCard label="Median Response Time" value={formatHoursLabel(overall.medianHours)} description="Typical time to first action" color="indigo" />
          <SummaryCard label="Applications Measured" value={overall.totalMeasured} description="Rows included in this benchmark" color="purple" />
          <SummaryCard
            label="Your Commitment"
            value={
                 commitment ? `${commitment} day${commitment > 1 ? "s" : ""}` : "Not set"
            }
            description={
              commitment && overall.avgDays > commitment
                ? "Exceeding your public response promise"
                : commitment && overall.avgDays <= commitment && overall.totalMeasured > 0
                ? "Meeting your public response promise"
                : "Set a promise to display on public jobs"
            }
            color={
              commitment && overall.avgDays > commitment
                ? "red"
                : commitment && overall.avgDays <= commitment && overall.totalMeasured > 0
                ? "green"
                : "amber"
            }
          />
        </div>
      </section>

      <AnalyticsPanel>
        <AnalyticsSectionHeader
          title="Response Time Distribution"
          description="Understand how quickly employer actions happen across measured applications."
          icon={Clock}
          eyebrow="Distribution"
        />

        {distribution.every((d) => d.count === 0) ? (
          <p className="text-center text-slate-500 py-8">No response time data available yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={distribution} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} />
              <YAxis tick={{ fontSize: 12, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: "16px", border: "1px solid #e2e8f0", fontSize: "13px", boxShadow: "0 18px 45px -30px rgba(15, 23, 42, 0.4)" }} />
              <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={60} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </AnalyticsPanel>

      {perJob.length > 0 && (
        <AnalyticsPanel className="overflow-hidden p-0">
          <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
            <AnalyticsSectionHeader
              title="Response Time by Job"
              description="Spot which listings are moving quickly and which ones need closer follow-up discipline."
              icon={Briefcase}
              eyebrow="Job service level"
              compact
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80">
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Job Title</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Avg Response</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Median</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Measured</th>
                </tr>
              </thead>
              <tbody>
                {perJob.map((job) => (
                  <tr key={job.jobId} className="border-b border-slate-100 transition hover:bg-sky-50/40">
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
                        {formatHoursLabel(job.avgHours)}
                      </span>
                    </td>
                    <td className="text-right py-3 px-4 text-slate-600">{formatHoursLabel(job.medianHours)}</td>
                    <td className="text-right py-3 px-4 text-slate-500">{job.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AnalyticsPanel>
      )}
    </div>
  );
}

/* ── Sub-components ── */

const COLOR_MAP: Record<string, { text: string; icon: string; surface: string; border: string }> = {
  blue: { text: "text-sky-700", icon: "text-sky-600", surface: "bg-sky-50", border: "border-sky-100" },
  indigo: { text: "text-indigo-700", icon: "text-indigo-600", surface: "bg-indigo-50", border: "border-indigo-100" },
  purple: { text: "text-violet-700", icon: "text-violet-600", surface: "bg-violet-50", border: "border-violet-100" },
  amber: { text: "text-amber-700", icon: "text-amber-600", surface: "bg-amber-50", border: "border-amber-100" },
  green: { text: "text-emerald-700", icon: "text-emerald-600", surface: "bg-emerald-50", border: "border-emerald-100" },
  red: { text: "text-rose-700", icon: "text-rose-600", surface: "bg-rose-50", border: "border-rose-100" },
};

function formatHoursLabel(hours: number) {
  if (hours < 1) return "< 1 hour";
  if (hours < 24) return `${Math.round(hours)} hours`;
  const days = Math.round((hours / 24) * 10) / 10;
  return `${days} day${days !== 1 ? "s" : ""}`;
}

function AnalyticsPanel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "workspace-panel-surface rounded-[28px] p-5 sm:p-6",
        className
      )}
    >
      {children}
    </section>
  );
}

function AnalyticsSectionHeader({
  title,
  description,
  icon: Icon,
  eyebrow,
  compact = false,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  eyebrow?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("mb-6 flex items-start gap-4", compact && "mb-0")}>
      <div className="rounded-2xl bg-background/70 p-3 text-foreground/85">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {eyebrow}
          </p>
        )}
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function HeroMetricCard({
  label,
  value,
  description,
  icon: Icon,
  color = "blue",
}: {
  label: string;
  value: string | number;
  description: string;
  icon: LucideIcon;
  color?: string;
}) {
  const colors = COLOR_MAP[color] || COLOR_MAP.blue;

  return (
    <div className={cn("workspace-glass-panel rounded-2xl border p-4", colors.border)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <div className={cn("rounded-2xl p-2.5", colors.surface, colors.icon)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  description,
  color = "blue",
}: {
  label: string;
  value: string | number;
  description?: string;
  color?: string;
}) {
  const colors = COLOR_MAP[color] || COLOR_MAP.blue;
  return (
    <div className={cn("workspace-panel-surface rounded-[28px] border p-4", colors.border)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className={`mt-3 text-3xl font-semibold tracking-tight ${colors.text}`}>{value}</p>
      {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
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
    <div className={cn("workspace-panel-surface rounded-[28px] border p-4 transition-all hover:-translate-y-0.5", colors.border)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
          <p className={`mt-3 text-3xl font-semibold tracking-tight ${colors.text}`}>{count}</p>
        </div>
        <div className={cn("rounded-2xl p-2.5", colors.surface, colors.icon)}>
          <TrendingUp className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{subtitle}</p>
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
          ? "border border-emerald-200 bg-emerald-50 font-semibold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300"
          : "border border-border bg-background/80 text-foreground/85"
      }`}
    >
      {label}: <strong>{value}%</strong>
    </span>
  );
}
