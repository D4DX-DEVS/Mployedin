"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  Eye,
  Inbox,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
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

const STATUS_TABS = ["", "draft", "active", "closed"] as const;

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
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [employerFilter, setEmployerFilter] = useState("");
  const [employers, setEmployers] = useState<EmployerOption[]>([]);

  /* ----- AI search state ----- */
  const [aiQuery, setAiQuery] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState("");
  const [activeAiFilters, setActiveAiFilters] = useState<AiFilters | null>(null);

  const aiInputRef = useRef<HTMLInputElement>(null);

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
      if (employerFilter) params.set("employerId", employerFilter);
      const res = await fetch(`/api/jobs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs ?? []);
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
    pending_approval: t("statuses.pending"),
    paused: t("statuses.paused"),
  };

  /* ----- Summary cards ----- */
  const activeJobs = jobs.filter((j) => j.status === "active").length;
  const draftJobs = jobs.filter((j) => j.status === "draft").length;
  const uniqueEmployers = new Set(jobs.map((j) => j.employerId?._id ?? j.employerId).filter(Boolean)).size;
  const totalApplicants = jobs.reduce((sum, j) => sum + (j.applicationCount ?? j.applicantIds?.length ?? 0), 0);

  const summaryCards = [
    { label: t("cards.active.label"), value: activeJobs, description: t("cards.active.description"), icon: ShieldCheck, tone: "workspace-tone-emerald" },
    { label: t("cards.drafts.label"), value: draftJobs, description: t("cards.drafts.description"), icon: BriefcaseBusiness, tone: "workspace-tone-amber" },
    { label: t("cards.employers.label"), value: uniqueEmployers, description: t("cards.employers.description"), icon: Building2, tone: "workspace-tone-sky" },
    { label: t("cards.applicants.label"), value: totalApplicants, description: t("cards.applicants.description"), icon: Users, tone: "workspace-tone-indigo" },
  ];

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
    <div className="page-container agent-legacy-surface space-y-6">
      {/* ──────── HERO ──────── */}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              {common("workspace")}
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
              {t("title")}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t("description")}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("portfolio.eyebrow")}</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{t("portfolio.tracked", { count: pagination.total })}</p>
              <p className="text-xs text-muted-foreground">{t("portfolio.description")}</p>
            </div>
            <Link href={`/${locale}/agent/jobs/new`}>
              <Button className="h-11 gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700">
                <Plus className="h-4 w-4" />
                {t("postJob")}
              </Button>
            </Link>
          </div>
        </div>

        {/* KPI cards */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="workspace-glass-panel rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{card.label}</p>
                    <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{card.value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{card.description}</p>
                  </div>
                  <div className={`rounded-2xl p-2.5 ${card.tone}`}><Icon className="h-5 w-5" /></div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ──────── AI SEARCH ──────── */}
      <section className="workspace-panel-surface rounded-[28px] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-sky-500/20">
            <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-foreground">{t("ai.title")}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("ai.description")}
            </p>
          </div>
        </div>

        <div className="mt-4">
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
              {t("ai.search")}
            </Button>
          </div>

          {/* Suggestions */}
          {!activeAiFilters && (
            <div className="mt-3 flex flex-wrap gap-2">
              {AI_SUGGESTION_KEYS.map((key) => {
                const suggestion = t(`ai.suggestions.${key}`);
                return (
                <button
                  key={key}
                  onClick={() => { setAiQuery(suggestion); handleAiSearch(suggestion); }}
                  className="rounded-lg border border-border bg-secondary/40 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  {suggestion}
                </button>
              );})}
            </div>
          )}

          {/* AI summary banner */}
          {aiSummary && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50/60 px-3 py-2 dark:border-violet-800/40 dark:bg-violet-950/30">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-400" />
              <p className="flex-1 text-xs text-violet-700 dark:text-violet-300">{aiSummary}</p>
              <button onClick={clearAiFilters} className="shrink-0 rounded p-0.5 hover:bg-violet-200/60 dark:hover:bg-violet-800/40">
                <X className="h-3.5 w-3.5 text-violet-500" />
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ──────── MANUAL FILTERS ──────── */}
      <section className="workspace-panel-surface rounded-[28px] p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("filters.eyebrow")}</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{t("filters.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("filters.description")}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          {/* Text search */}
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("filters.searchPlaceholder")}
              className="h-11 rounded-xl border-border bg-secondary/65 pl-9 text-sm text-foreground shadow-none placeholder:text-muted-foreground"
            />
          </div>
          {/* Status tabs */}
          <div className="flex flex-wrap gap-2">
            {STATUS_TABS.map((value) => {
              const isSelected = statusFilter === value;
              return (
                <Button
                  key={value || "all"}
                  onClick={() => setStatusFilter(value)}
                  variant="outline"
                  size="sm"
                  className={isSelected
                    ? "h-11 rounded-xl border-primary/20 bg-primary/10 px-4 text-primary hover:bg-primary/15"
                    : "h-11 rounded-xl border-border bg-secondary/65 px-4 text-muted-foreground hover:bg-card"
                  }
                >
                  {value ? statusLabels[value] ?? value : common("all")}
                </Button>
              );
            })}
          </div>

          {/* Employer filter */}
          {employers.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <select
                value={employerFilter}
                onChange={(e) => setEmployerFilter(e.target.value)}
                className="h-11 rounded-xl border border-border bg-secondary/65 px-3 text-sm text-foreground"
              >
                <option value="">{common("allEmployers")}</option>
                {employers.map((emp) => (
                  <option key={emp._id} value={emp._id}>{emp.companyName}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </section>

      {/* ──────── JOB TABLE ──────── */}
      <section className="workspace-panel-surface rounded-[28px] p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("results.eyebrow")}</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{t("results.title")}</h2>
          </div>
          <div className="workspace-muted-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium">
            <ArrowRight className="h-3.5 w-3.5 text-sky-600" />
            {t("results.summary", { total: pagination.total, pages: pagination.totalPages })}
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-[24px] border border-border bg-card">
          <TableToolbar
            onExportCsv={handleExportCsv}
            onExportExcel={handleExportExcel}
            onExportPdf={handleExportPdf}
            className="px-4 pt-4"
          />
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-sky-600" />
            </div>
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
                  <TableHead>{t("table.status")}</TableHead>
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
                      <TableCell className="font-medium text-foreground">{job.title}</TableCell>
                      <TableCell className="text-muted-foreground">{job.employerId?.companyName ?? common("dash")}</TableCell>
                      <TableCell className="text-muted-foreground">{locationText(job.location)}</TableCell>
                      <TableCell><StatusBadge status={job.status} label={statusLabels[job.status] ?? job.status} /></TableCell>
                      <TableCell className="text-muted-foreground">{appCount}</TableCell>
                      <TableCell className="text-muted-foreground">{new Date(job.createdAt).toLocaleDateString(dateLocale)}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1.5">
                          {/* View candidates — redirects to candidates page */}
                          <Link href={`/${locale}/agent/candidates?jobId=${job._id}`}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-9 rounded-xl px-2.5"
                              title={t("actions.viewCandidates")}
                              aria-label={t("actions.viewCandidatesFor", { title: job.title })}
                            >
                              <Users className="h-4 w-4 text-muted-foreground" />
                              {appCount > 0 && (
                                <span className="ml-1 text-xs text-muted-foreground">{appCount}</span>
                              )}
                            </Button>
                          </Link>
                          {/* View job details */}
                          <Link href={`/${locale}/agent/jobs/${job._id}`}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-9 rounded-xl px-2.5"
                              title={t("actions.viewJob")}
                              aria-label={t("actions.viewJobFor", { title: job.title })}
                            >
                              <Eye className="h-4 w-4 text-sky-600" />
                            </Button>
                          </Link>
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
