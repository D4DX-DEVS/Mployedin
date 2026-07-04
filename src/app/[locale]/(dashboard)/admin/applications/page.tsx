"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { usePagination } from "@/hooks/usePagination";
import {
  Search, Inbox, Sparkles, Calendar, Building2, ArrowUpDown,
  TrendingUp, Users, FileText, Brain, ChevronDown, ChevronUp,
  Filter, BarChart3, Zap, AlertTriangle, CheckCircle, Info, Target,
  RefreshCw, Wand2, User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import type { ExportColumn } from "@/lib/export";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ApplicationJob {
  title?: string;
  employerId?: { companyName?: string; logo?: string };
  location?: { city?: string; country?: string; isRemote?: boolean };
}

interface ApplicationSeeker {
  _id?: string;
  fullName?: string;
  email?: string;
  skills?: string[];
  totalExperienceYears?: number;
  currentLocation?: string;
  profileCompleteness?: number;
  userId?: { name?: string; email?: string };
}

interface Application {
  _id: string;
  jobId?: ApplicationJob;
  jobSeekerId?: ApplicationSeeker;
  employerId?: string;
  status: string;
  source?: string;
  autoApplied?: boolean;
  aiMatchScore?: number;
  matchBreakdown?: { skills: number; experience: number; education: number; overall: number };
  appliedAt?: string;
  createdAt: string;
}

interface EmployerOption {
  _id: string;
  companyName: string;
}

interface Stats {
  byStatus: Record<string, number>;
  bySource: Record<string, number>;
  avgAiScore: number;
  scoredCount: number;
  todayCount: number;
  weekCount: number;
  totalAll: number;
}

interface AIInsight {
  title: string;
  description: string;
  type: "positive" | "warning" | "info" | "action";
}

interface AIInsightsData {
  summary: string;
  insights: AIInsight[];
  recommendations: string[];
  healthScore: number | null;
  data: {
    topJobs: Array<{ title: string; company: string; applications: number; avgScore: number }>;
    scoreDistribution: Array<{ range: string; count: number }>;
    avgDaysInPipeline: number;
  };
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STATUSES = ["applied", "shortlisted", "interview_scheduled", "selected", "offer", "hired", "rejected", "withdrawn"];

function statusLabelKey(s: string): string {
  const key: Record<string, string> = {
    applied: "appliedStatus",
    shortlisted: "shortlistedStatus",
    interview_scheduled: "interviewScheduledStatus",
    selected: "selectedStatus",
    offer: "offerStatus",
    hired: "hiredStatus",
    rejected: "rejectedStatus",
    withdrawn: "withdrawnStatus",
  };
  return key[s] || s;
}

function InsightIcon({ type }: { type: string }) {
  switch (type) {
    case "positive": return <CheckCircle className="h-4 w-4 text-emerald-500" />;
    case "warning":  return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    case "action":   return <Target className="h-4 w-4 text-blue-500" />;
    default:         return <Info className="h-4 w-4 text-sky-500" />;
  }
}

function ScoreBadge({ score }: { score?: number }) {
  if (score == null) return <span className="text-xs text-muted-foreground">—</span>;
  const color =
    score >= 80 ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400"
    : score >= 60 ? "text-blue-600 bg-blue-50 dark:bg-blue-950/30 dark:text-blue-400"
    : score >= 40 ? "text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400"
    : "text-red-600 bg-red-50 dark:bg-red-950/30 dark:text-red-400";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>
      <Brain className="h-3 w-3" />
      {score}%
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function AdminApplicationsPage() {
  const t = useTranslations("adminApplications");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const jobIdFilter = searchParams.get("jobId") ?? "";
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();

  // Data
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [employers, setEmployers] = useState<EmployerOption[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [employerId, setEmployerId] = useState("");
  const [source, setSource] = useState("");
  const [scoreRange, setScoreRange] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState("appliedAt");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [showFilters, setShowFilters] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // AI Insights
  const [aiInsights, setAiInsights] = useState<AIInsightsData | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);

  // AI Search
  const [aiQuery, setAiQuery] = useState("");
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isApplyingAiSearch, setIsApplyingAiSearch] = useState(false);

  const activeFilters = [jobIdFilter, status, employerId, source, scoreRange, dateFrom, dateTo].filter(Boolean).length;

  // Build STATUS_OPTIONS, SOURCE_OPTIONS, SORT_OPTIONS, SCORE_RANGE_OPTIONS inside component for translations
  const STATUS_OPTIONS = [{ value: "", label: t("allStatuses") }, ...STATUSES.map((s) => ({ value: s, label: t(statusLabelKey(s)) }))];
  const SOURCE_OPTIONS = [
    { value: "", label: t("allSources") },
    { value: "easy_apply", label: t("sourceEasyApply") },
    { value: "full_form", label: t("sourceFullForm") },
    { value: "direct", label: t("sourceDirect") },
    { value: "auto_apply", label: t("sourceAutoApply") },
  ];
  const SORT_OPTIONS = [
    { value: "appliedAt", label: t("appliedDate") },
    { value: "aiMatchScore", label: t("aiMatchScore") },
    { value: "status", label: t("status") },
  ];
  const SCORE_RANGE_OPTIONS = [
    { value: "", label: t("allScores") },
    { value: "80-100", label: t("excellent80100") },
    { value: "60-79", label: t("good6079") },
    { value: "40-59", label: t("average4059") },
    { value: "0-39", label: t("low039") },
  ];

  const sourceLabel = (s?: string): string => {
    const key: Record<string, string> = {
      easy_apply: "sourceEasyApply",
      full_form: "sourceFullForm",
      direct: "sourceDirect",
      auto_apply: "sourceAutoApply",
    };
    return key[s || ""] ? t(key[s || ""]) : s ?? "—";
  };

  const exportColumns: ExportColumn<Application>[] = [
    { header: "Applicant", key: "jobSeekerId" as keyof Application, formatter: (_v, r) => { const a = r as unknown as Application; return a.jobSeekerId?.fullName ?? a.jobSeekerId?.userId?.name ?? "—"; } },
    { header: "Job", key: "jobId" as keyof Application, formatter: (_v, r) => (r as unknown as Application).jobId?.title ?? "—" },
    { header: "Company", key: "jobId" as keyof Application, formatter: (_v, r) => (r as unknown as Application).jobId?.employerId?.companyName ?? "—" },
    { header: "Status", key: "status" },
    { header: "Source", key: "source", formatter: (v) => sourceLabel(v as string) },
    { header: "AI Score", key: "aiMatchScore", formatter: (v) => v != null ? `${v}%` : "—" },
    { header: "Applied", key: "createdAt", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : "—" },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: applications as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "applications",
    title: "Applications",
  });

  /* ---- Fetch applications ---- */
  const fetchApplications = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (jobIdFilter) params.set("jobId", jobIdFilter);
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    if (employerId) params.set("employerId", employerId);
    if (source) params.set("source", source);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (sortBy) params.set("sortBy", sortBy);
    if (sortOrder) params.set("sortOrder", sortOrder);
    if (scoreRange) {
      const [min, max] = scoreRange.split("-");
      if (min) params.set("scoreMin", min);
      if (max) params.set("scoreMax", max);
    }
    if (employers.length === 0) params.set("fetchEmployers", "true");
    if (!stats) params.set("fetchStats", "true");

    const res = await fetch(`/api/applications?${params}`);
    if (res.ok) {
      const data = await res.json();
      setApplications(data.items ?? data.applications ?? []);
      updateTotal(data.total ?? data.totalCount ?? data.pagination?.total ?? ((data.totalPages ?? data.pagination?.pages ?? 1) * limit));
      if (data.allEmployers) setEmployers(data.allEmployers);
      if (data.stats) setStats(data.stats);
    }
    setLoading(false);
  }, [jobIdFilter, search, status, employerId, source, scoreRange, dateFrom, dateTo, sortBy, sortOrder, page, limit, employers.length, stats, updateTotal]);

  useEffect(() => { fetchApplications(); }, [fetchApplications]);

  /* ---- Fetch AI insights ---- */
  const fetchAiInsights = useCallback(async () => {
    setAiLoading(true);
    try {
      const res = await fetch("/api/applications/ai-insights");
      if (res.ok) setAiInsights(await res.json());
    } catch { /* swallow */ }
    setAiLoading(false);
  }, []);

  /* ---- AI Search ---- */
  const scoreBandToRange: Record<string, string> = {
    excellent: "80-100", good: "60-79", average: "40-59", low: "0-39",
  };

  async function handleApplyAiSearch() {
    const q = aiQuery.trim();
    if (!q) return;
    setIsApplyingAiSearch(true);
    try {
      const res = await fetch("/api/ai/application-search-filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      if (!res.ok) throw new Error("AI search failed");
      const data = await res.json();
      const f = data.filters ?? {};
      setSearch(f.search ?? "");
      setStatus(f.status ?? "");
      setSource(f.source ?? "");
      setScoreRange(f.scoreBand ? (scoreBandToRange[f.scoreBand] ?? "") : "");
      setDateFrom(f.dateFrom ?? "");
      setDateTo(f.dateTo ?? "");
      setSortBy("appliedAt");
      setSortOrder("desc");
      if (f.employer && employers.length > 0) {
        const match = employers.find((e) => e.companyName.toLowerCase().includes(f.employer!.toLowerCase()));
        setEmployerId(match?._id ?? "");
      } else {
        setEmployerId("");
      }
      if (f.scoreBand || f.dateFrom || f.dateTo) setShowAdvancedFilters(true);
      setAiSummary(data.summary ?? null);
      resetPage();
    } catch {
      setSearch(q);
      setAiSummary(`AI search was unavailable, so keyword results are shown for "${q}".`);
    } finally {
      setIsApplyingAiSearch(false);
    }
  }

  const clearAllFilters = () => {
    setSearch(""); setStatus(""); setEmployerId(""); setSource("");
    setScoreRange(""); setDateFrom(""); setDateTo("");
    setSortBy("appliedAt"); setSortOrder("desc");
    setAiQuery(""); setAiSummary(null);
    resetPage();
    if (jobIdFilter) {
      router.replace(pathname);
    }
  };

  const toggleSort = (field: string) => {
    if (sortBy === field) setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    else { setSortBy(field); setSortOrder("desc"); }
  };

  const employerOptions = [
    { value: "", label: "All Employers" },
    ...employers.map((e) => ({ value: e._id, label: e.companyName })),
  ];

  return (
    <div className="page-container employer-legacy-surface space-y-6">

      {/* ─── Hero ─────────────────────────────────────────────────────── */}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">
              <Sparkles className="h-3.5 w-3.5" />
              {t("recruitmentControl")}
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
              {t("applications")}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t("applicationsDescription")}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("pipeline")}</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{stats?.totalAll ?? total} {t("total")}</p>
              <p className="text-xs text-muted-foreground">{t("avgScore")} {stats?.avgAiScore ?? 0}%</p>
            </div>
            <Button
              variant={showAiPanel ? "default" : "outline"}
              onClick={() => {
                setShowAiPanel(!showAiPanel);
                if (!showAiPanel && !aiInsights) fetchAiInsights();
              }}
              className="h-11 gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700 border-0"
            >
              <Sparkles className="h-4 w-4" />
              {t("aiInsights")}
            </Button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {([
            { label: t("totalApps"), value: stats?.totalAll ?? 0, note: t("allApplications"), icon: FileText, tone: "text-sky-600", chip: "bg-sky-50 dark:bg-sky-950/30" },
            { label: t("today"), value: stats?.todayCount ?? 0, note: t("newToday"), icon: TrendingUp, tone: "text-emerald-600", chip: "bg-emerald-50 dark:bg-emerald-950/30" },
            { label: t("aiScored"), value: stats?.scoredCount ?? 0, note: `${t("avgColon")} ${stats?.avgAiScore ?? 0}%`, icon: Brain, tone: "text-violet-600", chip: "bg-violet-50 dark:bg-violet-950/30" },
            { label: t("inShortlist"), value: stats?.byStatus?.["shortlisted"] ?? 0, note: t("pipelineLabel"), icon: Users, tone: "text-amber-600", chip: "bg-amber-50 dark:bg-amber-950/30" },
          ] as const).map(({ label, value, note, icon: Icon, tone, chip }) => (
            <div key={label} className="workspace-glass-panel rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
                  <p className="mt-3 text-4xl font-semibold tracking-tight text-foreground">{value}</p>
                </div>
                <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${chip}`}>
                  <Icon className={`h-5 w-5 ${tone}`} />
                </span>
              </div>
              <p className="mt-3 text-sm leading-5 text-muted-foreground">{note}</p>
            </div>
          ))}
        </div>

        {/* ─── AI Insights inline ─────────────────────────────────────── */}
        {showAiPanel && (
          <div className="mt-6 rounded-[20px] border border-border/30 bg-background/40 p-5 space-y-4 backdrop-blur-sm dark:bg-background/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-sky-500" />
                <h3 className="text-lg font-semibold">{t("aiPipelineInsights")}</h3>
              </div>
              <Button variant="ghost" size="sm" onClick={fetchAiInsights} disabled={aiLoading} className="gap-1.5">
                <RefreshCw className={`h-3.5 w-3.5 ${aiLoading ? "animate-spin" : ""}`} />
                {t("refresh")}
              </Button>
            </div>

            {aiLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/40" />
                ))}
              </div>
            ) : aiInsights ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start gap-4">
                  {aiInsights.healthScore != null && (
                    <div className="flex flex-col items-center gap-1">
                      <div className={`text-3xl font-bold ${
                        aiInsights.healthScore >= 70 ? "text-emerald-600 dark:text-emerald-400"
                        : aiInsights.healthScore >= 40 ? "text-amber-600 dark:text-amber-400"
                        : "text-red-600 dark:text-red-400"
                      }`}>
                        {aiInsights.healthScore}
                      </div>
                      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t("health")}</span>
                    </div>
                  )}
                  <p className="flex-1 text-sm leading-relaxed text-muted-foreground">{aiInsights.summary}</p>
                </div>

                {aiInsights.insights.length > 0 && (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {aiInsights.insights.map((insight, i) => (
                      <div key={i} className="flex gap-2.5 rounded-xl border border-border/50 bg-background/50 p-3">
                        <InsightIcon type={insight.type} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{insight.title}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{insight.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {aiInsights.recommendations.length > 0 && (
                  <div className="rounded-xl border border-sky-200/50 bg-sky-50/50 p-3 space-y-1.5 dark:border-sky-800/30 dark:bg-sky-950/20">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-400">
                      <Zap className="h-3.5 w-3.5" /> {t("recommendations")}
                    </p>
                    {aiInsights.recommendations.map((rec, i) => (
                      <p key={i} className="pl-5 text-sm text-sky-900 dark:text-sky-200">• {rec}</p>
                    ))}
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  {aiInsights.data.topJobs.length > 0 && (
                    <div className="rounded-xl border border-border/50 p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("topJobs30d")}</p>
                      <div className="space-y-2">
                        {aiInsights.data.topJobs.map((j, i) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <div className="min-w-0">
                              <span className="block truncate font-medium">{j.title}</span>
                              <span className="text-xs text-muted-foreground">{j.company}</span>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <Badge variant="secondary" className="text-[10px]">{j.applications} {t("apps")}</Badge>
                              <ScoreBadge score={j.avgScore || undefined} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {aiInsights.data.avgDaysInPipeline > 0 && (
                    <div className="rounded-xl border border-border/50 p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("pipelineMetrics")}</p>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{t("avgDaysInPipeline")}</span>
                          <span className="font-semibold">{aiInsights.data.avgDaysInPipeline}d</span>
                        </div>
                        {aiInsights.data.scoreDistribution.map((sd, i) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{t("scoreRange")} {sd.range}</span>
                            <span className="font-medium">{sd.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("clickRefreshToLoad")}</p>
            )}
          </div>
        )}

        {/* ─── Filter toggle bar ──────────────────────────────────────── */}
        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-white/10 dark:hover:bg-white/5"
          >
            <Filter className="h-4 w-4 text-muted-foreground" />
            {showFilters ? t("hideFilters") : t("showFilters")}
            {activeFilters > 0 && <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{activeFilters} {t("active")}</Badge>}
            {showFilters ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
          <div className="flex items-center gap-2">
            {jobIdFilter && (
              <Badge variant="secondary" className="rounded-full px-2.5 py-1 text-[11px] font-medium">
                {t("selectedJobOnly")}
              </Badge>
            )}
            {activeFilters > 0 && (
              <Button variant="ghost" size="sm" onClick={clearAllFilters} className="gap-1.5 text-xs text-muted-foreground">
                {t("clearFilters")}
              </Button>
            )}
            <TableToolbar
              onExportCsv={handleExportCsv}
              onExportExcel={handleExportExcel}
              onExportPdf={handleExportPdf}
            />
          </div>
        </div>

        {/* ─── Expandable Filters ─────────────────────────────────────── */}
        {showFilters && (
          <div className="mt-4 space-y-3 rounded-[20px] border border-border/30 bg-background/40 p-4 backdrop-blur-sm dark:bg-background/20">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("searchPlaceholder")}
                value={search}
                onChange={(v) => { setSearch(v.target.value); resetPage(); }}
                className="h-11 rounded-xl border-border bg-card pl-9 text-sm shadow-none"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SearchableSelect
                className="h-11 w-full rounded-xl border-border bg-card"
                options={STATUS_OPTIONS}
                value={status}
                onValueChange={(v) => { setStatus(v); resetPage(); }}
                placeholder={t("allStatuses")}
              />
              {employerOptions.length > 2 && (
                <SearchableSelect
                  className="h-11 w-full rounded-xl border-border bg-card"
                  options={employerOptions}
                  value={employerId}
                  onValueChange={(v) => { setEmployerId(v); resetPage(); }}
                  placeholder={t("allEmployers")}
                />
              )}
              <SearchableSelect
                className="h-11 w-full rounded-xl border-border bg-card"
                options={SOURCE_OPTIONS}
                value={source}
                onValueChange={(v) => { setSource(v); resetPage(); }}
                placeholder={t("allSources")}
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <Filter className="h-3.5 w-3.5" />
                {t("advancedFilters")}
                {showAdvancedFilters ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
              {activeFilters > 0 && (
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{activeFilters} {t("active")}</Badge>
              )}
            </div>

            {showAdvancedFilters && (
              <div className="grid gap-3 pt-1 sm:grid-cols-2 xl:grid-cols-4">
                <SearchableSelect
                  className="h-11 w-full rounded-xl border-border bg-card"
                  options={SCORE_RANGE_OPTIONS}
                  value={scoreRange}
                  onValueChange={(v) => { setScoreRange(v); resetPage(); }}
                  placeholder={t("allScores")}
                />
                <DateTimePicker
                  mode="date"
                  value={dateFrom}
                  onChange={(v) => { setDateFrom(v); resetPage(); }}
                  placeholder={t("fromDate")}
                  className="h-11 rounded-xl border-border bg-card text-sm"
                />
                <DateTimePicker
                  mode="date"
                  value={dateTo}
                  onChange={(v) => { setDateTo(v); resetPage(); }}
                  placeholder={t("toDate")}
                  className="h-11 rounded-xl border-border bg-card text-sm"
                />
                <SearchableSelect
                  className="h-11 w-full rounded-xl border-border bg-card"
                  options={SORT_OPTIONS}
                  value={sortBy}
                  onValueChange={(v) => { setSortBy(v); resetPage(); }}
                  placeholder={t("sortBy")}
                />
              </div>
            )}

            <div className="grid gap-3 xl:grid-cols-[1fr_auto]">
              <div className="relative">
                <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-500" />
                <Input
                  placeholder={t("aiSearch")}
                  value={aiQuery}
                  onChange={(e) => setAiQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleApplyAiSearch(); } }}
                  className="h-11 rounded-xl border-border bg-card pl-9 text-sm shadow-none"
                />
              </div>
              <Button
                type="button"
                onClick={() => { void handleApplyAiSearch(); }}
                disabled={!aiQuery.trim() || isApplyingAiSearch}
                className="h-11 gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                <Wand2 className="h-4 w-4" />
                {isApplyingAiSearch ? t("applying") : t("aiSearchButton")}
              </Button>
            </div>

            {aiSummary && (
              <p className="rounded-xl bg-primary/5 px-4 py-2.5 text-sm text-primary">
                <Sparkles className="mr-1.5 inline-block h-3.5 w-3.5" />
                {aiSummary}
              </p>
            )}
          </div>
        )}
      </section>

      {/* ─── Application List ─────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-[20px] border border-border/60 bg-background/70" />
          ))}
        </div>
      ) : applications.length === 0 ? (
        <div className="workspace-panel-surface rounded-[28px] px-6 py-16 text-center">
          <div className="workspace-muted-pill mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[24px]">
            <Inbox className="h-7 w-7" />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {activeFilters ? t("noMatchingApplications") : t("noApplicationsYet")}
          </p>
          <h3 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
            {activeFilters ? t("noApplicationsMatchFilters") : t("noApplicationsFound")}
          </h3>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
            {activeFilters
              ? t("tryWideningFilters")
              : t("applicationsAppearHere")}
          </p>
          {activeFilters > 0 && (
            <Button onClick={clearAllFilters} variant="outline" className="mt-6 h-11 rounded-xl border-border bg-background/70 px-4 text-sm">
              {t("clearFilters")}
            </Button>
          )}
        </div>
      ) : (
        <section className="workspace-panel-surface overflow-hidden rounded-[28px]">
          {/* Column headers */}
          <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] items-center gap-4 border-b border-border/70 bg-background/50 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground lg:grid">
            <span>{t("candidate")}</span>
            <span>{t("roleMatchSkills")}</span>
            <span className="text-right">
              <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("appliedAt")}>
                {t("applied")} <ArrowUpDown className="h-3 w-3" />
              </button>
            </span>
          </div>

          <div className="divide-y divide-border/60">
            {applications.map((app) => {
              const seeker = app.jobSeekerId;
              const job = app.jobId;
              const employer = job?.employerId;
              const candidateName = seeker?.fullName ?? seeker?.userId?.name ?? "Unknown";
              const jobLocation = job?.location
                ? (job.location.isRemote ? "Remote" : [job.location.city, job.location.country].filter(Boolean).join(", "))
                : null;
              const locationExp = [jobLocation, seeker?.totalExperienceYears ? `${seeker.totalExperienceYears}+ yrs` : null].filter(Boolean).join(" · ");
              const topSkills = seeker?.skills?.slice(0, 3) ?? [];
              const appliedDate = new Date(app.appliedAt ?? app.createdAt).toLocaleDateString(undefined, { day: "2-digit", month: "short" });
              const aiScoreLabel = app.aiMatchScore != null ? `${app.aiMatchScore}% match` : null;
              const aiScoreColor = app.aiMatchScore != null
                ? app.aiMatchScore >= 80 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                  : app.aiMatchScore >= 60 ? "bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-400"
                  : app.aiMatchScore >= 40 ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                  : "bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400"
                : "";

              return (
                <article
                  key={app._id}
                  className="grid gap-3 bg-transparent px-5 py-4 transition-all duration-200 hover:bg-background/70 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-center"
                >
                  {/* Candidate */}
                  <div className="flex min-w-0 items-center gap-3.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 shadow-inner dark:text-sky-300">
                      <User className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold tracking-tight text-foreground sm:text-base">{candidateName}</span>
                        <StatusBadge status={app.status} />
                      </div>
                      {employer?.companyName && (
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Building2 className="h-3.5 w-3.5" />
                          {employer.companyName}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Role, Match, Skills */}
                  <div className="min-w-0 sm:px-2">
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <span className="truncate text-sm font-medium text-foreground">{job?.title ?? "—"}</span>
                      {locationExp && (
                        <>
                          <span className="hidden text-border sm:inline">·</span>
                          <span className="truncate text-xs text-muted-foreground">{locationExp}</span>
                        </>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {aiScoreLabel && (
                        <Badge className={`${aiScoreColor} rounded-full px-2.5 py-0.5 text-[11px] font-semibold`}>
                          {aiScoreLabel}
                        </Badge>
                      )}
                      {topSkills.map((skill) => (
                        <span key={skill} className="rounded-full border border-border bg-background/70 px-2.5 py-0.5 text-xs text-muted-foreground">
                          {skill}
                        </span>
                      ))}
                      {topSkills.length === 0 && !aiScoreLabel && (
                        <span className="text-xs text-muted-foreground">{t("noSkillsListed")}</span>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2.5 text-xs text-muted-foreground">
                      <span>{t("applied")} {appliedDate}</span>
                      <Badge variant={app.autoApplied ? "warning" : "secondary"} className="text-[11px]">
                        {sourceLabel(app.source)}
                      </Badge>
                    </div>
                  </div>

                  {/* Score */}
                  <div className="flex items-center gap-2 sm:justify-end">
                    <ScoreBadge score={app.aiMatchScore} />
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
    </div>
  );
}
