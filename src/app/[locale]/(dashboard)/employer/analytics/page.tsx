"use client";

import { useEffect, useState } from "react";
import {
  useAnalyticsOverview,
  useAnalyticsPipeline,
  useAnalyticsHistorical,
  useAnalyticsJobs,
  useAnalyticsResponseTime,
  useAnalyticsOffers,
  useDiversityReport,
  type AnalyticsData,
  type PipelineData,
  type HistoricalData,
  type PerformanceData,
  type ResponseTimeData,
  type OfferAnalyticsData,
  type DiversityReportData,
} from "@/hooks/useAnalytics";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  TrendingUp,
  Briefcase,
  AlertTriangle,
  RefreshCw,
  Download,
  Filter,
  Clock,
  ArrowDownRight,
  Users,
  Calendar,
  Eye,
  Zap,
  Sparkles,
  Award,
  Search,
  ChevronLeft,
  ChevronRight,
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { PageHero } from "@/components/shared/PageHero";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";

type DateRange = "7d" | "30d" | "90d" | "180d" | "custom";

const AUTO_REFRESH_MS = 30000;

const PER_JOB_PAGE_SIZE = 10;

const ANALYTICS_TABS = [
  { key: "pipeline" as const, icon: BarChart3 },
  { key: "historical" as const, icon: TrendingUp },
  { key: "performance" as const, icon: Eye },
  { key: "response" as const, icon: Clock },
  { key: "offers" as const, icon: Award },
  { key: "diversity" as const, icon: Users },
];

const FUNNEL_STAGES = ["applied", "shortlisted", "interview", "offer", "hired"];

// UI stage keys → Application status values stored in the database
const STATUS_BY_STAGE: Record<string, string> = {
  applied: "applied",
  shortlisted: "shortlisted",
  interview: "interview_scheduled",
  offer: "offer",
  hired: "hired",
};

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

const OFFER_STATUS_COLORS: Record<string, string> = {
  accepted: "#10b981",
  pending: "#f59e0b",
  declined: "#ef4444",
  expired: "#94a3b8",
  withdrawn: "#6b7280",
  countered: "#6366f1",
};

const GENDER_COLORS: Record<string, string> = {
  male: "#3b82f6",
  female: "#ec4899",
  non_binary: "#8b5cf6",
  prefer_not_to_say: "#94a3b8",
};

export default function EmployerAnalyticsPage() {
  const [activeTab, setActiveTab] = useState<typeof ANALYTICS_TABS[number]["key"]>("pipeline");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [perJobPage, setPerJobPage] = useState(1);
  const [perJobSearchInput, setPerJobSearchInput] = useState("");
  const [perJobSearch, setPerJobSearch] = useState("");
  const t = useTranslations("employerAnalytics");
  const tc = useTranslations("employerCommon");

  // Debounce per-job search so we don't refetch on every keystroke
  useEffect(() => {
    const handle = setTimeout(() => {
      setPerJobSearch(perJobSearchInput.trim());
      setPerJobPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [perJobSearchInput]);

  const { data, error, isLoading, refetch: refetchOverview } = useAnalyticsOverview();
  const { data: pipeline, refetch: refetchPipeline } = useAnalyticsPipeline(selectedJobId, {
    page: perJobPage,
    pageSize: PER_JOB_PAGE_SIZE,
    q: perJobSearch,
  });
  const { data: historical, refetch: refetchHistorical } = useAnalyticsHistorical(
    { range: dateRange, customStart, customEnd },
    activeTab === "historical"
  );
  const { data: performance, refetch: refetchPerformance } = useAnalyticsJobs(activeTab === "performance");
  const { data: responseTime, refetch: refetchResponseTime } = useAnalyticsResponseTime(activeTab === "response");
  const { data: offerAnalytics, refetch: refetchOffers } = useAnalyticsOffers(activeTab === "offers");
  const { data: diversityReport, refetch: refetchDiversity } = useDiversityReport(activeTab === "diversity");

  const activeTabMeta = ANALYTICS_TABS.find((t) => t.key === activeTab) || ANALYTICS_TABS[0];

  // Only figures the funnel below does NOT already show. "Total applied" and
  // "Hired" lived here as well as in the Applied→Hired stage cards.
  const headlineMetrics =
    activeTab === "pipeline" && data && pipeline
      ? [
          {
            label: t("inPipeline"),
            value: Math.max(0, data.conversion.applied - data.conversion.hired - (pipeline.perJob.reduce((sum, j) => sum + (j.stages.find((s) => s.status === "rejected")?.count || 0), 0))),
            description: t("inPipelineDesc"),
            icon: TrendingUp,
            color: "indigo",
          },
          {
            label: t("conversionRate"),
            value: `${pipeline.conversionRates.overallHireRate}%`,
            description: t("conversionRateDesc"),
            icon: Zap,
            color: "purple",
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

      if (activeTab === "offers") {
        refreshActions.push(refetchOffers());
      }

      if (activeTab === "diversity") {
        refreshActions.push(refetchDiversity());
      }

      await Promise.all(refreshActions);
      setLastRefresh(new Date());
    } finally {
      setRefreshing(false);
    }
  };

  const handleExportCSV = () => {
    let csvRows: string[] = [];

    if (activeTab === "pipeline" && data && pipeline) {
      csvRows = [
        "Stage,Count,Conversion %",
        ...FUNNEL_STAGES.map((s) => {
          const count = (data.conversion as unknown as Record<string, number>)[s] ?? 0;
          const pct = data.conversion.applied > 0 ? ((count / data.conversion.applied) * 100).toFixed(1) : "0";
          return `${STAGE_NAMES[s] || s},${count},${pct}%`;
        }),
      ];
    } else if (activeTab === "historical" && historical) {
      csvRows = [
        "Date,Applications",
        ...(historical.trend ?? []).map((m) =>
          `${m.date},${m.count}`
        ),
      ];
    } else if (activeTab === "performance" && performance) {
      csvRows = [
        "Job Title,Views,Applications,Conversion %",
        ...(performance.jobs ?? []).map((j) =>
          `"${j.title}",${j.views},${j.applications},${j.conversionRate ?? "N/A"}%`
        ),
      ];
    } else {
      csvRows = ["No data available for export"];
    }

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics-${activeTab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
      <div className="page-container">
        <PageHero title={t("title")} description={t("description")} />

        <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="workspace-panel-surface h-[120px] animate-pulse rounded-3xl"
            />
          ))}
        </div>

        <div className="workspace-panel-surface h-[360px] animate-pulse rounded-3xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-container">
        <PageHero title={t("title")} description={t("description")} />

        <AnalyticsPanel className="border-red-500/20 bg-red-500/5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-500">
                {tc("somethingWentWrong")}
              </p>
              <p className="mt-2 text-sm leading-6 text-status-rejected">
                {t("loadError")}
              </p>
            </div>
            <button
              onClick={handleRefresh}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-background/80 px-4 py-2 text-sm font-semibold text-status-rejected transition hover:bg-red-500/10"
            >
              <RefreshCw className="h-4 w-4" />
              {tc("tryAgain")}
            </button>
          </div>
        </AnalyticsPanel>
      </div>
    );
  }

  return (
    <div className="page-container">
      <DashboardPageHeader
        icon={activeTabMeta.icon}
        title={t("title")}
        description={t("description")}
        summary={{
          label: t("viewFocus"),
          value: t(activeTabMeta.key === "response" ? "responseTime" : activeTabMeta.key),
          note: t(activeTabMeta.key === "response" ? "responseTimeDesc" : `${activeTabMeta.key}Desc`),
        }}
        actions={
          <>
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background/80 text-muted-foreground transition hover:border-sky-500/25 hover:text-status-applied disabled:cursor-not-allowed disabled:opacity-60"
                  title={t("refreshNow")}
                  aria-label={t("refreshNow")}
                >
                  <RefreshCw
                    className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                  />
                </button>
                <button
                  onClick={handleExportCSV}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background/80 text-muted-foreground transition hover:border-emerald-500/25 hover:text-status-selected"
                  title={t("exportCsv")}
                  aria-label={t("exportCsv")}
                >
                  <Download className="h-4 w-4" />
                </button>
          </>
        }
        metrics={headlineMetrics.map((metric) => ({
          label: metric.label,
          value: metric.value,
          note: metric.description,
          icon: metric.icon,
        }))}
        // Carries the date, not just the clock time: a bare "12:33" read the
        // next morning gives no way to tell yesterday's refresh from today's.
        footer={
          <span className="text-xs text-muted-foreground" suppressHydrationWarning title={lastRefresh.toLocaleString()}>
            {t("lastRefresh")}: {lastRefresh.toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </span>
        }
      />

      <AnalyticsPanel className="p-2 sm:p-4">
        <div className="flex flex-col gap-1.5 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {ANALYTICS_TABS.map((tab) => {
              const Icon = tab.icon;

              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-semibold transition sm:gap-2 sm:rounded-2xl sm:px-4 sm:py-2.5 sm:text-sm",
                    activeTab === tab.key
                      ? "bg-slate-950 text-white shadow-[0_16px_36px_-28px_rgba(15,23,42,0.9)]"
                      : "bg-secondary/75 text-muted-foreground hover:bg-slate-200 hover:text-foreground"
                  )}
                >
                  <Icon className="h-3 w-3 sm:h-4 sm:w-4" />
                  {t(tab.key === "response" ? "responseTime" : tab.key)}
                </button>
              );
            })}
          </div>

        </div>
      </AnalyticsPanel>

      {activeTab === "pipeline" && data && pipeline && (
        <PipelineTab
          data={data}
          pipeline={pipeline}
          selectedJobId={selectedJobId}
          setSelectedJobId={setSelectedJobId}
          perJobSearchInput={perJobSearchInput}
          setPerJobSearchInput={setPerJobSearchInput}
          perJobPage={perJobPage}
          setPerJobPage={setPerJobPage}
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
      {activeTab === "historical" && !historical && (
        <TabLoadingSkeleton />
      )}

      {activeTab === "performance" && performance && (
        <PerformanceTab performance={performance} />
      )}
      {activeTab === "performance" && !performance && (
        <TabLoadingSkeleton />
      )}

      {activeTab === "response" && responseTime && (
        <ResponseTimeTab data={responseTime} />
      )}
      {activeTab === "response" && !responseTime && (
        <TabLoadingSkeleton />
      )}

      {activeTab === "offers" && offerAnalytics && (
        <OffersTab data={offerAnalytics} />
      )}
      {activeTab === "offers" && !offerAnalytics && (
        <TabLoadingSkeleton />
      )}

      {activeTab === "diversity" && diversityReport && (
        <DiversityTab data={diversityReport} />
      )}
      {activeTab === "diversity" && !diversityReport && (
        <TabLoadingSkeleton />
      )}

      {activeTab === "pipeline" && (
        <p className="text-center text-xs text-muted-foreground">
          {t("liveRefresh")} {AUTO_REFRESH_MS / 1000} {t("seconds")}
        </p>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Tab Loading Skeleton
   ══════════════════════════════════════════════════════════════════ */

function TabLoadingSkeleton() {
  return (
    <div className="workspace-panel-surface rounded-3xl space-y-4 animate-pulse panel-body">
      <div className="h-5 w-48 bg-muted rounded" />
      <div className="grid gap-3 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-2xl bg-muted/60" />
        ))}
      </div>
      <div className="h-64 rounded-2xl bg-muted/40" />
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
  perJobSearchInput,
  setPerJobSearchInput,
  perJobPage,
  setPerJobPage,
}: {
  data: AnalyticsData;
  pipeline: PipelineData;
  selectedJobId: string;
  setSelectedJobId: (id: string) => void;
  perJobSearchInput: string;
  setPerJobSearchInput: (q: string) => void;
  perJobPage: number;
  setPerJobPage: (page: number) => void;
}) {
  const t = useTranslations("employerAnalytics");
  const tc = useTranslations("employerCommon");
  const locale = useLocale();
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
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
    const status = STATUS_BY_STAGE[stage] ?? stage;
    const found = (pipeline.funnel ?? []).find((s) => s.stage === status);
    return {
      stage: t(stage),
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

  const jobOptions = pipeline.jobOptions ?? [];
  const perJobMeta = pipeline.perJobMeta ?? { total: pipeline.perJob.length, page: 1, pageSize: PER_JOB_PAGE_SIZE, totalPages: 1 };
  const totalApplications = data.conversion.applied;

  return (
    <div className="space-y-6">
      {/* One row, not a panel with its own heading and paragraph — this is a
          single dropdown and the funnel below already says what it scopes. */}
      {jobOptions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Filter className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t("selectedJob")}
          </span>
          <SearchableSelect
            className="min-w-0 flex-1 sm:w-72 sm:flex-none"
            value={selectedJobId}
            onValueChange={setSelectedJobId}
            placeholder={t("allJobs")}
            options={[
              { value: "", label: t("allJobs") },
              ...jobOptions.map((j) => ({ value: j.jobId, label: `${j.title} (${j.total})` })),
            ]}
          />
        </div>
      )}

      {/* Compact alert row. Same warning, a third of the height — it used to
          get the same visual weight as the funnel it sits above. */}
      {pipeline.stalledCount > 0 && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-status-shortlisted/20 bg-status-shortlisted-bg/40 px-3 py-2.5 sm:gap-3 sm:px-4">
          <AlertTriangle className="h-4 w-4 shrink-0 text-status-shortlisted" aria-hidden="true" />
          <p className="min-w-0 text-xs leading-5 text-status-shortlisted sm:text-sm">
            <span className="font-semibold text-amber-950">
              {t("stalledCandidates", { count: pipeline.stalledCount })}
            </span>{" "}
            {t("stalledHint")}
          </p>
        </div>
      )}

      <section>
        {/* 5-across only from lg. At 390px five columns were 64px wide, which
            truncated every label and every conversion value on the page's
            primary metric. Max two columns below 480px. */}
        <div className="grid grid-cols-2 gap-3 min-[480px]:grid-cols-3 sm:gap-4 lg:grid-cols-5">
          <ConversionCard label={t("applied")} count={data.conversion.applied} subtitle={`100% ${t("ofTotal")}`} color="blue" />
          <ConversionCard label={t("shortlisted")} count={data.conversion.shortlisted} subtitle={`${conversionRates.appliedToShortlisted}% ${t("fromApplied")}`} color="indigo" />
          <ConversionCard label={t("interview")} count={data.conversion.interview} subtitle={`${conversionRates.shortlistedToInterview}% ${t("fromShortlisted")}`} color="purple" />
          <ConversionCard label={t("selected")} count={data.conversion.selected} subtitle={`${conversionRates.interviewToSelected}% ${t("fromInterview")}`} color="amber" />
          <ConversionCard label={t("hired")} count={data.conversion.hired} subtitle={`${conversionRates.appliedToHired}% ${t("overallHireRate")}`} color="green" />
        </div>
      </section>

      <AnalyticsPanel>
        <AnalyticsSectionHeader
          title={t("pipelineFunnel")}
          description={t("pipelineFunnelDesc")}
          icon={BarChart3}
          eyebrow={t("conversion")}
        />

        {funnelChartData.every((d) => d.count === 0) ? (
          <p className="py-10 text-center text-muted-foreground">{t("noApplicationData")}</p>
        ) : (
          <div className="h-[220px] sm:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="stage" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} allowDecimals={false} width={28} />
                <Tooltip contentStyle={{ borderRadius: "16px", border: "1px solid #e2e8f0", fontSize: "13px", boxShadow: "0 18px 45px -30px rgba(15, 23, 42, 0.4)" }} />
                <Bar dataKey="count" radius={[8, 8, 0, 0]} maxBarSize={60}>
                  {funnelChartData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-1.5 sm:mt-5 sm:gap-3">
          <RateBadge label={t("appliedToShortlisted")} value={pipeline.conversionRates.appliedToShortlisted} />
          <RateBadge label={t("shortlistedToInterview")} value={pipeline.conversionRates.shortlistedToInterview} />
          <RateBadge label={t("interviewToOffer")} value={pipeline.conversionRates.interviewToOffer} />
          <RateBadge label={t("offerToHired")} value={pipeline.conversionRates.offerToHired} />
          <RateBadge label={t("overallHireRate")} value={pipeline.conversionRates.overallHireRate} highlight />
        </div>
      </AnalyticsPanel>

      <AnalyticsPanel>
        <AnalyticsSectionHeader
          title={t("dailyApplications")}
          description={t("dailyApplicationsDesc")}
          icon={TrendingUp}
          eyebrow={t("trend")}
        />

        <div className="h-[200px] sm:h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} interval={Math.floor(trendChartData.length / 8)} />
              <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} allowDecimals={false} width={28} />
              <Tooltip contentStyle={{ borderRadius: "16px", border: "1px solid #e2e8f0", fontSize: "13px", boxShadow: "0 18px 45px -30px rgba(15, 23, 42, 0.4)" }} labelFormatter={(label) => `${t("dateLabel")}: ${label}`} />
              <Area type="monotone" dataKey="count" stroke="#0ea5e9" fill="#38bdf8" fillOpacity={0.18} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </AnalyticsPanel>

      {jobOptions.length > 0 && (
        <AnalyticsPanel className="overflow-hidden p-0">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 panel-head">
            <AnalyticsSectionHeader
              title={t("perJobBreakdown")}
              description={t("perJobBreakdownDesc")}
              icon={Briefcase}
              eyebrow={t("jobDetail")}
              compact
            />
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground sm:h-4 sm:w-4" />
              <input
                type="search"
                value={perJobSearchInput}
                onChange={(e) => setPerJobSearchInput(e.target.value)}
                placeholder={t("searchJobs")}
                aria-label={t("searchJobs")}
                className="w-full rounded-lg border border-border bg-background/80 py-1.5 pe-3 ps-8 text-xs text-foreground placeholder:text-muted-foreground focus:border-sky-500/40 focus:outline-none focus:ring-2 focus:ring-sky-500/20 sm:rounded-xl sm:py-2 sm:ps-9 sm:text-sm"
              />
            </div>
          </div>

          {/* Desktop: full comparison table */}
          <div className="hidden overflow-x-auto sm:block" tabIndex={0}>
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-background/60">
                  <th className="px-4 py-3 text-left font-semibold text-foreground/85">{t("jobTitle")}</th>
                  <th className="px-4 py-3 text-center font-semibold text-foreground/85">{t("total")}</th>
                  {FUNNEL_STAGES.map((s) => (
                    <th key={s} className="px-4 py-3 text-center font-semibold text-foreground/85">{t(s)}</th>
                  ))}
                  <th className="px-4 py-3 text-center font-semibold text-foreground/85">{t("rejected")}</th>
                </tr>
              </thead>
              <tbody>
                {pipeline.perJob.length === 0 && (
                  <tr>
                    <td colSpan={FUNNEL_STAGES.length + 3} className="px-4 py-10 text-center text-muted-foreground">
                      {t("noJobMatches")}
                    </td>
                  </tr>
                )}
                {pipeline.perJob.map((job) => (
                  <tr key={job.jobId} className="border-b border-border/40 transition hover:bg-background/60">
                    <td className="max-w-[240px] truncate px-4 py-3 font-medium text-foreground">
                      <Link
                        href={`/${locale}/employer/applications?jobId=${job.jobId}`}
                        title={t("viewApplications", { title: job.title })}
                        className="hover:text-status-applied hover:underline"
                      >
                        {job.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-center text-base font-bold text-foreground">{job.total}</td>
                    {FUNNEL_STAGES.map((stage) => {
                      const stageCount = job.stages.find((s) => s.status === (STATUS_BY_STAGE[stage] ?? stage))?.count ?? 0;
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

          {/* Mobile: tap a job to reveal its stages — a wide table would just force horizontal scroll */}
          <div className="divide-y divide-border/40 sm:hidden">
            {pipeline.perJob.length === 0 && (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t("noJobMatches")}</p>
            )}
            {pipeline.perJob.map((job) => {
              const isOpen = expandedJobId === job.jobId;
              const rejectedCount = job.stages.find((s) => s.status === "rejected")?.count ?? 0;
              return (
                <div key={job.jobId}>
                  <button
                    type="button"
                    onClick={() => setExpandedJobId(isOpen ? null : job.jobId)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
                  >
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{job.title}</span>
                    <span className="text-xs font-bold text-foreground">{job.total}</span>
                    <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
                  </button>
                  {isOpen && (
                    <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3">
                      {FUNNEL_STAGES.map((stage) => {
                        const stageCount = job.stages.find((s) => s.status === (STATUS_BY_STAGE[stage] ?? stage))?.count ?? 0;
                        return (
                          <span key={stage} className="inline-flex items-center gap-1 rounded-full border border-border bg-background/80 px-2 py-0.5 text-[11px] text-foreground/85">
                            {t(stage)}
                            <span
                              className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold text-white"
                              style={{ backgroundColor: stageCount > 0 ? STAGE_COLORS[stage] : "#94a3b8" }}
                            >
                              {stageCount}
                            </span>
                          </span>
                        );
                      })}
                      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background/80 px-2 py-0.5 text-[11px] text-foreground/85">
                        {t("rejected")}
                        <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-semibold text-white">{rejectedCount}</span>
                      </span>
                      <Link
                        href={`/${locale}/employer/applications?jobId=${job.jobId}`}
                        className="mt-1 block w-full text-[11px] font-semibold text-status-applied hover:underline"
                      >
                        {t("viewApplications", { title: job.title })}
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {perJobMeta.totalPages > 1 && (
            <div className="flex flex-col gap-2 border-t border-border/60 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-6 sm:py-4">
              <p className="text-[11px] text-muted-foreground sm:text-xs">
                {t("perJobShowing", {
                  from: (perJobMeta.page - 1) * perJobMeta.pageSize + 1,
                  to: Math.min(perJobMeta.page * perJobMeta.pageSize, perJobMeta.total),
                  total: perJobMeta.total,
                })}
              </p>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  onClick={() => setPerJobPage(Math.max(1, perJobPage - 1))}
                  disabled={perJobMeta.page <= 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-background/80 text-[11px] font-semibold text-foreground transition hover:border-sky-500/25 hover:text-status-applied disabled:cursor-not-allowed disabled:opacity-50 sm:rounded-xl sm:text-xs chip-pad"
                >
                  <ChevronLeft className="h-3 w-3 rtl:rotate-180 sm:h-3.5 sm:w-3.5" />
                  <span className="hidden sm:inline">{t("previousPage")}</span>
                </button>
                <span className="text-[11px] font-medium text-muted-foreground sm:text-xs">
                  {t("pageOf", { page: perJobMeta.page, totalPages: perJobMeta.totalPages })}
                </span>
                <button
                  onClick={() => setPerJobPage(Math.min(perJobMeta.totalPages, perJobPage + 1))}
                  disabled={perJobMeta.page >= perJobMeta.totalPages}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-background/80 text-[11px] font-semibold text-foreground transition hover:border-sky-500/25 hover:text-status-applied disabled:cursor-not-allowed disabled:opacity-50 sm:rounded-xl sm:text-xs chip-pad"
                >
                  <span className="hidden sm:inline">{t("nextPage")}</span>
                  <ChevronRight className="h-3 w-3 rtl:rotate-180 sm:h-3.5 sm:w-3.5" />
                </button>
              </div>
            </div>
          )}
        </AnalyticsPanel>
      )}

      <AnalyticsPanel className="overflow-hidden p-0">
        <div className="border-b border-border/60 px-5 py-5 sm:px-6">
          <AnalyticsSectionHeader
            title={t("topJobsByApps")}
            description={t("topJobsByAppsDesc")}
            icon={Briefcase}
            eyebrow={t("topRoles")}
            compact
          />
        </div>

        {data.topJobs.length === 0 ? (
          <p className="px-6 py-12 text-center text-muted-foreground">{t("noJobApplications")}</p>
        ) : (
          <div className="overflow-x-auto" tabIndex={0}>
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-background/60">
                  <th className="px-4 py-3 text-left font-semibold text-foreground/85">{t("jobTitle")}</th>
                  <th className="px-4 py-3 text-right font-semibold text-foreground/85">{t("applications")}</th>
                  <th className="px-4 py-3 text-right font-semibold text-foreground/85">{t("percentOfTotal")}</th>
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
  const t = useTranslations("employerAnalytics");
  const tc = useTranslations("employerCommon");
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
          <div className="rounded-2xl bg-secondary/75 p-2 text-muted-foreground">
            <Calendar className="h-4 w-4" />
          </div>
          <div className="me-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("dateRange")}</p>
            <p className="mt-1 text-sm font-medium text-foreground">{t("dateRangeDesc")}</p>
          </div>
          {((["7d", "30d", "90d", "180d"] as DateRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setDateRange(r)}
              className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                dateRange === r
                  ? "bg-slate-950 text-white shadow-[0_16px_36px_-28px_rgba(15,23,42,0.9)]"
                  : "bg-secondary/75 text-muted-foreground hover:bg-slate-200"
              }`}
            >
              {r === "7d" ? t("days7") : r === "30d" ? t("days30") : r === "90d" ? t("days90") : t("days180")}
            </button>
          )))}
          <button
            onClick={() => setDateRange("custom")}
            className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
              dateRange === "custom"
                ? "bg-slate-950 text-white shadow-[0_16px_36px_-28px_rgba(15,23,42,0.9)]"
                : "bg-secondary/75 text-muted-foreground hover:bg-slate-200"
            }`}
          >
            {t("customRange")}
          </button>
          {dateRange === "custom" && (
            <div className="flex items-center gap-2">
              <DateTimePicker
                mode="date"
                value={customStart}
                onChange={setCustomStart}
                placeholder={t("startDate")}
              />
              <span className="text-muted-foreground">{t("rangeTo")}</span>
              <DateTimePicker
                mode="date"
                value={customEnd}
                onChange={setCustomEnd}
                placeholder={t("endDate")}
              />
            </div>
          )}
          <span className="ms-auto rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            {historical.dateRange.start} — {historical.dateRange.end} · {historical.totalApplications} {t("histApplications")}
          </span>
        </div>
      </AnalyticsPanel>

      <AnalyticsPanel>
        <AnalyticsSectionHeader
          title={t("appsOverTime")}
          description={t("appsOverTimeDesc")}
          icon={TrendingUp}
          eyebrow={t("trendEyebrow")}
        />

        {trendChartData.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">{t("noDataPeriod")}</p>
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
                  return item?.fullDate ? `${t("dateLabel")}: ${item.fullDate}` : "";
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
            title={t("appSources")}
            description={t("appSourcesDesc")}
            icon={Users}
            eyebrow={t("attributionEyebrow")}
          />

          {sourceChartData.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">{t("noSourceData")}</p>
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
                    formatter={(value) => [value ?? 0, t("applicationsLabel")]}
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
                      <span className="text-foreground/85">{s.label}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-foreground">{s.count}</span>
                      <span className="text-muted-foreground w-10 text-right">{s.pct}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </AnalyticsPanel>

        <AnalyticsPanel>
          <AnalyticsSectionHeader
            title={t("stageDropOff")}
            description={t("stageDropOffDesc")}
            icon={ArrowDownRight}
            eyebrow={t("leakPointsEyebrow")}
          />

          {historical.dropOff.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">{t("noDataAvailable")}</p>
          ) : (
            <div className="space-y-4">
              {historical.dropOff.map((d) => (
                <div key={d.stage}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-foreground/85">
                      {d.stageName} → {d.nextStageName}
                    </span>
                    <span
                      className={`text-sm font-semibold ${
                        d.dropOffPct > 70
                          ? "text-status-rejected"
                          : d.dropOffPct > 40
                          ? "text-status-shortlisted"
                          : "text-status-selected"
                      }`}
                    >
                      {t("dropOffSuffix", { pct: d.dropOffPct })}
                    </span>
                  </div>
                  <div className="w-full bg-secondary/75 rounded-full h-2.5">
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
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>{t("atStage", { count: d.count, stage: d.stageName })}</span>
                    <span>{t("reachedStage", { count: d.nextCount, stage: d.nextStageName })}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </AnalyticsPanel>
      </div>

      <AnalyticsPanel>
        <AnalyticsSectionHeader
          title={t("timeToHireStage")}
          description={t("timeToHireStageDesc")}
          icon={Clock}
          eyebrow={t("speedEyebrow")}
        />

        {historical.timeToHire.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            {t("notEnoughHistory")}
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
                  label={{ value: t("daysAxis"), angle: -90, position: "insideLeft", style: { fontSize: 12, fill: "#94a3b8" } }}
                />
                <Tooltip
                  contentStyle={{ borderRadius: "16px", border: "1px solid #e2e8f0", fontSize: "13px", boxShadow: "0 18px 45px -30px rgba(15, 23, 42, 0.4)" }}
                  formatter={(value, name) => {
                    if (name === "avgDays") return [t("daysValue", { value: String(value) }), t("avgLabel")];
                    if (name === "medianDays") return [t("daysValue", { value: String(value) }), t("medianLabel")];
                    return [value ?? 0, name ?? ""];
                  }}
                />
                <Bar dataKey="avgDays" name="avgDays" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={50} />
                <Bar dataKey="medianDays" name="medianDays" fill="#a5b4fc" radius={[4, 4, 0, 0]} maxBarSize={50} />
              </BarChart>
            </ResponsiveContainer>

            <div className="mt-6 overflow-x-auto rounded-3xl border border-border" tabIndex={0}>
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/65/80">
                    <th className="text-left py-3 px-4 font-semibold text-foreground/85">{t("stageTransitionCol")}</th>
                    <th className="text-right py-3 px-4 font-semibold text-foreground/85">{t("avgDaysCol")}</th>
                    <th className="text-right py-3 px-4 font-semibold text-foreground/85">{t("medianDaysCol")}</th>
                    <th className="text-right py-3 px-4 font-semibold text-foreground/85">{t("transitionsCol")}</th>
                  </tr>
                </thead>
                <tbody>
                  {historical.timeToHire.map((t) => (
                    <tr key={t.transition} className="border-b border-slate-100 hover:bg-secondary/65">
                      <td className="py-3 px-4 text-foreground font-medium">{t.transition}</td>
                      <td className="text-right py-3 px-4 text-foreground/85 font-semibold">{t.avgDays}</td>
                      <td className="text-right py-3 px-4 text-muted-foreground">{t.medianDays}</td>
                      <td className="text-right py-3 px-4 text-muted-foreground">{t.count}</td>
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
          <div className="border-b border-border px-5 py-5 sm:px-6">
            <AnalyticsSectionHeader
              title={t("timeInStageByJob")}
              description={t("timeInStageByJobDesc")}
              icon={Briefcase}
              eyebrow={t("jobBenchmarkEyebrow")}
              compact
            />
          </div>

          <div className="overflow-x-auto" tabIndex={0}>
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/65/80">
                  <th className="text-left py-3 px-4 font-semibold text-foreground/85">{t("jobCol")}</th>
                  <th className="text-left py-3 px-4 font-semibold text-foreground/85">{t("transitionCol")}</th>
                  <th className="text-right py-3 px-4 font-semibold text-foreground/85">{t("avgDaysCol")}</th>
                  <th className="text-right py-3 px-4 font-semibold text-foreground/85">{t("countCol")}</th>
                </tr>
              </thead>
              <tbody>
                {historical.perJobTimeToHire.map((job) =>
                  job.stages.map((s, idx) => (
                    <tr
                      key={`${job.jobId}-${s.transition}`}
                      className="border-b border-slate-100 hover:bg-secondary/65"
                    >
                      {idx === 0 && (
                        <td
                          className="py-3 px-4 text-foreground font-medium max-w-[200px] truncate"
                          rowSpan={job.stages.length}
                        >
                          {job.title}
                        </td>
                      )}
                      <td className="py-3 px-4 text-foreground/85">{s.transition}</td>
                      <td className="text-right py-3 px-4 text-foreground/85 font-semibold">
                        <span
                          className={`${
                            s.avgDays > 7
                              ? "text-status-rejected"
                              : s.avgDays > 3
                              ? "text-status-shortlisted"
                              : "text-status-selected"
                          }`}
                        >
                          {s.avgDays}
                        </span>
                      </td>
                      <td className="text-right py-3 px-4 text-muted-foreground">{s.count}</td>
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
  const t = useTranslations("employerAnalytics");
  const tc = useTranslations("employerCommon");
  const { jobs, summary } = performance;

  return (
    <div className="space-y-6">
      <section>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
          <SummaryCard label={t("totalJobsCard")} value={summary.totalJobs} />
          <SummaryCard label={t("activeCard")} value={summary.activeJobs} color="green" />
          <SummaryCard label={t("viewsCard")} value={summary.totalViews} color="blue" />
          <SummaryCard label={t("uniqueViewsCard")} value={summary.totalUniqueViews} color="indigo" />
          <SummaryCard label={t("applicationsCard")} value={summary.totalApplications} color="purple" />
          <SummaryCard label={t("conversionCard")} value={`${summary.overallConversion}%`} color="amber" />
          <SummaryCard
            label={t("underperformingCard")}
            value={summary.underperforming}
            color={summary.underperforming > 0 ? "red" : "green"}
          />
        </div>
      </section>

      <AnalyticsPanel className="overflow-hidden p-0">
        <div className="border-b border-border px-5 py-5 sm:px-6">
          <AnalyticsSectionHeader
            title={t("jobPerformanceBreakdown")}
            description={t("jobPerformanceBreakdownDesc")}
            icon={Eye}
            eyebrow={t("jobPerformanceEyebrow")}
            compact
          />
        </div>

        {jobs.length === 0 ? (
          <p className="px-6 py-12 text-center text-muted-foreground">{t("noJobsCreated")}</p>
        ) : (
          <div className="overflow-x-auto" tabIndex={0}>
            <table className="w-full min-w-[920px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-3 px-4 font-semibold text-foreground">{t("jobTitleCol")}</th>
                  <th className="text-center py-3 px-4 font-semibold text-foreground">{t("statusCol")}</th>
                  <th className="text-right py-3 px-4 font-semibold text-foreground">{t("viewsCard")}</th>
                  <th className="text-right py-3 px-4 font-semibold text-foreground">{t("uniqueCol")}</th>
                  <th className="text-right py-3 px-4 font-semibold text-foreground">{t("applicationsCard")}</th>
                  <th className="text-right py-3 px-4 font-semibold text-foreground">{t("convRateCol")}</th>
                  <th className="text-right py-3 px-4 font-semibold text-foreground">{t("avgMatchCol")}</th>
                  <th className="text-right py-3 px-4 font-semibold text-foreground">{t("daysActiveCol")}</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.jobId} className="border-b border-border/40 transition hover:bg-muted/30">
                    <td className="py-3 px-4 text-foreground font-medium max-w-[200px] truncate">{job.title}</td>
                    <td className="text-center py-3 px-4">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          job.status === "active"
                            ? "bg-status-selected-bg text-status-selected"
                            : job.status === "closed"
                            ? "bg-muted text-muted-foreground"
                            : job.status === "expired"
                            ? "bg-status-rejected-bg text-status-rejected"
                            : "bg-status-shortlisted-bg text-status-shortlisted"
                        }`}
                      >
                        {job.status}
                      </span>
                    </td>
                    <td className="text-right py-3 px-4 text-foreground">{job.views}</td>
                    <td className="text-right py-3 px-4 text-muted-foreground">{job.uniqueViews}</td>
                    <td className="text-right py-3 px-4 text-foreground font-semibold">{job.applications}</td>
                    <td className="text-right py-3 px-4">
                      <span
                        className={`font-semibold ${
                          job.conversionRate >= 10
                            ? "text-status-selected"
                            : job.conversionRate >= 3
                            ? "text-status-shortlisted"
                            : "text-status-rejected"
                        }`}
                      >
                        {job.conversionRate}%
                      </span>
                    </td>
                    <td className="text-right py-3 px-4 text-muted-foreground">
                      {job.avgMatchScore > 0 ? `${job.avgMatchScore}%` : "—"}
                    </td>
                    <td className="text-right py-3 px-4 text-muted-foreground">{job.daysActive}</td>
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
            title={t("insightsRecs")}
            description={t("insightsRecsDesc")}
            icon={AlertTriangle}
            eyebrow={t("recommendationsEyebrow")}
          />
          <div className="space-y-3">
            {jobs
              .filter((j) => j.insight)
              .map((job) => (
                <div
                  key={job.jobId}
                  className={`flex items-start gap-3 rounded-lg ${ job.insight?.includes("Excellent") ? "border border-status-selected/20 bg-status-selected-bg" : "border border-status-shortlisted/20 bg-status-shortlisted-bg" } chip-pad`}
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{job.title}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{job.insight}</p>
                  </div>
                  <span className="text-xs text-muted-foreground/60 shrink-0">
                    {t("viewsAppsSummary", { views: job.views, apps: job.applications })}
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
  const t = useTranslations("employerAnalytics");
  const tc = useTranslations("employerCommon");
  const { overall, commitment, perJob, distribution } = data;

  return (
    <div className="space-y-6">
      <section>
        <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
          <SummaryCard label={t("avgResponseTime")} value={formatHoursLabel(overall.avgHours, t)} description={t("avgDaysAverage", { days: overall.avgDays })} color="blue" />
          <SummaryCard label={t("medianResponseTime")} value={formatHoursLabel(overall.medianHours, t)} description={t("typicalFirstAction")} color="indigo" />
          <SummaryCard label={t("applicationsMeasured")} value={overall.totalMeasured} description={t("rowsInBenchmark")} color="purple" />
          <SummaryCard
            label={t("yourCommitment")}
            value={
                 commitment ? t("commitmentDays", { count: commitment }) : t("commitmentNotSet")
            }
            description={
              commitment && overall.avgDays > commitment
                ? t("exceedingPromise")
                : commitment && overall.avgDays <= commitment && overall.totalMeasured > 0
                ? t("meetingPromise")
                : t("setPromise")
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
          title={t("responseTimeDistribution")}
          description={t("responseTimeDistributionDesc")}
          icon={Clock}
          eyebrow={t("distributionEyebrow")}
        />

        {distribution.every((d) => d.count === 0) ? (
          <p className="text-center text-muted-foreground py-8">{t("noResponseTimeData")}</p>
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
          <div className="border-b border-border px-5 py-5 sm:px-6">
            <AnalyticsSectionHeader
              title={t("responseTimeByJob")}
              description={t("responseTimeByJobDesc")}
              icon={Briefcase}
              eyebrow={t("jobServiceLevelEyebrow")}
              compact
            />
          </div>

          <div className="overflow-x-auto" tabIndex={0}>
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-3 px-4 font-semibold text-foreground">{t("jobTitleCol")}</th>
                  <th className="text-right py-3 px-4 font-semibold text-foreground">{t("avgResponseCol")}</th>
                  <th className="text-right py-3 px-4 font-semibold text-foreground">{t("medianLabel")}</th>
                  <th className="text-right py-3 px-4 font-semibold text-foreground">{t("measuredCol")}</th>
                </tr>
              </thead>
              <tbody>
                {perJob.map((job) => (
                  <tr key={job.jobId} className="border-b border-border/40 transition hover:bg-muted/30">
                    <td className="py-3 px-4 text-foreground font-medium max-w-[250px] truncate">{job.title}</td>
                    <td className="text-right py-3 px-4">
                      <span
                        className={`font-semibold ${
                          job.avgHours > 168
                            ? "text-status-rejected"
                            : job.avgHours > 48
                            ? "text-status-shortlisted"
                            : "text-status-selected"
                        }`}
                      >
                        {formatHoursLabel(job.avgHours, t)}
                      </span>
                    </td>
                    <td className="text-right py-3 px-4 text-muted-foreground">{formatHoursLabel(job.medianHours, t)}</td>
                    <td className="text-right py-3 px-4 text-muted-foreground">{job.count}</td>
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
  blue: { text: "text-status-applied", icon: "text-status-applied", surface: "bg-status-applied-bg", border: "border-border" },
  indigo: { text: "text-indigo-700", icon: "text-status-interview", surface: "bg-status-interview-bg", border: "border-status-interview/20" },
  purple: { text: "text-status-interview", icon: "text-status-interview", surface: "bg-status-interview-bg", border: "border-status-interview/20" },
  amber: { text: "text-status-shortlisted", icon: "text-status-shortlisted", surface: "bg-status-shortlisted-bg", border: "border-status-shortlisted/20" },
  green: { text: "text-emerald-700", icon: "text-status-selected", surface: "bg-status-selected-bg", border: "border-status-selected/20" },
  red: { text: "text-rose-700", icon: "text-status-rejected", surface: "bg-status-rejected-bg", border: "border-status-rejected/20" },
};

function formatHoursLabel(
  hours: number,
  t: (key: string, values?: Record<string, string | number>) => string
) {
  if (hours < 1) return t("lessThanHour");
  if (hours < 24) return t("hoursValue", { count: Math.round(hours) });
  const days = Math.round((hours / 24) * 10) / 10;
  return t("daysLabelPlural", { count: days });
}

/* ══════════════════════════════════════════════════════════════════
   Offers Tab (offer-acceptance analytics)
   ══════════════════════════════════════════════════════════════════ */

function OffersTab({ data }: { data: OfferAnalyticsData }) {
  const t = useTranslations("employerAnalytics");

  const statusChartData = data.statusBreakdown.map((row) => ({
    name: t(`offerStatus_${row.status}`),
    value: row.count,
    fill: OFFER_STATUS_COLORS[row.status] || "#94a3b8",
  }));

  return (
    <div className="space-y-6">
      <section>
        <div className="grid grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-4">
          <SummaryCard label={t("offersExtended")} value={data.totalOffers} description={t("offersExtendedDesc")} color="blue" />
          <SummaryCard label={t("acceptanceRate")} value={`${data.acceptanceRate}%`} description={t("acceptanceRateDesc")} color="green" />
          <SummaryCard label={t("responseRateOffers")} value={`${data.responseRate}%`} description={t("responseRateOffersDesc")} color="indigo" />
          <SummaryCard
            label={t("avgTimeToAccept")}
            value={data.avgTimeToAcceptDays != null ? t("daysValue", { value: String(data.avgTimeToAcceptDays) }) : "—"}
            description={t("avgTimeToAcceptDesc")}
            color="amber"
          />
        </div>
      </section>

      <AnalyticsPanel>
        <AnalyticsSectionHeader
          title={t("offerStatusTitle")}
          description={t("offerStatusDesc")}
          icon={Award}
          eyebrow={t("outcomesEyebrow")}
        />

        {data.totalOffers === 0 ? (
          <p className="py-10 text-center text-muted-foreground">{t("noOfferData")}</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={statusChartData}
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
                  {statusChartData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: "16px", border: "1px solid #e2e8f0", fontSize: "13px", boxShadow: "0 18px 45px -30px rgba(15, 23, 42, 0.4)" }}
                  formatter={(value) => [value ?? 0, t("offersLabel")]}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>

            <div className="space-y-2 self-center">
              {data.statusBreakdown.map((row) => {
                const pct = data.totalOffers > 0 ? Math.round((row.count / data.totalOffers) * 100) : 0;
                return (
                  <div key={row.status} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: OFFER_STATUS_COLORS[row.status] || "#94a3b8" }} />
                      <span className="text-foreground">{t(`offerStatus_${row.status}`)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-foreground">{row.count}</span>
                      <span className="w-10 text-right text-muted-foreground">{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </AnalyticsPanel>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Diversity Tab (voluntary anonymized DEI metrics)
   ══════════════════════════════════════════════════════════════════ */

function DiversityTab({ data }: { data: DiversityReportData }) {
  const t = useTranslations("employerAnalytics");

  const genderLabel = (key: string) => {
    const known = ["male", "female", "non_binary", "prefer_not_to_say"];
    return known.includes(key) ? t(`gender_${key}`) : key;
  };

  const genderChartData = Object.entries(data.genderDistribution).map(([key, value]) => ({
    name: genderLabel(key),
    value,
    fill: GENDER_COLORS[key] || "#94a3b8",
  }));

  const ageChartData = Object.entries(data.ageDistribution)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([range, count]) => ({ range, count }));

  const ethnicityEntries = Object.entries(data.ethnicityDistribution).sort(([, a], [, b]) => b - a);
  const ethnicityTotal = ethnicityEntries.reduce((sum, [, c]) => sum + c, 0);

  if (data.totalResponses === 0) {
    return (
      <AnalyticsPanel>
        <AnalyticsSectionHeader
          title={t("diversityTitle")}
          description={t("diversityDesc")}
          icon={Users}
          eyebrow={t("inclusionEyebrow")}
        />
        <p className="py-10 text-center text-muted-foreground">{t("noDiversityData")}</p>
      </AnalyticsPanel>
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <div className="grid grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-4">
          <SummaryCard label={t("diversityResponseRate")} value={`${data.responseRate}%`} description={t("diversityResponseRateDesc")} color="blue" />
          <SummaryCard label={t("totalResponses")} value={data.totalResponses} description={t("totalResponsesDesc")} color="indigo" />
          <SummaryCard label={t("veteranRate")} value={`${data.veteranRate}%`} description={t("veteranRateDesc")} color="green" />
          <SummaryCard label={t("disabilityRate")} value={`${data.disabilityRate}%`} description={t("disabilityRateDesc")} color="purple" />
        </div>
      </section>

      <div className="rounded-2xl border border-border bg-card px-4 py-3 text-xs leading-5 text-foreground">
        {t("diversityPrivacyNote")}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <AnalyticsPanel>
          <AnalyticsSectionHeader
            title={t("genderDistribution")}
            description={t("genderDistributionDesc")}
            icon={Users}
            eyebrow={t("inclusionEyebrow")}
          />
          {genderChartData.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">{t("noDiversityData")}</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={genderChartData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={4} dataKey="value" label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
                  {genderChartData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: "16px", border: "1px solid #e2e8f0", fontSize: "13px", boxShadow: "0 18px 45px -30px rgba(15, 23, 42, 0.4)" }} formatter={(value) => [value ?? 0, t("responsesLabel")]} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </AnalyticsPanel>

        <AnalyticsPanel>
          <AnalyticsSectionHeader
            title={t("ageDistribution")}
            description={t("ageDistributionDesc")}
            icon={Calendar}
            eyebrow={t("inclusionEyebrow")}
          />
          {ageChartData.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">{t("noDiversityData")}</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={ageChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="range" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} />
                <YAxis tick={{ fontSize: 12, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: "16px", border: "1px solid #e2e8f0", fontSize: "13px", boxShadow: "0 18px 45px -30px rgba(15, 23, 42, 0.4)" }} formatter={(value) => [value ?? 0, t("responsesLabel")]} />
                <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </AnalyticsPanel>
      </div>

      <AnalyticsPanel>
        <AnalyticsSectionHeader
          title={t("ethnicityDistribution")}
          description={t("ethnicityDistributionDesc")}
          icon={Sparkles}
          eyebrow={t("inclusionEyebrow")}
        />
        {ethnicityEntries.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">{t("noDiversityData")}</p>
        ) : (
          <div className="space-y-3">
            {ethnicityEntries.map(([ethnicity, count]) => {
              const pct = ethnicityTotal > 0 ? Math.round((count / ethnicityTotal) * 100) : 0;
              return (
                <div key={ethnicity}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{ethnicity}</span>
                    <span className="text-muted-foreground">{count} · {pct}%</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </AnalyticsPanel>
    </div>
  );
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
        "workspace-panel-surface rounded-2xl p-3 sm:rounded-3xl sm:p-6",
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
    <div className={cn("mb-4 flex items-start gap-2.5 sm:mb-6 sm:gap-4", compact && "mb-0")}>
      <div className="rounded-xl bg-background/70 p-2 text-foreground/85 sm:rounded-2xl sm:p-3">
        <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
      </div>
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground sm:text-[11px] sm:tracking-[0.18em]">
            {eyebrow}
          </p>
        )}
        <h2 className="heading-section mt-1 font-semibold tracking-tight text-foreground">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground sm:text-sm sm:leading-6">{description}</p>
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
    <div className={cn("workspace-panel-surface rounded-3xl border p-4", colors.border)}>
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
    // A KPI label or value must never be truncated, so these wrap instead of
    // clipping. `[overflow-wrap:normal]` opts out of the `anywhere` the page
    // container sets, which would otherwise break "Shortlisted" mid-word.
    <div className={cn("workspace-panel-surface rounded-xl border p-3 transition-all hover:-translate-y-0.5 sm:rounded-3xl sm:p-4", colors.border)}>
      <div className="flex items-start justify-between gap-1 sm:gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-tight text-muted-foreground [overflow-wrap:normal] sm:text-[11px] sm:tracking-[0.18em]">{label}</p>
          <p className={`mt-1 text-lg font-semibold tracking-tight sm:mt-3 sm:text-3xl ${colors.text}`}>{count}</p>
        </div>
        <div className={cn("hidden rounded-2xl p-2.5 sm:block", colors.surface, colors.icon)}>
          <TrendingUp className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground [overflow-wrap:normal] sm:mt-3 sm:text-xs">{subtitle}</p>
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
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-xs ${
        highlight
          ? "border border-status-selected/20 bg-status-selected-bg font-semibold text-status-selected"
          : "border border-border bg-background/80 text-foreground/85"
      }`}
    >
      {label}: <strong>{value}%</strong>
    </span>
  );
}
