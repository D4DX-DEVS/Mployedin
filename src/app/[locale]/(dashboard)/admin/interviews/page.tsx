"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Search, Eye, Inbox, Calendar, Video, MapPin, Blend, Sparkles, Loader2, TrendingUp, AlertTriangle, Clock, BarChart3, RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface Interview {
  _id: string;
  scheduledAt: string;
  status: "scheduled" | "completed" | "cancelled" | "no_show";
  type: string;
  location?: string;
  meetLink?: string;
  duration?: number;
  jobSeeker?: { name: string; email: string };
  employer?: { _id?: string; companyName: string };
  job?: { title: string };
  agent?: { _id?: string; name: string };
}

interface FilterOption { value: string; label: string }

/* ---------- AI Insights helpers ---------- */
interface AiInsight {
  icon: "trend" | "warning" | "clock" | "chart";
  title: string;
  body: string;
  color: string;
}

function computeAiInsights(interviews: Interview[]): AiInsight[] {
  if (interviews.length === 0) return [];

  const insights: AiInsight[] = [];
  const total = interviews.length;
  const completed = interviews.filter((i) => i.status === "completed").length;
  const cancelled = interviews.filter((i) => i.status === "cancelled").length;
  const noShow = interviews.filter((i) => i.status === "no_show").length;
  const scheduled = interviews.filter((i) => i.status === "scheduled").length;

  // Completion rate insight
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  insights.push({
    icon: "chart",
    title: "Completion Rate",
    body: `${completionRate}% of interviews completed (${completed}/${total}). ${completionRate >= 70 ? "Good performance." : "Consider follow-ups to improve attendance."}`,
    color: completionRate >= 70 ? "text-emerald-600" : "text-amber-600",
  });

  // No-show alert
  if (noShow > 0) {
    const noShowRate = Math.round((noShow / total) * 100);
    insights.push({
      icon: "warning",
      title: "No-Show Alert",
      body: `${noShow} no-show${noShow > 1 ? "s" : ""} detected (${noShowRate}%). ${noShowRate > 15 ? "High rate — consider reminder notifications." : "Within acceptable range."}`,
      color: noShowRate > 15 ? "text-destructive" : "text-amber-600",
    });
  }

  // Upcoming scheduled
  if (scheduled > 0) {
    const upcoming = interviews.filter((i) => i.status === "scheduled" && new Date(i.scheduledAt) > new Date());
    insights.push({
      icon: "clock",
      title: "Upcoming Interviews",
      body: `${upcoming.length} interview${upcoming.length !== 1 ? "s" : ""} scheduled ahead. ${scheduled - upcoming.length > 0 ? `${scheduled - upcoming.length} overdue.` : "All on track."}`,
      color: scheduled - upcoming.length > 0 ? "text-amber-600" : "text-blue-600",
    });
  }

  // Cancellation trend
  if (cancelled > 0) {
    const cancelRate = Math.round((cancelled / total) * 100);
    insights.push({
      icon: "trend",
      title: "Cancellation Trend",
      body: `${cancelled} cancelled (${cancelRate}%). ${cancelRate > 20 ? "High cancellation rate — investigate scheduling conflicts." : "Cancellation rate is manageable."}`,
      color: cancelRate > 20 ? "text-destructive" : "text-muted-foreground",
    });
  }

  return insights;
}

const INSIGHT_ICONS = {
  trend: TrendingUp,
  warning: AlertTriangle,
  clock: Clock,
  chart: BarChart3,
} as const;

const TYPE_ICON = { video: Video, offline: MapPin, hybrid: Blend } as const;

/* ---------- Page ---------- */

export default function AdminInterviewOversightPage() {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateRange, setDateRange] = useState("all");

  // Entity filter dropdowns
  const [employers, setEmployers] = useState<FilterOption[]>([]);
  const [agents, setAgents] = useState<FilterOption[]>([]);
  const [superAgents, setSuperAgents] = useState<FilterOption[]>([]);
  const [selectedEmployer, setSelectedEmployer] = useState("all");
  const [selectedAgent, setSelectedAgent] = useState("all");
  const [selectedSuperAgent, setSelectedSuperAgent] = useState("all");

  // AI insights
  const [showInsights, setShowInsights] = useState(false);
  const aiInsights = useMemo(() => computeAiInsights(interviews), [interviews]);

  // Fetch employer, agent, super-agent lists for filters
  useEffect(() => {
    (async () => {
      try {
        const [empRes, agentRes, saRes] = await Promise.all([
          fetch("/api/employers?limit=500&fields=companyName"),
          fetch("/api/admin/agents?limit=500"),
          fetch("/api/admin/super-agents?limit=500"),
        ]);
        if (empRes.ok) {
          const data = await empRes.json();
          const list = (data.employers ?? data.items ?? data ?? []) as { _id: string; companyName?: string }[];
          setEmployers([{ value: "all", label: "All employers" }, ...list.map((e) => ({ value: e._id, label: e.companyName ?? e._id }))]);
        }
        if (agentRes.ok) {
          const data = await agentRes.json();
          const list = (data.agents ?? data.items ?? data ?? []) as { _id: string; userId?: { name?: string; email?: string } | string; name?: string }[];
          setAgents([{ value: "all", label: "All agents" }, ...list.map((a) => {
            const label = typeof a.userId === "object" ? (a.userId?.name ?? a.userId?.email ?? a._id) : (a.name ?? a._id);
            return { value: a._id, label };
          })]);
        }
        if (saRes.ok) {
          const data = await saRes.json();
          const list = (data.superAgents ?? data.items ?? data ?? []) as { _id: string; userId?: { name?: string; email?: string } | string; name?: string }[];
          setSuperAgents([{ value: "all", label: "All super agents" }, ...list.map((s) => {
            const label = typeof s.userId === "object" ? (s.userId?.name ?? s.userId?.email ?? s._id) : (s.name ?? s._id);
            return { value: s._id, label };
          })]);
        }
      } catch { /* filter options non-critical */ }
    })();
  }, []);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (search) n++;
    if (statusFilter !== "all") n++;
    if (typeFilter !== "all") n++;
    if (dateRange !== "all") n++;
    if (selectedEmployer !== "all") n++;
    if (selectedAgent !== "all") n++;
    if (selectedSuperAgent !== "all") n++;
    return n;
  }, [search, statusFilter, typeFilter, dateRange, selectedEmployer, selectedAgent, selectedSuperAgent]);

  const clearAllFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setTypeFilter("all");
    setDateRange("all");
    setSelectedEmployer("all");
    setSelectedAgent("all");
    setSelectedSuperAgent("all");
    resetPage();
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (dateRange !== "all") params.set("dateRange", dateRange);
      if (selectedEmployer !== "all") params.set("employerId", selectedEmployer);
      if (selectedAgent !== "all") params.set("agentId", selectedAgent);
      if (selectedSuperAgent !== "all") params.set("superAgentId", selectedSuperAgent);

      const res = await fetch(`/api/admin/interviews?${params}`);
      if (res.ok) {
        const data = await res.json();
        setInterviews(data.interviews ?? []);
        updateTotal(data.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, typeFilter, dateRange, selectedEmployer, selectedAgent, selectedSuperAgent, limit]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="page-container space-y-6">
      <PageHeader
        title="Interview Oversight"
        description={`${total} interviews across the platform`}
      />

      {/* Filters */}
      <section className="card-base space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Browse &amp; filter</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Find interviews</h2>
            <p className="mt-1 text-sm text-muted-foreground">Filter by employer, agent, super agent, status, type, date range, or search by candidate.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0 pt-1">
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-xs text-muted-foreground gap-1.5">
                <RotateCcw className="h-3 w-3" /> Clear {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""}
              </Button>
            )}
            <Button
              variant={showInsights ? "default" : "outline"}
              size="sm"
              onClick={() => setShowInsights(!showInsights)}
              className="gap-1.5 text-xs"
            >
              <Sparkles className="h-3.5 w-3.5" /> AI Insights
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="relative min-w-0">
            <label htmlFor="admin-interviews-search" className="sr-only">Search interviews</label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="admin-interviews-search"
              placeholder="Search candidate or company…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); resetPage(); }}
              className="h-11 rounded-xl border-border bg-secondary/65 pl-9 text-sm shadow-none"
            />
          </div>
          <div>
            <label htmlFor="admin-interviews-status" className="sr-only">Status</label>
            <SearchableSelect
              id="admin-interviews-status"
              className="h-11 w-full rounded-xl border-border bg-secondary/65"
              options={[
                { value: "all", label: "All statuses" },
                { value: "scheduled", label: "Scheduled" },
                { value: "completed", label: "Completed" },
                { value: "cancelled", label: "Cancelled" },
                { value: "no_show", label: "No Show" },
              ]}
              value={statusFilter}
              onValueChange={(v) => { setStatusFilter(v); resetPage(); }}
              placeholder="All statuses"
            />
          </div>
          <div>
            <label htmlFor="admin-interviews-type" className="sr-only">Interview Type</label>
            <SearchableSelect
              id="admin-interviews-type"
              className="h-11 w-full rounded-xl border-border bg-secondary/65"
              options={[
                { value: "all", label: "All types" },
                { value: "video", label: "Video" },
                { value: "offline", label: "Offline" },
                { value: "hybrid", label: "Hybrid" },
              ]}
              value={typeFilter}
              onValueChange={(v) => { setTypeFilter(v); resetPage(); }}
              placeholder="All types"
            />
          </div>
          <div>
            <label htmlFor="admin-interviews-daterange" className="sr-only">Date Range</label>
            <SearchableSelect
              id="admin-interviews-daterange"
              className="h-11 w-full rounded-xl border-border bg-secondary/65"
              options={[
                { value: "all", label: "All dates" },
                { value: "today", label: "Today" },
                { value: "3days", label: "Last 3 days" },
                { value: "7days", label: "Last 7 days" },
                { value: "30days", label: "Last 30 days" },
                { value: "90days", label: "Last 90 days" },
                { value: "upcoming", label: "Upcoming only" },
              ]}
              value={dateRange}
              onValueChange={(v) => { setDateRange(v); resetPage(); }}
              placeholder="All dates"
            />
          </div>
          {employers.length > 1 && (
            <div>
              <label htmlFor="admin-interviews-employer" className="sr-only">Employer</label>
              <SearchableSelect
                id="admin-interviews-employer"
                className="h-11 w-full rounded-xl border-border bg-secondary/65"
                options={employers}
                value={selectedEmployer}
                onValueChange={(v) => { setSelectedEmployer(v); resetPage(); }}
                placeholder="All employers"
              />
            </div>
          )}
          {agents.length > 1 && (
            <div>
              <label htmlFor="admin-interviews-agent" className="sr-only">Agent</label>
              <SearchableSelect
                id="admin-interviews-agent"
                className="h-11 w-full rounded-xl border-border bg-secondary/65"
                options={agents}
                value={selectedAgent}
                onValueChange={(v) => { setSelectedAgent(v); resetPage(); }}
                placeholder="All agents"
              />
            </div>
          )}
          {superAgents.length > 1 && (
            <div>
              <label htmlFor="admin-interviews-sa" className="sr-only">Super Agent</label>
              <SearchableSelect
                id="admin-interviews-sa"
                className="h-11 w-full rounded-xl border-border bg-secondary/65"
                options={superAgents}
                value={selectedSuperAgent}
                onValueChange={(v) => { setSelectedSuperAgent(v); resetPage(); }}
                placeholder="All super agents"
              />
            </div>
          )}
        </div>
      </section>

      {/* AI Insights Panel */}
      {showInsights && (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card-base p-4 space-y-2">
                <div className="h-4 w-24 animate-shimmer rounded bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                <div className="h-3 w-full animate-shimmer rounded bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
              </div>
            ))
          ) : aiInsights.length > 0 ? (
            aiInsights.map((insight, i) => {
              const Icon = INSIGHT_ICONS[insight.icon];
              return (
                <div key={i} className="card-base p-4 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${insight.color}`} />
                    <span className="text-sm font-semibold text-foreground">{insight.title}</span>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">{insight.body}</p>
                </div>
              );
            })
          ) : (
            <div className="card-base p-4 col-span-full text-center">
              <p className="text-sm text-muted-foreground">No interview data to analyze yet.</p>
            </div>
          )}
        </section>
      )}

      {/* Table */}
      <div className="rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm shadow-black/[0.03]">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="min-w-[160px] px-4 py-3">Candidate</TableHead>
              <TableHead className="min-w-[180px] px-4 py-3">Role</TableHead>
              <TableHead className="min-w-[120px] px-4 py-3">Company</TableHead>
              <TableHead className="min-w-[80px] px-4 py-3">Type</TableHead>
              <TableHead className="min-w-[100px] px-4 py-3">Agent</TableHead>
              <TableHead className="min-w-[110px] px-4 py-3">Date</TableHead>
              <TableHead className="min-w-[100px] px-4 py-3">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j} className="px-4 py-3">
                      <div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : interviews.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-8 w-8 opacity-40" />
                    <span className="text-sm">No interviews found</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : interviews.map((iv) => {
              const TypeIcon = TYPE_ICON[iv.type as keyof typeof TYPE_ICON] ?? Calendar;
              return (
                <TableRow key={iv._id} className="group">
                  <TableCell className="px-4 py-3">
                    <p className="font-medium truncate">{iv.jobSeeker?.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground truncate">{iv.jobSeeker?.email}</p>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <span className="text-sm text-foreground">{iv.job?.title ?? "—"}</span>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <span className="text-sm text-foreground">{iv.employer?.companyName ?? "—"}</span>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <TypeIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm capitalize text-muted-foreground">{iv.type || "—"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <span className="text-sm text-muted-foreground">{iv.agent?.name ?? "—"}</span>
                  </TableCell>
                  <TableCell className="px-4 py-3 whitespace-nowrap">
                    <span className="text-sm text-muted-foreground">
                      {new Date(iv.scheduledAt).toLocaleDateString("en-AE", { day: "2-digit", month: "short", year: "numeric" })}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <StatusBadge status={iv.status} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {/* Pagination */}
        <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} className="px-4 pb-4 pt-4 border-t mt-4" />
      </div>
    </div>
  );
}
