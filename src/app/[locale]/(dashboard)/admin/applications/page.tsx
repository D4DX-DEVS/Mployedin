"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { usePagination } from "@/hooks/usePagination";
import {
  Search, Inbox, Sparkles, Calendar, Building2, ArrowUpDown,
  TrendingUp, Users, FileText, Brain, ChevronDown, ChevronUp,
  Filter, BarChart3, Zap, AlertTriangle, CheckCircle, Info, Target,
  RefreshCw, Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

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
const STATUS_OPTIONS = [{ value: "", label: "All Statuses" }, ...STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))];
const SOURCE_OPTIONS = [
  { value: "", label: "All Sources" },
  { value: "easy_apply", label: "Easy Apply" },
  { value: "full_form", label: "Full Form" },
  { value: "direct", label: "Direct" },
  { value: "auto_apply", label: "Auto Apply" },
];
const SORT_OPTIONS = [
  { value: "appliedAt", label: "Applied Date" },
  { value: "aiMatchScore", label: "AI Match Score" },
  { value: "status", label: "Status" },
];
const SCORE_RANGE_OPTIONS = [
  { value: "", label: "All Scores" },
  { value: "80-100", label: "Excellent (80-100)" },
  { value: "60-79", label: "Good (60-79)" },
  { value: "40-59", label: "Average (40-59)" },
  { value: "0-39", label: "Low (0-39)" },
];

function statusLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function sourceLabel(s?: string) {
  return SOURCE_OPTIONS.find((o) => o.value === s)?.label ?? s ?? "—";
}

function InsightIcon({ type }: { type: string }) {
  switch (type) {
    case "positive": return <CheckCircle className="h-4 w-4 text-emerald-500" />;
    case "warning": return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    case "action": return <Target className="h-4 w-4 text-blue-500" />;
    default: return <Info className="h-4 w-4 text-sky-500" />;
  }
}

function ScoreBadge({ score }: { score?: number }) {
  if (score == null) return <span className="text-xs text-muted-foreground">—</span>;
  const color = score >= 80 ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400"
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
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // AI Insights
  const [aiInsights, setAiInsights] = useState<AIInsightsData | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);

  // AI Search
  const [aiQuery, setAiQuery] = useState("");
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isApplyingAiSearch, setIsApplyingAiSearch] = useState(false);

  // Active filter count
  const activeFilters = [status, employerId, source, scoreRange, dateFrom, dateTo].filter(Boolean).length;

  /* ---- Fetch applications ---- */
  const fetchApplications = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
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
    // Fetch employers & stats only on initial load
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
  }, [search, status, employerId, source, scoreRange, dateFrom, dateTo, sortBy, sortOrder, page, limit]);

  useEffect(() => { fetchApplications(); }, [fetchApplications]);

  /* ---- Fetch AI insights ---- */
  const fetchAiInsights = useCallback(async () => {
    setAiLoading(true);
    try {
      const res = await fetch("/api/applications/ai-insights");
      if (res.ok) {
        setAiInsights(await res.json());
      }
    } catch { /* swallow */ }
    setAiLoading(false);
  }, []);

  /* ---- AI Search ---- */
  const scoreBandToRange: Record<string, string> = {
    excellent: "80-100",
    good: "60-79",
    average: "40-59",
    low: "0-39",
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

      // Match employer by name if returned
      if (f.employer && employers.length > 0) {
        const match = employers.find((e) =>
          e.companyName.toLowerCase().includes(f.employer!.toLowerCase())
        );
        setEmployerId(match?._id ?? "");
      } else {
        setEmployerId("");
      }

      // Open advanced if AI set advanced filters
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
  };

  const toggleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "desc" ? "asc" : "desc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
    resetPage();
  };

  const employerOptions = [
    { value: "", label: "All Employers" },
    ...employers.map((e) => ({ value: e._id, label: e.companyName })),
  ];

  return (
    <div className="page-container space-y-5">
      {/* Header + AI toggle */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader title="Applications" description="View and manage all job applications across the platform" />
        <Button
          variant={showAiPanel ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setShowAiPanel(!showAiPanel);
            if (!showAiPanel && !aiInsights) fetchAiInsights();
          }}
          className="gap-2"
        >
          <Sparkles className="h-4 w-4" />
          AI Insights
        </Button>
      </div>

      {/* ───── Stats Cards ───── */}
      {stats && (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Total</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight">{stats.totalAll}</p>
                <p className="mt-1 text-xs text-muted-foreground">All applications</p>
              </div>
              <div className="workspace-tone-blue rounded-2xl p-2.5"><FileText className="h-5 w-5" /></div>
            </div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Today</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-emerald-600 dark:text-emerald-400">{stats.todayCount}</p>
                <p className="mt-1 text-xs text-muted-foreground">New today</p>
              </div>
              <div className="workspace-tone-green rounded-2xl p-2.5"><TrendingUp className="h-5 w-5" /></div>
            </div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">This Week</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-blue-600 dark:text-blue-400">{stats.weekCount}</p>
                <p className="mt-1 text-xs text-muted-foreground">Last 7 days</p>
              </div>
              <div className="workspace-tone-blue rounded-2xl p-2.5"><BarChart3 className="h-5 w-5" /></div>
            </div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">AI Scored</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-violet-600 dark:text-violet-400">{stats.scoredCount}</p>
                <p className="mt-1 text-xs text-muted-foreground">Avg: {stats.avgAiScore}%</p>
              </div>
              <div className="workspace-tone-violet rounded-2xl p-2.5"><Brain className="h-5 w-5" /></div>
            </div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Pipeline</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-amber-600 dark:text-amber-400">
                  {stats.byStatus?.["shortlisted"] ?? 0}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">In shortlist</p>
              </div>
              <div className="workspace-tone-amber rounded-2xl p-2.5"><Users className="h-5 w-5" /></div>
            </div>
          </div>
        </section>
      )}

      {/* ───── AI Insights Panel ───── */}
      {showAiPanel && (
        <section className="workspace-panel-surface rounded-[28px] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-sky-500" />
              <h3 className="text-lg font-semibold">AI Pipeline Insights</h3>
            </div>
            <Button variant="ghost" size="sm" onClick={fetchAiInsights} disabled={aiLoading} className="gap-1.5">
              <RefreshCw className={`h-3.5 w-3.5 ${aiLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {aiLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : aiInsights ? (
            <div className="space-y-4">
              {/* Health score + summary */}
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
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Health</span>
                  </div>
                )}
                <p className="flex-1 text-sm text-muted-foreground leading-relaxed">{aiInsights.summary}</p>
              </div>

              {/* Insights */}
              {aiInsights.insights.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {aiInsights.insights.map((insight, i) => (
                    <div key={i} className="flex gap-2.5 rounded-xl border border-border/50 bg-background/50 p-3">
                      <InsightIcon type={insight.type} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{insight.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{insight.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Recommendations */}
              {aiInsights.recommendations.length > 0 && (
                <div className="rounded-xl border border-sky-200/50 dark:border-sky-800/30 bg-sky-50/50 dark:bg-sky-950/20 p-3 space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-400 flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5" /> Recommendations
                  </p>
                  {aiInsights.recommendations.map((rec, i) => (
                    <p key={i} className="text-sm text-sky-900 dark:text-sky-200 pl-5">• {rec}</p>
                  ))}
                </div>
              )}

              {/* Top Jobs + Score Distribution */}
              <div className="grid gap-3 sm:grid-cols-2">
                {aiInsights.data.topJobs.length > 0 && (
                  <div className="rounded-xl border border-border/50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Top Jobs (30d)</p>
                    <div className="space-y-2">
                      {aiInsights.data.topJobs.map((j, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <div className="min-w-0">
                            <span className="font-medium truncate block">{j.title}</span>
                            <span className="text-xs text-muted-foreground">{j.company}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant="secondary" className="text-[10px]">{j.applications} apps</Badge>
                            <ScoreBadge score={j.avgScore || undefined} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {aiInsights.data.avgDaysInPipeline > 0 && (
                  <div className="rounded-xl border border-border/50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Pipeline Metrics</p>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Avg. days in pipeline</span>
                        <span className="font-semibold">{aiInsights.data.avgDaysInPipeline}d</span>
                      </div>
                      {aiInsights.data.scoreDistribution.map((sd, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Score {sd.range}</span>
                          <span className="font-medium">{sd.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Click Refresh to load AI insights.</p>
          )}
        </section>
      )}

      {/* ───── Filters ───── */}
      <section className="workspace-panel-surface rounded-[28px] p-4 sm:p-5 space-y-3">
        {/* Primary row */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="relative min-w-0">
            <label htmlFor="admin-apps-search" className="sr-only">Search</label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="admin-apps-search"
              placeholder="Search applicant, job, company, skills…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); resetPage(); }}
              className="h-11 rounded-xl border-border bg-secondary/65 pl-9 text-sm shadow-none"
            />
          </div>
          <div>
            <label htmlFor="admin-apps-status" className="sr-only">Status</label>
            <SearchableSelect
              id="admin-apps-status"
              className="h-11 w-full rounded-xl border-border bg-secondary/65"
              options={STATUS_OPTIONS}
              value={status}
              onValueChange={(v) => { setStatus(v); resetPage(); }}
              placeholder="All Statuses"
            />
          </div>
          {employerOptions.length > 2 && (
            <div>
              <label htmlFor="admin-apps-employer" className="sr-only">Employer</label>
              <SearchableSelect
                id="admin-apps-employer"
                className="h-11 w-full rounded-xl border-border bg-secondary/65"
                options={employerOptions}
                value={employerId}
                onValueChange={(v) => { setEmployerId(v); resetPage(); }}
                placeholder="All Employers"
              />
            </div>
          )}
          <div>
            <label htmlFor="admin-apps-source" className="sr-only">Source</label>
            <SearchableSelect
              id="admin-apps-source"
              className="h-11 w-full rounded-xl border-border bg-secondary/65"
              options={SOURCE_OPTIONS}
              value={source}
              onValueChange={(v) => { setSource(v); resetPage(); }}
              placeholder="All Sources"
            />
          </div>
        </div>

        {/* Toggle advanced */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Filter className="h-3.5 w-3.5" />
            Advanced Filters
            {showAdvancedFilters ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {activeFilters > 0 && (
            <>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{activeFilters} active</Badge>
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-[11px] text-red-500 hover:text-red-600 font-medium"
              >
                Clear all
              </button>
            </>
          )}
        </div>

        {/* Advanced filters row */}
        {showAdvancedFilters && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 pt-1">
            <div>
              <label htmlFor="admin-apps-score" className="sr-only">AI Score Range</label>
              <SearchableSelect
                id="admin-apps-score"
                className="h-11 w-full rounded-xl border-border bg-secondary/65"
                options={SCORE_RANGE_OPTIONS}
                value={scoreRange}
                onValueChange={(v) => { setScoreRange(v); resetPage(); }}
                placeholder="All AI Scores"
              />
            </div>
            <div className="relative min-w-0">
              <label htmlFor="admin-apps-date-from" className="sr-only">Date From</label>
              <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="admin-apps-date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); resetPage(); }}
                className="h-11 rounded-xl border-border bg-secondary/65 pl-9 text-sm shadow-none"
                placeholder="From date"
              />
            </div>
            <div className="relative min-w-0">
              <label htmlFor="admin-apps-date-to" className="sr-only">Date To</label>
              <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="admin-apps-date-to"
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); resetPage(); }}
                className="h-11 rounded-xl border-border bg-secondary/65 pl-9 text-sm shadow-none"
                placeholder="To date"
              />
            </div>
            <div>
              <label htmlFor="admin-apps-sort" className="sr-only">Sort By</label>
              <SearchableSelect
                id="admin-apps-sort"
                className="h-11 w-full rounded-xl border-border bg-secondary/65"
                options={SORT_OPTIONS}
                value={sortBy}
                onValueChange={(v) => { setSortBy(v); resetPage(); }}
                placeholder="Sort by"
              />
            </div>
          </div>
        )}

        {/* AI Search */}
        <div className="mt-1 grid gap-3 xl:grid-cols-[1fr_auto]">
          <div className="relative min-w-0">
            <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-500" />
            <Input
              placeholder='AI search: e.g. "rejected applications from d4dx" or "high score easy apply this week"'
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleApplyAiSearch();
                }
              }}
              className="h-11 rounded-xl border-border bg-secondary/65 pl-9 text-sm shadow-none"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => { void handleApplyAiSearch(); }}
              disabled={!aiQuery.trim() || isApplyingAiSearch}
              className="h-11 gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Wand2 className="h-4 w-4" />
              {isApplyingAiSearch ? "Applying…" : "AI Search"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={clearAllFilters}
              disabled={!activeFilters && !aiQuery && !aiSummary}
              className="h-11 rounded-xl border-border bg-secondary/65 px-4 text-sm"
            >
              Clear filters
            </Button>
          </div>
        </div>

        {aiSummary && (
          <p className="mt-2 rounded-xl bg-primary/5 px-4 py-2.5 text-sm text-primary">
            <Sparkles className="mr-1.5 inline-block h-3.5 w-3.5" />
            {aiSummary}
          </p>
        )}
      </section>

      {/* ───── Table ───── */}
      {loading ? (
        <div className="rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm shadow-black/[0.03]">
          <div className="bg-muted/30 px-4 py-3 h-10 animate-pulse" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="border-t px-4 py-3 h-14 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm shadow-black/[0.03]">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>Applicant</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("appliedAt")}>
                    Employer
                    <Building2 className="h-3 w-3 text-muted-foreground" />
                  </button>
                </TableHead>
                <TableHead>
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("status")}>
                    Status
                    <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                  </button>
                </TableHead>
                <TableHead>
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("aiMatchScore")}>
                    AI Score
                    <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                  </button>
                </TableHead>
                <TableHead>Source</TableHead>
                <TableHead>
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("appliedAt")}>
                    Applied
                    <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                  </button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    <Inbox className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                    No applications found
                  </TableCell>
                </TableRow>
              ) : applications.map((app) => {
                const seeker = app.jobSeekerId;
                const job = app.jobId;
                const employer = job?.employerId;

                return (
                  <TableRow key={app._id}>
                    {/* Applicant */}
                    <TableCell>
                      <div className="font-medium">{seeker?.fullName ?? seeker?.userId?.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{seeker?.email ?? seeker?.userId?.email ?? ""}</div>
                      {seeker?.skills && seeker.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {seeker.skills.slice(0, 3).map((s) => (
                            <Badge key={s} variant="outline" className="text-[9px] px-1 py-0">{s}</Badge>
                          ))}
                          {seeker.skills.length > 3 && (
                            <span className="text-[9px] text-muted-foreground">+{seeker.skills.length - 3}</span>
                          )}
                        </div>
                      )}
                    </TableCell>

                    {/* Job */}
                    <TableCell>
                      <div className="text-foreground/80 font-medium">{job?.title ?? "—"}</div>
                      {job?.location && (
                        <div className="text-[10px] text-muted-foreground">
                          {job.location.isRemote ? "Remote" : [job.location.city, job.location.country].filter(Boolean).join(", ")}
                        </div>
                      )}
                    </TableCell>

                    {/* Employer */}
                    <TableCell>
                      <div className="text-sm">{employer?.companyName ?? "—"}</div>
                    </TableCell>

                    {/* Status */}
                    <TableCell><StatusBadge status={app.status} /></TableCell>

                    {/* AI Score */}
                    <TableCell><ScoreBadge score={app.aiMatchScore} /></TableCell>

                    {/* Source */}
                    <TableCell>
                      <Badge variant={app.autoApplied ? "warning" : "secondary"} className="text-[10px]">
                        {sourceLabel(app.source)}
                      </Badge>
                    </TableCell>

                    {/* Applied date */}
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {new Date(app.appliedAt ?? app.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
    </div>
  );
}
