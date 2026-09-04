"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  ChevronDown,
  Eye,
  Filter,
  Inbox,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import type { ExportColumn } from "@/lib/export";
import { useTranslations } from "next-intl";
import { TableActionLink } from "@/components/shared/TableActionLink";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { StatusFilterStrip } from "@/components/shared/StatusFilterStrip";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface JobItem {
  _id: string;
  title: string;
  status: string;
  location?: { city?: string; country?: string; isRemote?: boolean };
  category?: string;
  vacancies?: number;
  applicantIds?: string[];
  applicationCount?: number;
  employerId?: { _id?: string; companyName?: string };
  createdAt: string;
}

interface EmployerOption {
  _id: string;
  companyName?: string;
}

interface AiFilters {
  search?: string;
  status?: string;
  skills?: string[];
  employer?: string;
  summary?: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const AI_SUGGESTION_KEYS = ["activeApplicants", "draftReview", "postedThisWeek", "kochiRoles"] as const;

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AgentJobsPage() {
  const pathname = usePathname();
  const locale = pathname?.split("/")[1] ?? "en";
  const t = useTranslations("agentJobs");
  const common = useTranslations("agentCommon");
  const pagination = usePagination();

  /* ----- Job list state ----- */
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  // Filters live in the query string so a filtered view of this list is an
  // address the dashboard, a badge or the palette can link to.
  const [search, setSearch] = useUrlFilter("search", "", { debounceMs: 400 });
  const [statusFilter, setStatusFilter] = useUrlFilter("status", "");
  const [employerFilter, setEmployerFilter] = useUrlFilter("employerId", "all");

  const [employers, setEmployers] = useState<EmployerOption[]>([]);

  /* ----- AI search state ----- */
  const [aiQuery, setAiQuery] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState("");
  const [activeAiFilters, setActiveAiFilters] = useState<AiFilters | null>(null);

  const aiInputRef = useRef<HTMLInputElement>(null);

  /* ----- Filter panel toggle ----- */
  const [filtersOpen, setFiltersOpen] = useState(false);
  // AI search is the exception, not the default: opening Filters used to
  // expand it too, so a phone got two search boxes when it asked for one.
  const [aiOpen, setAiOpen] = useState(false);

  /* ---------------------------------------------------------------- */
  /*  Load employers for filter                                       */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    fetch("/api/employers?limit=200")
      .then((r) => r.ok ? r.json() : { employers: [] })
      .then((data) => {
        const list = (data.employers ?? []).map((e: { _id: string; companyName?: string; employer?: { companyName?: string } }) => ({
          _id: String(e._id),
          companyName: e.companyName ?? e.employer?.companyName ?? common("unknown"),
        }));
        setEmployers(list);
      })
      .catch(() => {});
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Load jobs                                                       */
  /* ---------------------------------------------------------------- */
  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params = pagination.paginationParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (employerFilter !== "all") params.set("employerId", employerFilter);
      const res = await fetch(`/api/jobs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs ?? []);
        setStatusCounts(data.statusCounts ?? {});
        pagination.updateTotal(data.pagination?.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, employerFilter, pagination.page, pagination.limit]);

  useEffect(() => {
    const t = setTimeout(loadJobs, 300);
    return () => clearTimeout(t);
  }, [loadJobs]);

  useEffect(() => { pagination.resetPage(); }, [search, statusFilter, employerFilter]);

  /* ---------------------------------------------------------------- */
  /*  AI search handler                                               */
  /* ---------------------------------------------------------------- */
  const handleAiSearch = async (query?: string) => {
    const q = (query ?? aiQuery).trim();
    if (!q) return;
    setAiLoading(true);
    setAiSummary("");
    try {
      const res = await fetch("/api/ai/job-search-filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      if (!res.ok) throw new Error(t("ai.failed"));
      const data = await res.json();
      const filters: AiFilters = data.filters ?? {};
      setActiveAiFilters(filters);
      setAiSummary(data.summary ?? t("ai.defaultSummary", { query: q }));

      // Apply extracted filters
      if (filters.search) setSearch(filters.search);
      if (filters.status) setStatusFilter(filters.status);
      if (filters.employer) {
        const match = employers.find(
          (e) => e.companyName?.toLowerCase().includes(filters.employer!.toLowerCase())
        );
        if (match) setEmployerFilter(match._id);
      }
    } catch {
      setAiSummary(t("ai.tryDifferent"));
    } finally {
      setAiLoading(false);
    }
  };

  const clearAiFilters = () => {
    setActiveAiFilters(null);
    setAiSummary("");
    setAiQuery("");
    setSearch("");
    setStatusFilter("");
    setEmployerFilter("");
  };

  /* ---------------------------------------------------------------- */
  /*  Helpers                                                         */
  /* ---------------------------------------------------------------- */
  const locationText = (loc?: JobItem["location"]) => {
    if (!loc) return common("dash");
    if (loc.isRemote) return t("remote");
    return [loc.city, loc.country].filter(Boolean).join(", ") || common("dash");
  };
  const dateLocale = locale === "ar" ? "ar-SA" : "en-US";
  const statusLabels: Record<string, string> = {
    draft: t("statuses.draft"),
    active: t("statuses.active"),
    closed: t("statuses.closed"),
    expired: t("statuses.expired"),
    paused: t("statuses.paused"),
  };

  /* ----- Summary cards ----- */
  // Portfolio-wide status totals come from the API aggregate (statusCounts);
  // fall back to current-page counts only when the aggregate is unavailable.
  const hasStatusCounts = Object.keys(statusCounts).length > 0;
  const activeJobs = hasStatusCounts
    ? (statusCounts.active ?? 0)
    : jobs.filter((j) => j.status === "active").length;
  const draftJobs = hasStatusCounts
    ? (statusCounts.draft ?? 0)
    : jobs.filter((j) => j.status === "draft").length;
  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: t("table.title"), key: "title" },
    { header: t("table.employer"), key: "employerId", formatter: (_v, row) => (row.employerId as { companyName?: string })?.companyName ?? "" },
    { header: t("table.location"), key: "location", formatter: (_v, row) => locationText((row as unknown as JobItem).location) },
    { header: t("table.status"), key: "status" },
    { header: t("table.applicants"), key: "applicationCount", formatter: (_v, row) => String((row as unknown as JobItem).applicationCount ?? (row as unknown as JobItem).applicantIds?.length ?? 0) },
    { header: t("table.posted"), key: "createdAt", formatter: (v) => v ? new Date(String(v)).toLocaleDateString(dateLocale) : "" },
  ];

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: jobs as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "agent-jobs",
    title: t("exportTitle"),
  });

  /* ================================================================ */
  /*  RENDER                                                          */
  /* ================================================================ */
  return (
    <div className="page-container">
      {/* ──────── HERO ──────── */}
      {/* ──────── HERO + UNIFIED FILTERS ──────── */}
      <DashboardPageHeader
        icon={BriefcaseBusiness}
        title={t("title")}
        description={t("description")}
        actions={
            <Link href={`/${locale}/agent/jobs/new`}>
              <Button size="lg" className="gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                <Plus className="h-4 w-4" />
                {t("postJob")}
              </Button>
            </Link>
        }
      />

        {/* One panel: search shares a row with the Filters toggle, the status
            strip sits under it. These were two stacked cards — the second one
            spent an icon, a heading and a blurb to say "Filters". */}
        <section className="workspace-panel-surface rounded-3xl panel-body">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("filters.searchPlaceholder")}
                className="h-10 rounded-xl border-border bg-background ps-9 text-sm shadow-none"
              />
            </div>
            <button
              onClick={() => setFiltersOpen((prev) => !prev)}
              aria-expanded={filtersOpen}
              aria-controls="agent-job-advanced-filters"
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-border px-3 text-sm font-medium text-foreground transition-colors hover:border-primary/25"
            >
              <Filter className="h-4 w-4 text-status-interview" />
              {t("filters.title")}
              {(search || statusFilter || employerFilter || activeAiFilters) && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-600 text-[11px] font-bold text-white">
                  {[search, statusFilter, employerFilter, activeAiFilters].filter(Boolean).length}
                </span>
              )}
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${filtersOpen ? "rotate-180" : ""}`} />
            </button>
          </div>

          <StatusFilterStrip
            label={t("filters.title")}
            className="mt-3"
            selectedId={statusFilter || "all"}
            onSelect={(value) => setStatusFilter(value === "all" ? "" : value)}
            items={[
              { id: "all", label: common("all"), value: pagination.total },
              { id: "active", label: statusLabels.active, value: activeJobs },
              { id: "draft", label: statusLabels.draft, value: draftJobs },
              { id: "closed", label: statusLabels.closed, value: statusCounts.closed ?? 0 },
            ]}
          />

          {/* Expandable filter content */}
          <div
            id="agent-job-advanced-filters"
            className={`grid transition-all duration-300 ease-in-out ${filtersOpen ? "mt-4 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
          >
            <div className="overflow-hidden">
              {/* AI toggle sits above the panel it controls. */}
              <button
                type="button"
                onClick={() => setAiOpen((prev) => !prev)}
                aria-expanded={aiOpen}
                className={`mb-3 inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                  aiOpen
                    ? "border-violet-500/30 bg-violet-500/10 text-status-interview"
                    : "border-border/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                <Sparkles className="h-3 w-3" />
                {t("ai.search")}
              </button>

              {/* AI Search */}
              <div className={aiOpen ? "space-y-3" : "hidden"}>
                <div className="relative">
                  <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-500/60" />
                  <Input
                    ref={aiInputRef}
                    value={aiQuery}
                    onChange={(e) => setAiQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAiSearch(); }}
                    placeholder={t("ai.placeholder")}
                    className="h-11 rounded-xl border-border bg-secondary/65 pl-9 pr-24 text-sm text-foreground shadow-none placeholder:text-muted-foreground"
                    disabled={aiLoading}
                  />
                  <Button
                    onClick={() => handleAiSearch()}
                    disabled={aiLoading || !aiQuery.trim()}
                    size="sm"
                    className="absolute right-1.5 top-1/2 h-8 -translate-y-1/2 gap-1.5 rounded-lg bg-violet-600 px-3 text-xs font-medium text-white hover:bg-violet-700"
                  >
                    {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    <span className="hidden sm:inline">{t("ai.search")}</span>
                  </Button>
                </div>

                {/* AI Suggestions */}
                {!activeAiFilters && (
                  <div className="flex flex-wrap gap-2">
                    {AI_SUGGESTION_KEYS.map((key) => {
                      const suggestion = t(`ai.suggestions.${key}`);
                      return (
                        <button
                          key={key}
                          onClick={() => { setAiQuery(suggestion); handleAiSearch(suggestion); }}
                          className="max-w-full truncate rounded-lg border border-border bg-secondary/40 px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:px-2.5 sm:py-1 sm:text-xs"
                        >
                          {suggestion}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* AI summary banner */}
                {aiSummary && (
                  <div className="flex items-center gap-2 rounded-xl border border-status-interview/20 bg-violet-50/60 chip-pad">
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-status-interview" />
                    <p className="flex-1 text-xs text-status-interview">{aiSummary}</p>
                    <button onClick={clearAiFilters} className="shrink-0 rounded p-0.5 hover:bg-violet-200/60">
                      <X className="h-3.5 w-3.5 text-violet-500" />
                    </button>
                  </div>
                )}
              </div>

              <div className="my-3 h-px bg-border" />

              {/* Manual Filters */}
              {/* Wraps on phones so the status tabs and the employer dropdown
                  share a line instead of each claiming a row. */}
              <div className="flex flex-wrap items-center gap-2" data-table-toolbar="simple">
                {/* Employer filter */}
                {employers.length > 0 && (
                  <div className="flex min-w-0 max-w-[40%] shrink flex-nowrap items-center gap-1 sm:max-w-none sm:gap-1.5">
                    <Building2 className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
                    <Select value={employerFilter} onValueChange={setEmployerFilter}>
                      <SelectTrigger className="h-9 w-auto min-w-0 truncate rounded-xl border border-border bg-secondary/65 sm:h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{common("allEmployers")}</SelectItem>
                        {employers.map((emp) => (
                          <SelectItem key={emp._id} value={emp._id}>{emp.companyName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

      {/* ──────── JOB TABLE ──────── */}
      <section className="workspace-panel-surface rounded-3xl panel-body">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("results.eyebrow")}</p>
            <h2 className="heading-section mt-2 font-semibold tracking-tight text-foreground">{t("results.title")}</h2>
          </div>
          {/* Export sits beside the result count. On its own line above the
              table it read as an orphaned button floating in empty space. */}
          <div className="flex items-center gap-2">
            <div className="workspace-muted-pill inline-flex min-w-0 flex-1 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium">
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-status-applied" />
              {t("results.summary", { total: pagination.total, pages: pagination.totalPages })}
            </div>
            <TableToolbar
              onExportCsv={handleExportCsv}
              onExportExcel={handleExportExcel}
              onExportPdf={handleExportPdf}
            />
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-3xl border border-border bg-card">
          {loading ? (
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/70 hover:bg-secondary/70">
                  <TableHead>{t("table.title")}</TableHead>
                  <TableHead>{t("table.employer")}</TableHead>
                  <TableHead>{t("table.location")}</TableHead>
                  <TableHead>{t("table.applicants")}</TableHead>
                  <TableHead>{t("table.posted")}</TableHead>
                  <TableHead className="text-right">{t("table.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : jobs.length === 0 ? (
            <div className="py-12 text-center">
              <div className="flex flex-col items-center gap-2">
                <Inbox className="h-8 w-8 text-muted-foreground/55" />
                <p className="text-sm font-medium text-foreground">{t("empty.title")}</p>
                <p className="text-sm text-muted-foreground">{t("empty.description")}</p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/70 hover:bg-secondary/70">
                  <TableHead>{t("table.title")}</TableHead>
                  <TableHead>{t("table.employer")}</TableHead>
                  <TableHead>{t("table.location")}</TableHead>
                  <TableHead>{t("table.applicants")}</TableHead>
                  <TableHead>{t("table.posted")}</TableHead>
                  <TableHead className="text-right">{t("table.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => {
                  const appCount = job.applicationCount ?? job.applicantIds?.length ?? 0;

                  return (
                    <TableRow key={job._id} className="hover:bg-secondary/60">
                      <TableCell>
                        <div className="flex min-w-0 flex-col items-start gap-1.5">
                          <span className="font-medium text-foreground">{job.title}</span>
                          <StatusBadge status={job.status} label={statusLabels[job.status] ?? job.status} />
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{job.employerId?.companyName ?? common("dash")}</TableCell>
                      <TableCell className="text-muted-foreground">{locationText(job.location)}</TableCell>
                      <TableCell className="text-muted-foreground">{appCount}</TableCell>
                      <TableCell className="text-muted-foreground">{new Date(job.createdAt).toLocaleDateString(dateLocale)}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1.5">
                          <TableActionLink
                            href={`/${locale}/agent/candidates?jobId=${job._id}`}
                            icon={Users}
                            label={t("actions.viewCandidates")}
                            ariaLabel={t("actions.viewCandidatesFor", { title: job.title })}
                            count={appCount}
                            iconClassName="text-muted-foreground"
                          />
                          <TableActionLink
                            href={`/${locale}/agent/jobs/${job._id}`}
                            icon={Eye}
                            label={t("actions.viewJob")}
                            ariaLabel={t("actions.viewJobFor", { title: job.title })}
                            iconClassName="text-status-applied"
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      <PaginationControls
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        limit={pagination.limit}
        onPageChange={pagination.setPage}
        onLimitChange={pagination.setLimit}
      />
    </div>
  );
}
