"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { usePagination } from "@/hooks/usePagination";
import {
  Search, Inbox, Sparkles, Building2, ArrowUpDown,
  TrendingUp, Users, FileText, Brain, ChevronDown, ChevronUp,
  Filter, Zap, AlertTriangle, CheckCircle, Info, Target,
  RefreshCw, Wand2, User, Briefcase,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import type { ExportColumn } from "@/lib/export";
import { formatDate } from "@/lib/ui/intlFormat";
import { CandidateDataNotice } from "@/components/shared/CandidateDataNotice";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ApplicationJob {
  _id?: string;
  title?: string;
  employerId?: { companyName?: string; logo?: string };
  location?: { city?: string; country?: string; isRemote?: boolean };
}

interface ApplicationSeeker {
  _id?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  headline?: string;
  cvUrl?: string;
  resumeUrl?: string;
  skills?: string[];
  totalExperienceYears?: number;
  currentLocation?: string;
  profileCompleteness?: number;
  userId?: { name?: string; email?: string; phone?: string };
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
    score >= 80 ? "text-status-selected bg-status-selected-bg"
    : score >= 60 ? "text-status-applied bg-status-applied-bg"
    : score >= 40 ? "text-status-shortlisted bg-status-shortlisted-bg"
    : "text-status-rejected bg-status-rejected-bg";
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
  const locale = useLocale();
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

  // Filters live in the query string, not in component state. Only `jobId` used
  // to be read from the URL, so `?status=applied` — the very link the dashboard
  // alerts, the quick actions and the ⌘K palette all want to send an admin —
  // did nothing, back from a record returned an unfiltered list, and a filtered
  // view could not be shared with a colleague.
  const [search, setSearch] = useUrlFilter("search", "", { debounceMs: 400 });
  const [status, setStatus] = useUrlFilter("status", "");
  const [employerId, setEmployerId] = useUrlFilter("employerId", "");
  const [source, setSource] = useUrlFilter("source", "");
  const [scoreRange, setScoreRange] = useUrlFilter("scoreRange", "");
  const [dateFrom, setDateFrom] = useUrlFilter("dateFrom", "");
  const [dateTo, setDateTo] = useUrlFilter("dateTo", "");
  const [sortBy, setSortBy] = useUrlFilter("sortBy", "appliedAt");
  const [sortOrderValue, setSortOrderValue] = useUrlFilter("sortOrder", "desc");
  const sortOrder = sortOrderValue === "asc" ? "asc" : "desc";
  const setSortOrder = (next: "asc" | "desc") => setSortOrderValue(next);
  /** Open applications untouched for 48h+ — what the dashboard's stale alert links to. */
  const [stale, setStale] = useUrlFilter("stale", "");
  const [showFilters, setShowFilters] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  /* Selection and inline detail. The admin list had neither: changing twenty
     applications meant twenty interactions, and reading a candidate meant
     leaving for the job-seekers list and retyping the name, because a row
     carried no link to the person or the job it was about. The bulk endpoint
     (`/api/applications/bulk`) already authorises admin and scopes correctly —
     only the UI was missing. */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkRunning, setBulkRunning] = useState(false);

  // AI Insights
  const [aiInsights, setAiInsights] = useState<AIInsightsData | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);

  // AI Search
  const [aiQuery, setAiQuery] = useState("");
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isApplyingAiSearch, setIsApplyingAiSearch] = useState(false);

  const activeFilters = [jobIdFilter, status, employerId, source, scoreRange, dateFrom, dateTo, stale].filter(Boolean).length;

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
    { header: t("exportHeaderApplicant"), key: "jobSeekerId" as keyof Application, formatter: (_v, r) => { const a = r as unknown as Application; return a.jobSeekerId?.fullName ?? a.jobSeekerId?.userId?.name ?? "—"; } },
    { header: t("exportHeaderJob"), key: "jobId" as keyof Application, formatter: (_v, r) => (r as unknown as Application).jobId?.title ?? "—" },
    { header: t("exportHeaderCompany"), key: "jobId" as keyof Application, formatter: (_v, r) => (r as unknown as Application).jobId?.employerId?.companyName ?? "—" },
    { header: t("status"), key: "status" },
    { header: t("exportHeaderSource"), key: "source", formatter: (v) => sourceLabel(v as string) },
    { header: t("exportHeaderAIScore"), key: "aiMatchScore", formatter: (v) => v != null ? `${v}%` : "—" },
    { header: t("exportHeaderApplied"), key: "createdAt", formatter: (v) => v ? formatDate(new Date(String(v))) : "—" },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: applications as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "applications",
    title: t("applications"),
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
    if (stale === "true") params.set("stale", "true");
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
  }, [jobIdFilter, search, status, employerId, source, scoreRange, dateFrom, dateTo, sortBy, sortOrder, stale, page, limit, employers.length, stats, updateTotal]);

  useEffect(() => { fetchApplications(); }, [fetchApplications]);

  /* ---- Fetch AI insights ---- */
  const fetchAiInsights = useCallback(async () => {
    setAiLoading(true);
    try {
      const res = await fetch("/api/applications/ai-insights");
      if (res.ok) setAiInsights(await res.json());
      else {
        const e = await res.json().catch(() => ({}));
        toast.error(e.error ?? t("failedToLoadAiInsights"));
      }
    } catch {
      toast.error(t("failedToLoadAiInsights"));
    }
    setAiLoading(false);
  }, [t]);

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
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        toast.error(e.error ?? "AI search failed, showing keyword results instead");
        throw new Error("AI search failed");
      }
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

  /* ---- Manage: change application status ---- */
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const handleStatusChange = async (id: string, newStatus: string) => {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        toast.success(t("statusUpdated"));
        setApplications((prev) => prev.map((a) => (a._id === id ? { ...a, status: newStatus } : a)));
      } else {
        const e = await res.json().catch(() => ({}));
        toast.error(e.error ?? t("failedToUpdateStatus"));
      }
    } catch {
      toast.error(t("failedToUpdateStatus"));
    } finally {
      setUpdatingId(null);
    }
  };

  /* ---- Bulk: move many applications at once ----
     Calls the same endpoint the employer workspace uses. It already permits
     admin ("employer, agent, super_agent, admin") and resolves an unscoped
     query for this role, and it has its own scope test. */
  const allVisibleSelected = applications.length > 0 && selectedIds.length === applications.length;
  const toggleSelectAll = () => {
    setSelectedIds(allVisibleSelected ? [] : applications.map((app) => app._id));
  };
  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  };

  const runBulkStatus = async () => {
    if (!bulkStatus || selectedIds.length === 0) return;
    setBulkRunning(true);
    try {
      const res = await fetch("/api/applications/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationIds: selectedIds,
          action: bulkStatus === "rejected" ? "reject" : "move_stage",
          params: bulkStatus === "rejected" ? {} : { targetStage: bulkStatus },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? t("failedToUpdateStatus"));
        return;
      }
      toast.success(t("bulkStatusUpdated", { count: data.processed ?? selectedIds.length }));
      setSelectedIds([]);
      setBulkStatus("");
      fetchApplications();
    } catch {
      toast.error(t("failedToUpdateStatus"));
    } finally {
      setBulkRunning(false);
    }
  };

  const clearAllFilters = () => {
    setSearch(""); setStatus(""); setEmployerId(""); setSource("");
    setScoreRange(""); setDateFrom(""); setDateTo(""); setStale("");
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
    { value: "", label: t("filterAllEmployers") },
    ...employers.map((e) => ({ value: e._id, label: e.companyName })),
  ];

  return (
    <div className="page-container">

      {/* ─── Compact page header ──────────────────────────────────────── */}
      <DashboardPageHeader
        compact
        title={t("applications")}
        description={t("applicationsDescription")}
        actions={(
          <Button
            variant={showAiPanel ? "default" : "outline"}
            onClick={() => {
              setShowAiPanel(!showAiPanel);
              if (!showAiPanel && !aiInsights) fetchAiInsights();
            }}
            size="lg"
            className="h-10 gap-2 rounded-xl border-0 px-4 max-sm:min-h-11"
          >
            <Sparkles className="h-4 w-4" />
            {t("aiInsights")}
          </Button>
        )}
        metrics={[
          { label: t("totalApps"), value: stats?.totalAll ?? 0, note: t("allApplications"), icon: FileText, iconClassName: "text-status-applied", iconSurfaceClassName: "bg-status-applied-bg" },
          { label: t("today"), value: stats?.todayCount ?? 0, note: t("newToday"), icon: TrendingUp, iconClassName: "text-status-selected", iconSurfaceClassName: "bg-status-selected-bg" },
          { label: t("aiScored"), value: stats?.scoredCount ?? 0, note: `${t("avgColon")} ${stats?.avgAiScore ?? 0}%`, icon: Brain, iconClassName: "text-status-interview", iconSurfaceClassName: "bg-status-interview-bg" },
          { label: t("inShortlist"), value: stats?.byStatus?.["shortlisted"] ?? 0, note: t("pipelineLabel"), icon: Users, iconClassName: "text-status-shortlisted", iconSurfaceClassName: "bg-status-shortlisted-bg" },
        ]}
        compactOnMobile
        footer={(
          <>
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className="flex min-h-11 items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-background/50 sm:min-h-0"
            >
              <Filter className="h-4 w-4 text-muted-foreground" />
              {showFilters ? t("hideFilters") : t("showFilters")}
              {activeFilters > 0 && <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">{activeFilters} {t("active")}</Badge>}
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
          </>
        )}
      >

        {/* ─── AI Insights inline ─────────────────────────────────────── */}
        {showAiPanel && (
          <div className="mt-6 rounded-3xl border border-border/30 bg-background/40 space-y-4 backdrop-blur-sm panel-body">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-sky-500" />
                <h3 className="heading-subsection font-semibold">{t("aiPipelineInsights")}</h3>
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
                      <div className={`text-2xl sm:text-3xl font-bold ${
                        aiInsights.healthScore >= 70 ? "text-status-selected"
                        : aiInsights.healthScore >= 40 ? "text-status-shortlisted"
                        : "text-status-rejected"
                      }`}>
                        {aiInsights.healthScore}
                      </div>
                      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t("health")}</span>
                    </div>
                  )}
                  <p className="flex-1 text-sm leading-relaxed text-muted-foreground">{aiInsights.summary}</p>
                </div>

                {aiInsights.insights.length > 0 && (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {aiInsights.insights.map((insight, i) => (
                      <div key={i} className="flex gap-2.5 rounded-xl border border-border/50 bg-background/50 chip-pad">
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
                  <div className="rounded-xl border border-sky-200/50 bg-sky-50/50 space-y-1.5 chip-pad">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-status-applied">
                      <Zap className="h-3.5 w-3.5" /> {t("recommendations")}
                    </p>
                    {aiInsights.recommendations.map((rec, i) => (
                      <p key={i} className="pl-5 text-sm text-sky-900">• {rec}</p>
                    ))}
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  {aiInsights.data.topJobs.length > 0 && (
                    <div className="rounded-xl border border-border/50 chip-pad">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("topJobs30d")}</p>
                      <div className="space-y-2">
                        {aiInsights.data.topJobs.map((j, i) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <div className="min-w-0">
                              <span className="block truncate font-medium">{j.title}</span>
                              <span className="text-xs text-muted-foreground">{j.company}</span>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <Badge variant="secondary" className="text-[11px]">{j.applications} {t("apps")}</Badge>
                              <ScoreBadge score={j.avgScore || undefined} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {aiInsights.data.avgDaysInPipeline > 0 && (
                    <div className="rounded-xl border border-border/50 chip-pad">
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

        {/* ─── Expandable Filters ─────────────────────────────────────── */}
        {showFilters && (
          <div className="mt-4 space-y-3 rounded-3xl border border-border/30 bg-background/40 backdrop-blur-sm card-pad">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("searchPlaceholder")}
                value={search}
                onChange={(v) => { setSearch(v.target.value); resetPage(); }}
                className="h-11 rounded-xl border-border bg-card pl-9 text-sm shadow-none"
              />
            </div>

            <div className="grid grid-cols-3 gap-1.5 sm:gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SearchableSelect
                className="h-9 w-full rounded-xl border-border bg-card sm:h-11"
                options={STATUS_OPTIONS}
                value={status}
                onValueChange={(v) => { setStatus(v); resetPage(); }}
                placeholder={t("allStatuses")}
              />
              {employerOptions.length > 2 && (
                <SearchableSelect
                  className="h-9 w-full rounded-xl border-border bg-card sm:h-11"
                  options={employerOptions}
                  value={employerId}
                  onValueChange={(v) => { setEmployerId(v); resetPage(); }}
                  placeholder={t("allEmployers")}
                />
              )}
              <SearchableSelect
                className="h-9 w-full rounded-xl border-border bg-card sm:h-11"
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
                <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">{activeFilters} {t("active")}</Badge>
              )}
            </div>

            {showAdvancedFilters && (
              <div className="grid grid-cols-3 gap-1.5 pt-1 sm:gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <SearchableSelect
                  className="h-9 w-full rounded-xl border-border bg-card sm:h-11"
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
                  className="h-9 w-full rounded-xl border-border bg-card sm:h-11"
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
      </DashboardPageHeader>

      {/* ─── Application List ─────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-3xl border border-border/60 bg-background/70" />
          ))}
        </div>
      ) : applications.length === 0 ? (
        <div className="workspace-panel-surface rounded-3xl px-4 py-8 sm:px-6 sm:py-16 text-center">
          <div className="workspace-muted-pill mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl">
            <Inbox className="h-7 w-7" />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {activeFilters ? t("noMatchingApplications") : t("noApplicationsYet")}
          </p>
          <h3 className="heading-subsection mt-3 font-semibold tracking-tight text-foreground">
            {activeFilters ? t("noApplicationsMatchFilters") : t("noApplicationsFound")}
          </h3>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
            {activeFilters
              ? t("tryWideningFilters")
              : t("applicationsAppearHere")}
          </p>
          {activeFilters > 0 && (
            <Button size="lg" onClick={clearAllFilters} variant="outline" className="mt-6 rounded-xl border-border bg-background/70 px-4 text-sm">
              {t("clearFilters")}
            </Button>
          )}
        </div>
      ) : (
        <section className="workspace-panel-surface overflow-hidden rounded-3xl">
          {/* List header with privacy notice */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border/70 bg-background/50 px-4 py-3 sm:gap-3 sm:px-5 sm:py-4">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("candidate")}</span>
              <CandidateDataNotice variant="candidateList" compact />
            </div>
          </div>

          {/* Bulk bar. Appears only with a selection, so the resting list is
              unchanged; the endpoint behind it is the one the employer
              workspace has always used. */}
          {selectedIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b border-border/70 bg-primary/5 px-3 py-2 sm:px-5 sm:py-3">
              <span className="text-xs font-semibold text-foreground">
                {t("selectedCount", { count: selectedIds.length })}
              </span>
              <SearchableSelect
                className="h-9 w-44 rounded-lg border-border bg-card text-xs"
                options={STATUSES.map((value) => ({ value, label: t(statusLabelKey(value)) }))}
                value={bulkStatus}
                onValueChange={(value) => setBulkStatus(value ?? "")}
                placeholder={t("bulkChangeStatus")}
              />
              <Button
                size="sm"
                className="max-sm:min-h-11"
                disabled={!bulkStatus || bulkRunning}
                onClick={() => void runBulkStatus()}
              >
                {bulkRunning ? <RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                {t("bulkApply")}
              </Button>
              <Button variant="ghost" size="sm" className="max-sm:min-h-11" onClick={() => setSelectedIds([])}>
                {t("clearSelection")}
              </Button>
            </div>
          )}

          {/* Column headers */}
          <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] items-center gap-4 border-b border-border/70 bg-background/50 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground lg:grid">
            <span className="flex items-center gap-3">
              <label className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center sm:min-h-0 sm:min-w-0">
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={toggleSelectAll}
                  aria-label={t("selectAllOnPage")}
                />
              </label>
              {t("candidate")}
            </span>
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
              const appliedDate = formatDate(new Date(app.appliedAt ?? app.createdAt), { day: "2-digit", month: "short" });
              const aiScoreLabel = app.aiMatchScore != null ? `${app.aiMatchScore}% match` : null;
              const aiScoreColor = app.aiMatchScore != null
                ? app.aiMatchScore >= 80 ? "bg-status-selected-bg text-emerald-700"
                  : app.aiMatchScore >= 60 ? "bg-status-applied-bg text-status-applied"
                  : app.aiMatchScore >= 40 ? "bg-status-shortlisted-bg text-status-shortlisted"
                  : "bg-status-rejected-bg text-status-rejected"
                : "";

              const isExpanded = expandedId === app._id;
              const seekerContact = seeker?.email ?? seeker?.userId?.email;
              const seekerPhone = seeker?.phone ?? seeker?.userId?.phone;
              const cvHref = seeker?.cvUrl ?? seeker?.resumeUrl;

              return (
                <article
                  key={app._id}
                  className="grid gap-1 bg-transparent px-3 py-2 transition-all duration-200 hover:bg-background/70 sm:gap-3 sm:px-5 sm:py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-center"
                >
                  {/* Candidate */}
                  <div className="flex min-w-0 items-center gap-2 sm:gap-4">
                    {/* The box stays 16px so the row does not grow; the label
                        around it is the 44px target a thumb needs, because
                        selecting rows is the repeated gesture in a bulk edit. */}
                    <label className="-m-2 flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center p-2 sm:m-0 sm:min-h-0 sm:min-w-0 sm:p-0">
                      <Checkbox
                        checked={selectedIds.includes(app._id)}
                        onCheckedChange={() => toggleSelected(app._id)}
                        aria-label={t("selectApplication")}
                        className="shrink-0"
                      />
                    </label>
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-status-applied shadow-inner sm:h-10 sm:w-10 sm:rounded-xl">
                      <User className="h-3.5 w-3.5 sm:h-5 sm:w-5" />
                    </div>
                    {/* flex-1 only on phones: it lets the name column use the
                        width freed by the smaller avatar. On desktop the column
                        must stay content-sized, exactly as it was. */}
                    <div className="min-w-0 flex-1 sm:flex-initial">
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                        <span className="truncate text-[13px] font-semibold tracking-tight text-foreground sm:text-base">{candidateName}</span>
                        <StatusBadge status={app.status} />
                      </div>
                      {employer?.companyName && (
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground sm:mt-1 sm:gap-1.5 sm:text-xs">
                          <Building2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
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
                    {/* Match, skills, applied date and source share one wrapping
                        line on phones — they were three stacked rows before. */}
                    <div className="mt-1 flex flex-wrap items-center gap-1 sm:mt-1.5 sm:gap-1.5">
                      {aiScoreLabel && (
                        <Badge className={`${aiScoreColor} rounded-full px-2 py-0 text-[11px] font-semibold sm:px-2.5 sm:py-0.5 sm:text-[11px]`}>
                          {aiScoreLabel}
                        </Badge>
                      )}
                      {topSkills.map((skill, i) => (
                        <span
                          key={skill}
                          className={`rounded-full border border-border bg-background/70 px-2 py-0 text-[11px] text-muted-foreground sm:px-2.5 sm:py-0.5 sm:text-xs ${i >= 2 ? "hidden sm:inline-block" : ""}`}
                        >
                          {skill}
                        </span>
                      ))}
                      {topSkills.length === 0 && !aiScoreLabel && (
                        <span className="text-[11px] text-muted-foreground sm:text-xs">{t("noSkillsListed")}</span>
                      )}
                      <span className="text-[11px] text-muted-foreground sm:hidden">
                        {t("applied")} {appliedDate}
                      </span>
                    </div>
                    <div className="mt-1.5 hidden flex-wrap items-center gap-2.5 text-xs text-muted-foreground sm:flex">
                      <span>{t("applied")} {appliedDate}</span>
                      <Badge variant={app.autoApplied ? "warning" : "secondary"} className="text-[11px]">
                        {sourceLabel(app.source)}
                      </Badge>
                    </div>
                  </div>

                  {/* Score + manage — the match badge above already states score on phones. */}
                  <div className="flex items-center gap-2 sm:justify-end">
                    <span className="hidden sm:inline-flex"><ScoreBadge score={app.aiMatchScore} /></span>
                    <SearchableSelect
                      className="h-8 w-40 rounded-lg border-border bg-card text-xs"
                      options={STATUSES.map((s) => ({ value: s, label: t(statusLabelKey(s)) }))}
                      value={app.status}
                      onValueChange={(v) => { if (v && v !== app.status) void handleStatusChange(app._id, v); }}
                      placeholder={t("status")}
                      disabled={updatingId === app._id}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 min-h-11 px-2 sm:min-h-0"
                      aria-expanded={isExpanded}
                      aria-label={isExpanded ? t("hideDetails") : t("showDetails")}
                      onClick={() => setExpandedId(isExpanded ? null : app._id)}
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>

                  {/* Inline detail. A panel here keeps the list, its filters and
                      the scroll position intact — the alternative was leaving for
                      another page and searching for the same person again. */}
                  {isExpanded && (
                    <div className="rounded-xl border border-border/70 bg-card/60 p-3 text-xs sm:col-span-3 sm:p-4">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                          <p className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">{t("detailContact")}</p>
                          <p className="truncate text-foreground">{seekerContact ?? "—"}</p>
                          {seekerPhone && <p className="truncate text-muted-foreground">{seekerPhone}</p>}
                          {seeker?.currentLocation && <p className="truncate text-muted-foreground">{seeker.currentLocation}</p>}
                        </div>
                        <div className="sm:col-span-2">
                          <p className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">{t("detailSkills")}</p>
                          {seeker?.skills?.length ? (
                            <div className="flex flex-wrap gap-1">
                              {seeker.skills.slice(0, 12).map((skill) => (
                                <span key={skill} className="rounded-full border border-border bg-background/70 px-2 py-0.5 text-[11px] text-muted-foreground">
                                  {skill}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-muted-foreground">{t("detailNoSkills")}</p>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                        {cvHref && (
                          <a href={cvHref} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 font-medium text-primary hover:underline sm:min-h-0">
                            <FileText className="h-3.5 w-3.5" /> {t("openCv")}
                          </a>
                        )}
                        {job?.title && (
                          <Link href={`/${locale}/admin/jobs?search=${encodeURIComponent(job.title)}`} className="inline-flex min-h-11 items-center gap-1 font-medium text-primary hover:underline sm:min-h-0">
                            <Briefcase className="h-3.5 w-3.5" /> {t("viewJob")}
                          </Link>
                        )}
                        <Link
                          href={`/${locale}/admin/job-seekers?search=${encodeURIComponent(candidateName)}`}
                          className="inline-flex min-h-11 items-center gap-1 font-medium text-primary hover:underline sm:min-h-0"
                        >
                          <User className="h-3.5 w-3.5" /> {t("viewCandidateProfile")}
                        </Link>
                      </div>
                    </div>
                  )}
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
