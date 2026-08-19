"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Search, Inbox, Calendar, Video, MapPin, Blend, Sparkles,
  TrendingUp, AlertTriangle, Clock, BarChart3, RotateCcw, CheckCircle2,
  Filter, ChevronDown, ChevronUp,
} from "lucide-react";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import type { ExportColumn } from "@/lib/export";

interface Interview {
  _id: string;
  scheduledAt: string;
  status: "scheduled" | "confirmed" | "rescheduled" | "completed" | "cancelled" | "no_show";
  outcome?: string;
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

function computeAiInsights(interviews: Interview[], t: ReturnType<typeof useTranslations>): AiInsight[] {
  if (interviews.length === 0) return [];

  const insights: AiInsight[] = [];
  const total = interviews.length;
  const completed = interviews.filter((i) => i.status === "completed").length;
  const cancelled = interviews.filter((i) => i.status === "cancelled").length;
  const noShow = interviews.filter((i) => i.outcome === "no_show").length;
  const scheduled = interviews.filter((i) => ["scheduled", "confirmed", "rescheduled"].includes(i.status)).length;

  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  insights.push({
    icon: "chart",
    title: t("completionRate"),
    body: t("completionRateBody", {
      rate: completionRate,
      completed,
      total,
      performance: completionRate >= 70 ? t("goodPerformance") : t("considerFollowUps"),
    }),
    color: completionRate >= 70 ? "text-status-selected" : "text-status-shortlisted",
  });

  if (noShow > 0) {
    const noShowRate = Math.round((noShow / total) * 100);
    insights.push({
      icon: "warning",
      title: t("noShowAlert"),
      body: t("noShowAlertBody", {
        count: noShow,
        plural: noShow > 1 ? t("noShowPlural") : "",
        rate: noShowRate,
        message: noShowRate > 15 ? t("noShowHighRate") : t("noShowAcceptable"),
      }),
      color: noShowRate > 15 ? "text-destructive" : "text-status-shortlisted",
    });
  }

  if (scheduled > 0) {
    const upcoming = interviews.filter((i) => ["scheduled", "confirmed", "rescheduled"].includes(i.status) && new Date(i.scheduledAt) > new Date());
    const overdueCount = scheduled - upcoming.length;
    insights.push({
      icon: "clock",
      title: t("upcomingInterviews"),
      body: t("upcomingInterviewsBody", {
        upcoming: upcoming.length,
        plural: upcoming.length !== 1 ? t("upcomingPlural") : "",
        overdue: overdueCount > 0 ? t("overdueMessage", { count: overdueCount }) : t("allOnTrack"),
      }),
      color: overdueCount > 0 ? "text-status-shortlisted" : "text-status-applied",
    });
  }

  if (cancelled > 0) {
    const cancelRate = Math.round((cancelled / total) * 100);
    insights.push({
      icon: "trend",
      title: t("cancellationTrend"),
      body: t("cancellationTrendBody", {
        count: cancelled,
        rate: cancelRate,
        message: cancelRate > 20 ? t("highCancellationRate") : t("cancellationManageable"),
      }),
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
  const t = useTranslations("adminInterviews");
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [serverNoShow, setServerNoShow] = useState<number | null>(null);
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateRange, setDateRange] = useState("all");

  const [employers, setEmployers] = useState<FilterOption[]>([]);
  const [agents, setAgents] = useState<FilterOption[]>([]);
  const [superAgents, setSuperAgents] = useState<FilterOption[]>([]);
  const [selectedEmployer, setSelectedEmployer] = useState("all");
  const [selectedAgent, setSelectedAgent] = useState("all");
  const [selectedSuperAgent, setSelectedSuperAgent] = useState("all");

  const [showFilters, setShowFilters] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const aiInsights = useMemo(() => computeAiInsights(interviews, t), [interviews, t]);

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
        } else {
          const err = await empRes.json().catch(() => ({}));
          toast.error(err.error || "Failed to load employers");
        }
        if (agentRes.ok) {
          const data = await agentRes.json();
          const list = (data.agents ?? data.items ?? data ?? []) as { _id: string; userId?: { name?: string; email?: string } | string; name?: string }[];
          setAgents([{ value: "all", label: "All agents" }, ...list.map((a) => {
            const label = typeof a.userId === "object" ? (a.userId?.name ?? a.userId?.email ?? a._id) : (a.name ?? a._id);
            return { value: a._id, label };
          })]);
        } else {
          const err = await agentRes.json().catch(() => ({}));
          toast.error(err.error || "Failed to load agents");
        }
        if (saRes.ok) {
          const data = await saRes.json();
          const list = (data.superAgents ?? data.items ?? data ?? []) as { _id: string; userId?: { name?: string; email?: string } | string; name?: string }[];
          setSuperAgents([{ value: "all", label: "All super agents" }, ...list.map((s) => {
            const label = typeof s.userId === "object" ? (s.userId?.name ?? s.userId?.email ?? s._id) : (s.name ?? s._id);
            return { value: s._id, label };
          })]);
        } else {
          const err = await saRes.json().catch(() => ({}));
          toast.error(err.error || "Failed to load super agents");
        }
      } catch (error) {
        toast.error("Failed to load filter options");
      }
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
        setStatusCounts(data.statusCounts ?? {});
        setServerNoShow(typeof data.noShowCount === "number" ? data.noShowCount : null);
        updateTotal(data.total ?? 0);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to load interviews");
      }
    } catch (error) {
      toast.error("Failed to load interviews");
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, typeFilter, dateRange, selectedEmployer, selectedAgent, selectedSuperAgent, limit, updateTotal]);

  useEffect(() => { load(); }, [load]);

  const exportColumns: ExportColumn<Interview>[] = [
    { header: "Candidate", key: "jobSeeker" as keyof Interview, formatter: (_v, r) => (r as unknown as Interview).jobSeeker?.name ?? "—" },
    { header: "Employer", key: "employer" as keyof Interview, formatter: (_v, r) => (r as unknown as Interview).employer?.companyName ?? "—" },
    { header: "Job", key: "job" as keyof Interview, formatter: (_v, r) => (r as unknown as Interview).job?.title ?? "—" },
    { header: "Type", key: "type" },
    { header: "Status", key: "status" },
    { header: "Scheduled", key: "scheduledAt", formatter: (v) => v ? new Date(String(v)).toLocaleString() : "—" },
    { header: "Duration (min)", key: "duration", formatter: (v) => String(v ?? "—") },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: interviews as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "interviews",
    title: "Interviews",
  });

  // Platform-wide hero stats from the API; fall back to current-page data.
  // "Upcoming" groups scheduled + confirmed + rescheduled; no-shows come from outcome.
  const hasServerCounts = Object.keys(statusCounts).length > 0;
  const scheduledCount = hasServerCounts
    ? (statusCounts.scheduled ?? 0) + (statusCounts.confirmed ?? 0) + (statusCounts.rescheduled ?? 0)
    : interviews.filter((i) => ["scheduled", "confirmed", "rescheduled"].includes(i.status)).length;
  const completedCount = hasServerCounts ? (statusCounts.completed ?? 0) : interviews.filter((i) => i.status === "completed").length;
  const cancelledCount = hasServerCounts ? (statusCounts.cancelled ?? 0) : interviews.filter((i) => i.status === "cancelled").length;
  const noShowCount = serverNoShow ?? interviews.filter((i) => i.outcome === "no_show").length;

  return (
    <div className="page-container">

      {/* ─── Compact page header ──────────────────────────────────────── */}
      <DashboardPageHeader
        eyebrow={t("recruitmentControl")}
        title={t("interviewOversight")}
        description={t("monitorAllInterviews")}
        summary={{
          label: t("platformTotal"),
          value: t("interviewsCount", { count: total }),
          note: t("acrossAllEmployers"),
        }}
        actions={(
          <Button
            variant={showInsights ? "default" : "outline"}
            onClick={() => setShowInsights(!showInsights)}
            size="lg"
            className="h-10 gap-2 rounded-xl border-0 px-4"
          >
            <Sparkles className="h-4 w-4" />
            {t("aiInsights")}
          </Button>
        )}
        metrics={[
          { label: t("scheduled"), value: scheduledCount, note: t("upcoming"), icon: Calendar, iconClassName: "text-status-applied", iconSurfaceClassName: "bg-status-applied-bg dark:bg-sky-950/30" },
          { label: t("completed"), value: completedCount, note: t("finished"), icon: CheckCircle2, iconClassName: "text-status-selected", iconSurfaceClassName: "bg-status-selected-bg dark:bg-emerald-950/30" },
          { label: t("cancelled"), value: cancelledCount, note: t("calledOff"), icon: RotateCcw, iconClassName: "text-status-shortlisted", iconSurfaceClassName: "bg-status-shortlisted-bg dark:bg-amber-950/30" },
          { label: t("noShows"), value: noShowCount, note: t("missed"), icon: AlertTriangle, iconClassName: "text-red-500", iconSurfaceClassName: "bg-status-rejected-bg dark:bg-red-950/30" },
        ]}
        footer={(
          <>
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-background/50"
            >
              <Filter className="h-4 w-4 text-muted-foreground" />
              {showFilters ? t("hideFilters") : t("showFilters")}
              {activeFilterCount > 0 && <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{t("activeFilters", { count: activeFilterCount })}</Badge>}
              {showFilters ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
            <div className="flex items-center gap-2">
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearAllFilters} className="gap-1.5 text-xs text-muted-foreground">
                  <RotateCcw className="h-3 w-3" />
                  {t("clearActiveFilters", { count: activeFilterCount, plural: activeFilterCount > 1 ? t("clearFilterPlural") : "" })}
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
        {showInsights && (
          <div className="mt-6 rounded-[20px] border border-border/30 bg-background/40 p-5 backdrop-blur-sm dark:bg-background/20">
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-sky-500" />
              <h3 className="text-lg font-semibold">{t("aiInterviewInsights")}</h3>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="workspace-glass-panel space-y-2 rounded-2xl p-3 sm:p-4">
                    <div className="h-4 w-24 animate-shimmer rounded bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                    <div className="h-3 w-full animate-shimmer rounded bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                  </div>
                ))
              ) : aiInsights.length > 0 ? (
                aiInsights.map((insight, i) => {
                  const Icon = INSIGHT_ICONS[insight.icon];
                  return (
                    <div key={i} className="workspace-glass-panel space-y-1.5 rounded-2xl p-4">
                      <div className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${insight.color}`} />
                        <span className="text-sm font-semibold text-foreground">{insight.title}</span>
                      </div>
                      <p className="text-xs leading-relaxed text-muted-foreground">{insight.body}</p>
                    </div>
                  );
                })
              ) : (
                <div className="workspace-glass-panel col-span-full rounded-2xl p-4 text-center">
                  <p className="text-sm text-muted-foreground">{t("noInterviewDataYet")}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── Expandable Filters ─────────────────────────────────────── */}
        {showFilters && (
          <div className="mt-4 space-y-3 rounded-[20px] border border-border/30 bg-background/40 p-4 backdrop-blur-sm dark:bg-background/20">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); resetPage(); }}
                placeholder={t("searchCandidateOrCompany")}
                className="h-11 w-full rounded-xl border border-border bg-card pl-9 pr-4 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:ring-offset-2"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SearchableSelect
                id="admin-interviews-status"
                className="h-11 w-full rounded-xl border-border bg-card"
                options={[
                  { value: "all", label: t("allStatuses") },
                  { value: "scheduled", label: t("statusScheduled") },
                  { value: "completed", label: t("statusCompleted") },
                  { value: "cancelled", label: t("statusCancelled") },
                  { value: "no_show", label: t("statusNoShow") },
                ]}
                value={statusFilter}
                onValueChange={(v) => { setStatusFilter(v); resetPage(); }}
                placeholder={t("allStatuses")}
              />
              <SearchableSelect
                id="admin-interviews-type"
                className="h-11 w-full rounded-xl border-border bg-card"
                options={[
                  { value: "all", label: t("allTypes") },
                  { value: "video", label: t("typeVideo") },
                  { value: "offline", label: t("typeOffline") },
                  { value: "hybrid", label: t("typeHybrid") },
                ]}
                value={typeFilter}
                onValueChange={(v) => { setTypeFilter(v); resetPage(); }}
                placeholder={t("allTypes")}
              />
              <SearchableSelect
                id="admin-interviews-daterange"
                className="h-11 w-full rounded-xl border-border bg-card"
                options={[
                  { value: "all", label: t("allDates") },
                  { value: "today", label: t("today") },
                  { value: "3days", label: t("last3Days") },
                  { value: "7days", label: t("last7Days") },
                  { value: "30days", label: t("last30Days") },
                  { value: "90days", label: t("last90Days") },
                  { value: "upcoming", label: t("upcomingOnly") },
                ]}
                value={dateRange}
                onValueChange={(v) => { setDateRange(v); resetPage(); }}
                placeholder={t("allDates")}
              />
              {employers.length > 1 && (
                <SearchableSelect
                  id="admin-interviews-employer"
                  className="h-11 w-full rounded-xl border-border bg-card"
                  options={employers}
                  value={selectedEmployer}
                  onValueChange={(v) => { setSelectedEmployer(v); resetPage(); }}
                  placeholder={t("allEmployers")}
                />
              )}
              {agents.length > 1 && (
                <SearchableSelect
                  id="admin-interviews-agent"
                  className="h-11 w-full rounded-xl border-border bg-card"
                  options={agents}
                  value={selectedAgent}
                  onValueChange={(v) => { setSelectedAgent(v); resetPage(); }}
                  placeholder={t("allAgents")}
                />
              )}
              {superAgents.length > 1 && (
                <SearchableSelect
                  id="admin-interviews-sa"
                  className="h-11 w-full rounded-xl border-border bg-card"
                  options={superAgents}
                  value={selectedSuperAgent}
                  onValueChange={(v) => { setSelectedSuperAgent(v); resetPage(); }}
                  placeholder={t("allSuperAgents")}
                />
              )}
            </div>
          </div>
        )}
      </DashboardPageHeader>

      {/* ─── Table ────────────────────────────────────────────────────── */}
      <section className="workspace-panel-surface overflow-hidden rounded-[28px]">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="md:min-w-[160px] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em]">{t("candidate")}</TableHead>
                <TableHead className="md:min-w-[180px] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em]">{t("role")}</TableHead>
                <TableHead className="md:min-w-[80px] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em]">{t("type")}</TableHead>
                <TableHead className="md:min-w-[100px] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em]">{t("agent")}</TableHead>
                <TableHead className="md:min-w-[110px] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em]">{t("date")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j} className="px-4 py-3">
                        <div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : interviews.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="h-44 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-muted/50">
                        <Inbox className="h-7 w-7 opacity-40" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{t("noInterviewsFound")}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {activeFilterCount > 0 ? t("noInterviewsEmptyFiltered") : t("noInterviewsEmptyDefault")}
                        </p>
                      </div>
                      {activeFilterCount > 0 && (
                        <Button variant="outline" size="sm" onClick={clearAllFilters} className="mt-1 h-8 rounded-lg text-xs">
                          {t("clearFilters")}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : interviews.map((iv) => {
                const TypeIcon = TYPE_ICON[iv.type as keyof typeof TYPE_ICON] ?? Calendar;
                return (
                  <TableRow key={iv._id} className="group transition-colors">
                    <TableCell className="px-4 py-3">
                      <p className="font-medium">{iv.jobSeeker?.name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{iv.jobSeeker?.email}</p>
                      <StatusBadge status={iv.status} />
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <span className="text-sm text-foreground">{iv.job?.title ?? "—"}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">{iv.employer?.companyName ?? "—"}</span>
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
                    <TableCell className="whitespace-nowrap px-4 py-3">
                      <span className="text-sm text-muted-foreground">
                        {new Date(iv.scheduledAt).toLocaleDateString("en-AE", { day: "2-digit", month: "short", year: "numeric" })}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="border-t border-border/60 px-4 py-4">
          <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
        </div>
      </section>
    </div>
  );
}
