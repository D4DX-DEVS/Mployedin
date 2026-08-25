"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { MarkdownRenderer } from "@/components/shared/MarkdownRenderer";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { EmptyState } from "@/components/shared/EmptyState";
import { ListSkeleton } from "@/components/shared/ListSkeleton";
import { CountCardGrid } from "@/components/shared/CountCardGrid";
import type { ExportColumn } from "@/lib/export";
import {
  Search, Inbox, Sparkles, Briefcase, ShieldCheck, FileText, Users, Plus,
  Eye, Building2, MapPin, DollarSign, Clock, Calendar, Globe, UserCheck,
  Wand2, CheckCircle, ArrowRight, Trash2, Edit2, ClipboardList, Filter, ChevronDown, ChevronUp,
} from "lucide-react";
import { toUserFacingError } from "@/lib/errors/user-facing";
import { formatCount, formatDate } from "@/lib/ui/intlFormat";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Job {
  _id: string;
  title: string;
  description?: string;
  employerId?: { _id?: string; companyName?: string; country?: string; industry?: string };
  agentId?: { _id?: string; userId?: { _id?: string; name?: string; email?: string }; superAgentId?: { _id?: string; userId?: { name?: string } } };
  status: string;
  poster?: { approvalStatus?: string };
  approvalStatus?: string;
  category?: string;
  location?: string | { isRemote?: boolean; city?: string; country?: string };
  salary?: { min?: number; max?: number; currency?: string; isNegotiable?: boolean };
  employmentType?: string;
  workMode?: string;
  vacancies?: number;
  requirements?: { skills?: string[]; experience?: string; education?: string };
  responsibilities?: string[];
  benefits?: string[];
  applicantsCount?: number;
  createdAt: string;
}

interface FilterOption { value: string; label: string }

function getStatusOptions(t: ReturnType<typeof useTranslations>): FilterOption[] {
  return [
    { value: "all", label: t("allStatuses") },
    { value: "draft", label: t("draft") },
    { value: "active", label: t("active") },
    { value: "paused", label: t("paused") },
    { value: "closed", label: t("closed") },
    { value: "expired", label: t("expired") },
  ];
}

function getWorkModeOptions(t: ReturnType<typeof useTranslations>): FilterOption[] {
  return [
    { value: "all", label: t("allWorkModes") },
    { value: "onsite", label: t("onSite") },
    { value: "hybrid", label: t("hybrid") },
    { value: "remote", label: t("remote") },
  ];
}

function getEmploymentTypeOptions(t: ReturnType<typeof useTranslations>): FilterOption[] {
  return [
    { value: "all", label: t("allTypes") },
    { value: "full_time", label: t("fullTime") },
    { value: "part_time", label: t("partTime") },
    { value: "contract", label: t("contract") },
    { value: "internship", label: t("internship") },
    { value: "freelance", label: t("freelance") },
  ];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatLocation(loc?: string | { isRemote?: boolean; city?: string; country?: string }) {
  if (!loc) return "—";
  if (typeof loc === "string") return loc;
  if (loc.isRemote) return "Remote";
  return [loc.city, loc.country].filter(Boolean).join(", ") || "—";
}

function getSourceLabel(job: Job, t: ReturnType<typeof useTranslations>) {
  const agent = job.agentId?.userId?.name;
  const superAgent = job.agentId?.superAgentId?.userId?.name;
  if (agent && superAgent) return `${agent} · ${superAgent}`;
  if (agent) return agent;
  return t("employerLabel");
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-status-selected-bg text-emerald-700 border-status-selected/20",
  draft: "bg-status-shortlisted-bg text-status-shortlisted border-status-shortlisted/20",
  paused: "bg-sky-100 text-status-applied border-border",
  closed: "bg-muted text-muted-foreground",
  expired: "bg-status-rejected-bg text-status-rejected border-status-rejected/20",
};

const JOB_SUMMARY_MAX_LENGTH = 180;

function formatSalary(job: Job, t: ReturnType<typeof useTranslations>): string | null {
  const min = job.salary?.min ?? 0;
  const max = job.salary?.max ?? 0;
  const currency = job.salary?.currency ?? "USD";
  if (min <= 0 && max <= 0) return null;
  if (job.salary?.isNegotiable) return t("negotiable");
  if (min > 0 && max > 0) return `${formatCount(min)} - ${formatCount(max)} ${currency}`;
  return `${formatCount(Math.max(min, max))} ${currency}`;
}

function getJobSummary(job: Job): string | null {
  if (!job.description) return null;
  const parser = new DOMParser();
  const plainText = parser.parseFromString(job.description, "text/html").body.textContent?.replace(/\s+/g, " ").trim() ?? "";
  if (!plainText) return null;
  if (plainText.length <= JOB_SUMMARY_MAX_LENGTH) return plainText;
  return `${plainText.slice(0, JOB_SUMMARY_MAX_LENGTH - 3).trimEnd()}...`;
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function AdminJobsPage() {
  const t = useTranslations("adminJobs");
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [serverApplicants, setServerApplicants] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [employers, setEmployers] = useState<FilterOption[]>([]);
  const [agents, setAgents] = useState<FilterOption[]>([]);
  const [selectedEmployer, setSelectedEmployer] = useState("all");
  const [selectedAgent, setSelectedAgent] = useState("all");
  const [workMode, setWorkMode] = useState("all");
  const [employmentType, setEmploymentType] = useState("all");
  const [locationFilter, setLocationFilter] = useState("");
  const [skillsFilter, setSkillsFilter] = useState("");

  const [aiQuery, setAiQuery] = useState("");
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isApplyingAiSearch, setIsApplyingAiSearch] = useState(false);

  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();

  useEffect(() => {
    (async () => {
      try {
        const [empRes, agentRes] = await Promise.all([
          fetch("/api/employers?limit=500&fields=companyName"),
          fetch("/api/admin/agents?limit=500"),
        ]);
        if (empRes.ok) {
          const data = await empRes.json();
          const list = (data.employers ?? data.items ?? data ?? []) as { _id: string; companyName?: string }[];
          setEmployers([{ value: "all", label: t("allEmployers") }, ...list.map((e) => ({ value: e._id, label: e.companyName ?? e._id }))]);
        }
        if (agentRes.ok) {
          const data = await agentRes.json();
          const list = (data.agents ?? data.items ?? data ?? []) as { _id: string; userId?: { name?: string; email?: string } | string; name?: string }[];
          setAgents([{ value: "all", label: t("allAgents") }, ...list.map((a) => {
            const label = typeof a.userId === "object" ? (a.userId?.name ?? a.userId?.email ?? a._id) : (a.name ?? a._id);
            return { value: a._id, label };
          })]);
        }
      } catch { /* filter options non-critical */ }
    })();
  }, []);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      if (status !== "all") params.set("status", status);
      if (selectedEmployer !== "all") params.set("employerId", selectedEmployer);
      if (selectedAgent !== "all") params.set("agentId", selectedAgent);
      if (workMode !== "all") params.set("workMode", workMode);
      if (employmentType !== "all") params.set("employmentType", employmentType);
      if (locationFilter) params.set("location", locationFilter);
      if (skillsFilter) params.set("skills", skillsFilter);

      const res = await fetch(`/api/admin/jobs?${params}`);
      if (!res.ok) throw new Error(t("jobLoadFailed"));

      const data = await res.json();
      setJobs(data.jobs ?? data.items ?? []);
      setStatusCounts(data.statusCounts ?? {});
      setServerApplicants(typeof data.totalApplicants === "number" ? data.totalApplicants : null);
      updateTotal(data.pagination?.total ?? data.total ?? data.totalCount ?? ((data.totalPages ?? 1) * limit));
    } catch (error: unknown) {
      const message = toUserFacingError(error, { fallback: t("jobLoadFailed") }).message;
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [search, status, selectedEmployer, selectedAgent, workMode, employmentType, locationFilter, skillsFilter, page, limit, updateTotal]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const handleDeleteJob = async (jobId: string) => {
    if (!confirm(t("deleteConfirmation"))) return;
    try {
      const res = await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(t("jobDeletionFailed"));
      toast.success(t("jobDeletedSuccess"));
      fetchJobs();
    } catch { toast.error(t("jobDeletionFailed")); }
  };

  const activeJobs = statusCounts.active ?? jobs.filter((j) => j.status === "active").length;
  // ponytail: no approval queue — surface unpublished drafts instead.
  const draftJobs = statusCounts.draft ?? jobs.filter((j) => j.status === "draft").length;
  const totalApplicants = serverApplicants ?? jobs.reduce((sum, j) => sum + (j.applicantsCount ?? 0), 0);

  const hasActiveFilters = search || status !== "all" || selectedEmployer !== "all" || selectedAgent !== "all" || workMode !== "all" || employmentType !== "all" || locationFilter || skillsFilter;

  const exportColumns: ExportColumn<Job>[] = [
    { header: t("jobListings"), key: "title" },
    { header: t("employerLabel"), key: "employerId" as keyof Job, formatter: (_v, r) => (r as unknown as Job).employerId?.companyName ?? "—" },
    { header: t("source"), key: "agentId" as keyof Job, formatter: (_v, r) => getSourceLabel(r as unknown as Job, t) },
    { header: t("active"), key: "status" },
    { header: t("location"), key: "location", formatter: (v) => formatLocation(v as Job["location"]) },
    { header: t("categoryLabel"), key: "category", formatter: (v) => String(v ?? "—") },
    { header: t("applicantsCountLabel"), key: "applicantsCount", formatter: (v) => String(v ?? 0) },
    { header: t("createdLabel"), key: "createdAt", formatter: (v) => v ? formatDate(new Date(String(v))) : "—" },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: jobs as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "jobs",
    title: t("exportTitle"),
  });

  function resetFilters() {
    setSearch("");
    setStatus("all");
    setSelectedEmployer("all");
    setSelectedAgent("all");
    setWorkMode("all");
    setEmploymentType("all");
    setLocationFilter("");
    setSkillsFilter("");
    setAiQuery("");
    setAiSummary(null);
    resetPage();
  }

  async function handleApplyAiSearch() {
    const query = aiQuery.trim();
    if (!query) return;
    setIsApplyingAiSearch(true);
    try {
      const res = await fetch("/api/ai/job-search-filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (!res.ok) throw new Error("AI search failed");
      const data = await res.json();
      const filters = data.filters ?? {};
      const hasSkills = Array.isArray(filters.skills) && filters.skills.length > 0;
      setSearch(hasSkills ? "" : (filters.search ?? ""));
      setStatus(filters.status ?? "all");
      setWorkMode(filters.workMode ?? "all");
      setLocationFilter(filters.location ?? "");
      setSkillsFilter(hasSkills ? filters.skills.join(", ") : "");
      setAiSummary(data.summary ?? null);
      resetPage();
      toast.success(data.degraded ? t("aiSearchUnavailable") : t("aiSearchApplied"));
    } catch {
      setSearch(query);
      setAiSummary(t("aiSearchUnavailableKeyword", { query }));
      toast.error(t("aiSearchFallback"));
    } finally {
      setIsApplyingAiSearch(false);
    }
  }

  return (
    <div className="page-container">

      {/* ─── Compact page header ──────────────────────────────────────── */}
      <DashboardPageHeader
        eyebrow={t("recruitmentControl")}
        title={t("jobListings")}
        description={t("jobListingsDescription")}
        summary={{
          label: t("platformTotal"),
          value: t("jobsCount", { total: formatCount(total) }),
          note: t("acrossPages", { totalPages }),
        }}
        actions={(
          <Link href={`/${locale}/admin/jobs/new`}>
            <Button size="lg" className="h-10 gap-2 rounded-xl px-4">
              <Plus className="h-4 w-4" />
              {t("postJob")}
            </Button>
          </Link>
        )}
        metrics={[
          { label: t("totalJobs"), value: total, note: t("totalJobsNote"), icon: Briefcase, iconClassName: "text-status-applied", iconSurfaceClassName: "bg-status-applied-bg" },
          { label: t("active"), value: activeJobs, note: t("activeNote"), icon: ShieldCheck, iconClassName: "text-status-selected", iconSurfaceClassName: "bg-status-selected-bg" },
          { label: t("draftJobs"), value: draftJobs, note: t("draftJobsNote"), icon: FileText, iconClassName: "text-status-shortlisted", iconSurfaceClassName: "bg-status-shortlisted-bg" },
          { label: t("applicants"), value: totalApplicants, note: t("applicantsNote"), icon: Users, iconClassName: "text-status-interview", iconSurfaceClassName: "bg-status-interview-bg" },
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
              {hasActiveFilters && <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{t("activeFilterBadge")}</Badge>}
              {showFilters ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
            <div className="flex items-center gap-2">
              {(hasActiveFilters || aiSummary || aiQuery) && (
                <Button variant="ghost" size="sm" onClick={resetFilters} className="gap-1.5 text-xs text-muted-foreground">
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

        {/* ─── Expandable Filters ─────────────────────────────────────── */}
        {showFilters && (
          <div className="mt-4 space-y-3 rounded-3xl border border-border/30 bg-background/40 backdrop-blur-sm card-pad">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("searchPlaceholder")}
                value={search}
                onChange={(e) => { setSearch(e.target.value); resetPage(); }}
                className="h-11 rounded-xl border-border bg-card pl-9 text-sm shadow-none"
              />
            </div>

            {/* Three filters per row on phones instead of two, so the four
                selects take two short rows rather than four stacked ones.
                `sm:` restores the original 2-up / `xl:` 4-up layout. */}
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4">
              <SearchableSelect
                id="admin-jobs-status-filter"
                className="h-11 w-full rounded-xl border-border bg-card"
                options={getStatusOptions(t)}
                value={status}
                onValueChange={(value) => { setStatus(value); resetPage(); }}
                placeholder={t("statusFilterPlaceholder")}
              />
              {employers.length > 1 && (
                <SearchableSelect
                  id="admin-jobs-employer-filter"
                  className="h-11 w-full rounded-xl border-border bg-card"
                  options={employers}
                  value={selectedEmployer}
                  onValueChange={(value) => { setSelectedEmployer(value); resetPage(); }}
                  placeholder={t("allEmployers")}
                />
              )}
              {agents.length > 1 && (
                <SearchableSelect
                  id="admin-jobs-agent-filter"
                  className="h-11 w-full rounded-xl border-border bg-card"
                  options={agents}
                  value={selectedAgent}
                  onValueChange={(value) => { setSelectedAgent(value); resetPage(); }}
                  placeholder={t("allAgents")}
                />
              )}
              <SearchableSelect
                id="admin-jobs-workmode-filter"
                className="h-11 w-full rounded-xl border-border bg-card"
                options={getWorkModeOptions(t)}
                value={workMode}
                onValueChange={(value) => { setWorkMode(value); resetPage(); }}
                placeholder={t("allWorkModes")}
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <Filter className="h-3.5 w-3.5" />
                {t("advancedFilters")}
                {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            </div>

            {showAdvanced && (
              <div className="grid grid-cols-3 gap-1.5 pt-1 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4">
                <SearchableSelect
                  id="admin-jobs-type-filter"
                  className="h-11 w-full rounded-xl border-border bg-card"
                  options={getEmploymentTypeOptions(t)}
                  value={employmentType}
                  onValueChange={(value) => { setEmploymentType(value); resetPage(); }}
                  placeholder={t("allTypes")}
                />
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder={t("locationFilterPlaceholder")}
                    value={locationFilter}
                    onChange={(e) => { setLocationFilter(e.target.value); resetPage(); }}
                    className="h-11 rounded-xl border-border bg-card pl-9 text-sm shadow-none"
                  />
                </div>
                <Input
                  placeholder={t("skillsFilterPlaceholder")}
                  value={skillsFilter}
                  onChange={(e) => { setSkillsFilter(e.target.value); resetPage(); }}
                  className="h-11 rounded-xl border-border bg-card text-sm shadow-none"
                />
              </div>
            )}

            {/* Field and button share one row on phones; `sm:` keeps them
                stacked exactly as before until `xl:` splits them again. */}
            <div className="grid grid-cols-[1fr_auto] gap-1.5 sm:grid-cols-1 sm:gap-3 xl:grid-cols-[1fr_auto]">
              <div className="relative">
                <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-500" />
                <Input
                  placeholder={t("aiSearchPlaceholder")}
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
                {isApplyingAiSearch ? t("searching") : t("aiSearch")}
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

      {/* ─── Error ────────────────────────────────────────────────────── */}
      {errorMessage && (
        <div className="rounded-2xl border border-status-rejected/20 bg-rose-50/90 px-4 py-3 text-sm text-rose-700 shadow-sm">
          {errorMessage}
        </div>
      )}

      {/* ─── Job Cards ────────────────────────────────────────────────── */}
      {loading ? (
        <ListSkeleton count={5} itemClassName="h-40 rounded-3xl" className="space-y-4" />
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={hasActiveFilters ? t("noMatchingJobsHeading") : t("noJobsYetHeading")}
          description={hasActiveFilters ? t("noMatchingJobsDescription") : t("noJobsYetDescription")}
          action={hasActiveFilters ? <Button size="lg" onClick={resetFilters} variant="outline" className="rounded-xl border-border bg-background/70 px-4 text-sm">{t("clearFilters")}</Button> : undefined}
          className="workspace-panel-surface"
        />
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => {
            const posted = new Date(job.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
            const salaryLabel = formatSalary(job, t);
            const jobSummary = getJobSummary(job);
            const isExpanded = expandedJobs.has(job._id);

            return (
              <article
                key={job._id}
                className="workspace-panel-surface rounded-3xl transition-all hover:-translate-y-0.5 hover:border-border panel-body"
              >
                <div className="grid gap-2.5 xl:grid-cols-[minmax(0,1fr)_268px] xl:items-start">
                  {/* Left: Job metadata */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="heading-subsection font-semibold tracking-tight text-foreground">{job.title}</h3>
                      <Badge className={`${STATUS_COLORS[job.status] ?? ""} border px-2 py-0 text-[11px] font-medium capitalize`}>{job.status}</Badge>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {job.employerId?.companyName && (
                        <span className="flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          <Building2 className="h-3 w-3" />
                          {job.employerId.companyName}
                        </span>
                      )}
                      <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{formatLocation(job.location)}</span>
                      {job.category && (
                        <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{job.category}</span>
                      )}
                      {salaryLabel && (
                        <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{salaryLabel}</span>
                      )}
                      {(job.vacancies ?? 0) > 0 && (
                        <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {t("openings", { count: job.vacancies ?? 0 })}
                        </span>
                      )}
                      <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{t("posted", { date: posted })}</span>
                    </div>

                    {(job.requirements?.skills?.length ?? 0) > 0 && (
                      <div className={`mt-1.5 flex flex-wrap gap-1 ${isExpanded ? "" : "max-sm:hidden"}`}>
                        {job.requirements!.skills!.slice(0, 4).map((s) => (
                          <Badge key={s} variant="outline" className="rounded-full border-border bg-secondary/65 px-2 py-0.5 text-[11px] font-normal text-muted-foreground">{s}</Badge>
                        ))}
                      </div>
                    )}

                    {jobSummary && (
                      <p className={`mt-1.5 line-clamp-1 max-w-4xl text-xs leading-5 text-muted-foreground ${isExpanded ? "" : "max-sm:hidden"}`}>{jobSummary}</p>
                    )}

                    <CountCardGrid
                      className={`mt-2 ${isExpanded ? "" : "max-sm:hidden"}`}
                      items={[
                        { label: t("source"), value: getSourceLabel(job, t) },
                        { label: t("applicantsCountLabel"), value: job.applicantsCount ?? 0 },
                        { label: t("capacityLabel"), value: job.vacancies ?? "Open" },
                      ]}
                    />
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() => setExpandedJobs((prev) => {
                        const next = new Set(prev);
                        if (next.has(job._id)) next.delete(job._id); else next.add(job._id);
                        return next;
                      })}
                      aria-label={t(isExpanded ? "collapseJobDetails" : "expandJobDetails", { title: job.title })}
                      className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-border/60 bg-background/60 py-1 text-[11px] font-medium text-muted-foreground sm:hidden"
                    >
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                  </div>

                  {/* Right: Action panel */}
                  <div aria-label={`Actions for ${job.title}`} role="group" className="workspace-subtle-surface rounded-2xl border border-border xl:self-start chip-pad">
                    <div className="grid grid-cols-2 gap-1.5">
                      <Button
                        size="sm"
                        className="col-span-2 gap-2 rounded-lg px-3"
                        onClick={() => setSelectedJob(job)}
                      >
                        <Eye className="h-4 w-4" />
                        {t("viewDetails")}
                        <ArrowRight className="ml-auto h-4 w-4" />
                      </Button>
                      <Button
                        size="dense"
                        variant="outline"
                        className={`gap-1.5 rounded-lg px-2.5 text-xs font-semibold ${isExpanded ? "" : "max-sm:hidden"}`}
                        onClick={() => router.push(`/${locale}/admin/jobs/${job._id}/edit`)}
                      >
                        <Edit2 className="h-3.5 w-3.5" /> {t("edit")}
                      </Button>
                      <Button
                        size="dense"
                        variant="outline"
                        className={`gap-1.5 rounded-lg px-2.5 text-xs font-semibold ${isExpanded ? "" : "max-sm:hidden"}`}
                        onClick={() => router.push(`/${locale}/admin/applications?jobId=${job._id}`)}
                      >
                        <ClipboardList className="h-3.5 w-3.5" /> {t("applications")}
                      </Button>
                      <Button
                        size="dense"
                        variant="outline"
                        className={`col-span-2 gap-1.5 rounded-lg border-destructive/20 px-2.5 text-xs font-semibold text-destructive hover:bg-destructive/5 ${isExpanded ? "" : "max-sm:hidden"}`}
                        onClick={() => handleDeleteJob(job._id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> {t("delete")}
                      </Button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <PaginationControls
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={setLimit}
        className="text-muted-foreground"
      />

      {/* Job detail dialog */}
      <Dialog open={!!selectedJob} onOpenChange={(open) => { if (!open) setSelectedJob(null); }}>
        <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          {selectedJob && (
            <>
              <div className="sticky top-0 z-10 border-b border-border/60 bg-background/95 px-6 pb-4 pt-6 backdrop-blur-sm">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-3 text-xl font-semibold tracking-tight">
                    {selectedJob.title}
                    <StatusBadge status={selectedJob.status} />
                  </DialogTitle>
                  <DialogDescription className="sr-only">{t("jobDetailsDescription")}</DialogDescription>
                </DialogHeader>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  {selectedJob.employerId?.companyName && (
                    <span className="flex items-center gap-1.5 rounded-full bg-secondary/60 px-2.5 py-0.5 text-xs font-medium"><Building2 className="h-3 w-3" /> {selectedJob.employerId.companyName}</span>
                  )}
                  {selectedJob.category && (
                    <span className="flex items-center gap-1.5 rounded-full bg-secondary/60 px-2.5 py-0.5 text-xs font-medium"><Briefcase className="h-3 w-3" /> {selectedJob.category}</span>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto overscroll-contain scroll-smooth px-6 py-5">
                <div className="space-y-3 sm:space-y-6">
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    <Fact icon={MapPin} label={t("location")} value={formatLocation(selectedJob.location)} />
                    <Fact icon={DollarSign} label={t("salary")} value={formatSalary(selectedJob, t) || "—"} />
                    {selectedJob.employmentType && <Fact icon={Clock} label={t("type")} value={selectedJob.employmentType.replace(/_/g, " ")} />}
                    {selectedJob.workMode && <Fact icon={Globe} label={t("workMode")} value={selectedJob.workMode.replace(/_/g, " ")} />}
                    {(selectedJob.vacancies ?? 0) > 0 && <Fact icon={Users} label={t("vacancies")} value={String(selectedJob.vacancies)} />}
                    <Fact icon={Calendar} label={t("posted")} value={formatDate(new Date(selectedJob.createdAt))} />
                    <Fact icon={UserCheck} label={t("source")} value={getSourceLabel(selectedJob, t)} />
                  </div>

                  {selectedJob.description && (
                    <section>
                      <SectionHeading>{t("description")}</SectionHeading>
                      <div className="text-sm leading-relaxed text-foreground/90"><MarkdownRenderer content={selectedJob.description} /></div>
                    </section>
                  )}

                  {(selectedJob.requirements?.skills?.length ?? 0) > 0 && (
                    <section>
                      <SectionHeading>{t("requiredSkills")}</SectionHeading>
                      <div className="flex flex-wrap gap-2">
                        {selectedJob.requirements!.skills!.map((s) => (
                          <Badge key={s} variant="secondary" className="rounded-full border border-border/40 bg-secondary/50 px-3 py-1 text-xs font-medium">{s}</Badge>
                        ))}
                      </div>
                    </section>
                  )}

                  {(selectedJob.requirements?.experience || selectedJob.requirements?.education) && (
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {selectedJob.requirements?.experience && <Fact icon={Briefcase} label={t("experience")} value={selectedJob.requirements.experience} />}
                      {selectedJob.requirements?.education && <Fact icon={FileText} label={t("education")} value={selectedJob.requirements.education} />}
                    </div>
                  )}

                  {(selectedJob.responsibilities?.length ?? 0) > 0 && (
                    <section>
                      <SectionHeading>{t("responsibilities")}</SectionHeading>
                      <ul className="space-y-1.5 text-sm text-foreground/90">
                        {selectedJob.responsibilities!.map((r, i) => (
                          <li key={i} className="flex items-start gap-2.5">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {(selectedJob.benefits?.length ?? 0) > 0 && (
                    <section>
                      <SectionHeading>{t("benefits")}</SectionHeading>
                      <ul className="space-y-1.5 text-sm text-foreground/90">
                        {selectedJob.benefits!.map((b, i) => (
                          <li key={i} className="flex items-start gap-2.5">
                            <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tiny helpers                                                       */
/* ------------------------------------------------------------------ */

function Fact({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-gradient-to-br from-secondary/30 to-secondary/10 px-3.5 py-2.5 transition-colors hover:border-border/80">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      <span className="h-px max-w-3 flex-1 bg-border" />
      {children}
      <span className="h-px flex-1 bg-border/60" />
    </h4>
  );
}
