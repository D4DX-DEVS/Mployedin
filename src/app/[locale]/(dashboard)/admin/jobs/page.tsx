"use client";

import { useState, useEffect, useCallback } from "react";
import { StatusBadge } from "@/components/shared/StatusBadge";
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
import type { ExportColumn } from "@/lib/export";
import {
  Inbox, Sparkles, Briefcase, ShieldCheck, FileText, Users,
  Eye, Building2, MapPin, DollarSign, Clock, Calendar, Globe, UserCheck,
  Wand2, CheckCircle, ArrowRight,
} from "lucide-react";

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

const STATUS_OPTIONS: FilterOption[] = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "closed", label: "Closed" },
  { value: "expired", label: "Expired" },
];

const WORK_MODE_OPTIONS: FilterOption[] = [
  { value: "all", label: "All work modes" },
  { value: "onsite", label: "On-site" },
  { value: "hybrid", label: "Hybrid" },
  { value: "remote", label: "Remote" },
];

const EMPLOYMENT_TYPE_OPTIONS: FilterOption[] = [
  { value: "all", label: "All types" },
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "internship", label: "Internship" },
  { value: "freelance", label: "Freelance" },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatLocation(loc?: string | { isRemote?: boolean; city?: string; country?: string }) {
  if (!loc) return "—";
  if (typeof loc === "string") return loc;
  if (loc.isRemote) return "Remote";
  return [loc.city, loc.country].filter(Boolean).join(", ") || "—";
}

function getSourceLabel(job: Job) {
  const agent = job.agentId?.userId?.name;
  const superAgent = job.agentId?.superAgentId?.userId?.name;
  if (agent && superAgent) return `${agent} · ${superAgent}`;
  if (agent) return agent;
  return "Employer";
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-500/30",
  draft: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-500/30",
  paused: "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-500/30",
  closed: "bg-muted text-muted-foreground",
  expired: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-500/30",
};

const JOB_SUMMARY_MAX_LENGTH = 180;

function formatSalary(job: Job): string | null {
  const min = job.salary?.min ?? 0;
  const max = job.salary?.max ?? 0;
  const currency = job.salary?.currency ?? "USD";
  if (min <= 0 && max <= 0) return null;
  if (min > 0 && max > 0) return `${min.toLocaleString()} - ${max.toLocaleString()} ${currency}`;
  return `${Math.max(min, max).toLocaleString()} ${currency}`;
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
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  // Entity filter dropdowns
  const [employers, setEmployers] = useState<FilterOption[]>([]);
  const [agents, setAgents] = useState<FilterOption[]>([]);
  const [selectedEmployer, setSelectedEmployer] = useState("all");
  const [selectedAgent, setSelectedAgent] = useState("all");
  const [workMode, setWorkMode] = useState("all");
  const [employmentType, setEmploymentType] = useState("all");
  const [locationFilter, setLocationFilter] = useState("");
  const [skillsFilter, setSkillsFilter] = useState("");

  // AI search
  const [aiQuery, setAiQuery] = useState("");
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isApplyingAiSearch, setIsApplyingAiSearch] = useState(false);

  // Detail dialog
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();

  // Fetch employer & agent lists for filters
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
      if (!res.ok) throw new Error("Failed to load jobs. Please try again.");

      const data = await res.json();
      setJobs(data.jobs ?? data.items ?? []);
      updateTotal(data.pagination?.total ?? data.total ?? data.totalCount ?? ((data.totalPages ?? 1) * limit));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to load jobs. Please try again.";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [search, status, selectedEmployer, selectedAgent, workMode, employmentType, locationFilter, skillsFilter, page, limit, updateTotal]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const activeJobs = jobs.filter((j) => j.status === "active").length;
  const draftJobs = jobs.filter((j) => j.status === "draft").length;
  const totalApplicants = jobs.reduce((sum, j) => sum + (j.applicantsCount ?? 0), 0);

  const hasActiveFilters = search || status !== "all" || selectedEmployer !== "all" || selectedAgent !== "all" || workMode !== "all" || employmentType !== "all" || locationFilter || skillsFilter;

  const exportColumns: ExportColumn<Job>[] = [
    { header: "Title", key: "title" },
    { header: "Employer", key: "employerId" as keyof Job, formatter: (_v, r) => (r as unknown as Job).employerId?.companyName ?? "—" },
    { header: "Source", key: "agentId" as keyof Job, formatter: (_v, r) => getSourceLabel(r as unknown as Job) },
    { header: "Status", key: "status" },
    { header: "Location", key: "location", formatter: (v) => formatLocation(v as Job["location"]) },
    { header: "Category", key: "category", formatter: (v) => String(v ?? "—") },
    { header: "Applicants", key: "applicantsCount", formatter: (v) => String(v ?? 0) },
    { header: "Created", key: "createdAt", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : "—" },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: jobs as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "jobs",
    title: "Jobs",
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

      toast.success(data.degraded ? "AI search unavailable. Keyword search applied." : "AI search applied.");
    } catch {
      setSearch(query);
      setAiSummary(`AI search was unavailable, so keyword results are being shown for "${query}".`);
      toast.error("AI search unavailable. Keyword search applied instead.");
    } finally {
      setIsApplyingAiSearch(false);
    }
  }

  return (
    <div className="page-container space-y-5">
      <TableToolbar
        title="Job Listings"
        description="Manage and monitor all job postings across the platform."
        search={search}
        onSearchChange={(value) => { setSearch(value); resetPage(); }}
        searchPlaceholder="Search by job title…"
        left={(
          <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Recruitment control
          </div>
        )}
        right={(
          <div className="workspace-muted-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium">
            <ArrowRight className="h-3.5 w-3.5 text-primary" />
            {total.toLocaleString()} jobs across {totalPages.toLocaleString()} page{totalPages === 1 ? "" : "s"}
          </div>
        )}
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
        filterContent={(
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <label htmlFor="admin-jobs-status-filter" className="sr-only">Status</label>
                <SearchableSelect
                  id="admin-jobs-status-filter"
                  className="h-11 w-full rounded-xl border-border bg-card"
                  options={STATUS_OPTIONS}
                  value={status}
                  onValueChange={(value) => { setStatus(value); resetPage(); }}
                  placeholder="All statuses"
                />
              </div>
              {employers.length > 1 && (
                <div>
                  <label htmlFor="admin-jobs-employer-filter" className="sr-only">Employer</label>
                  <SearchableSelect
                    id="admin-jobs-employer-filter"
                    className="h-11 w-full rounded-xl border-border bg-card"
                    options={employers}
                    value={selectedEmployer}
                    onValueChange={(value) => { setSelectedEmployer(value); resetPage(); }}
                    placeholder="All employers"
                  />
                </div>
              )}
              {agents.length > 1 && (
                <div>
                  <label htmlFor="admin-jobs-agent-filter" className="sr-only">Agent</label>
                  <SearchableSelect
                    id="admin-jobs-agent-filter"
                    className="h-11 w-full rounded-xl border-border bg-card"
                    options={agents}
                    value={selectedAgent}
                    onValueChange={(value) => { setSelectedAgent(value); resetPage(); }}
                    placeholder="All agents"
                  />
                </div>
              )}
              <div>
                <label htmlFor="admin-jobs-workmode-filter" className="sr-only">Work mode</label>
                <SearchableSelect
                  id="admin-jobs-workmode-filter"
                  className="h-11 w-full rounded-xl border-border bg-card"
                  options={WORK_MODE_OPTIONS}
                  value={workMode}
                  onValueChange={(value) => { setWorkMode(value); resetPage(); }}
                  placeholder="All work modes"
                />
              </div>
              <div>
                <label htmlFor="admin-jobs-type-filter" className="sr-only">Employment type</label>
                <SearchableSelect
                  id="admin-jobs-type-filter"
                  className="h-11 w-full rounded-xl border-border bg-card"
                  options={EMPLOYMENT_TYPE_OPTIONS}
                  value={employmentType}
                  onValueChange={(value) => { setEmploymentType(value); resetPage(); }}
                  placeholder="All types"
                />
              </div>
              <div className="relative min-w-0">
                <label htmlFor="admin-jobs-location-filter" className="sr-only">Location</label>
                <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="admin-jobs-location-filter"
                  placeholder="Filter by location"
                  value={locationFilter}
                  onChange={(event) => { setLocationFilter(event.target.value); resetPage(); }}
                  className="h-11 rounded-xl border-border bg-card pl-9 text-sm shadow-none"
                />
              </div>
              <div className="relative min-w-0">
                <label htmlFor="admin-jobs-skills-filter" className="sr-only">Skills</label>
                <Input
                  id="admin-jobs-skills-filter"
                  placeholder="Skills, comma separated"
                  value={skillsFilter}
                  onChange={(event) => { setSkillsFilter(event.target.value); resetPage(); }}
                  className="h-11 rounded-xl border-border bg-card text-sm shadow-none"
                />
              </div>
            </div>

            <div className="grid gap-3 xl:grid-cols-[1fr_auto]">
              <div className="relative min-w-0">
                <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-500" />
                <Input
                  placeholder='AI search: e.g. "active remote React jobs in Kochi" or "draft jobs with no applicants"'
                  value={aiQuery}
                  onChange={(event) => setAiQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleApplyAiSearch();
                    }
                  }}
                  className="h-11 rounded-xl border-border bg-card pl-9 text-sm shadow-none"
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
                  onClick={resetFilters}
                  disabled={!hasActiveFilters && !aiQuery && !aiSummary}
                  className="h-11 rounded-xl border-border bg-card px-4 text-sm"
                >
                  Clear filters
                </Button>
              </div>
            </div>

            {aiSummary && (
              <p className="rounded-xl bg-primary/5 px-4 py-2.5 text-sm text-primary">
                <Sparkles className="mr-1.5 inline-block h-3.5 w-3.5" />
                {aiSummary}
              </p>
            )}
          </div>
        )}
        hasActiveFilters={Boolean(hasActiveFilters || aiSummary || aiQuery)}
      />

      <section className="grid gap-3 sm:grid-cols-3">
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Active</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-emerald-600 dark:text-emerald-300">{activeJobs}</p>
                <p className="mt-1 text-xs text-muted-foreground">Currently live</p>
              </div>
              <div className="workspace-tone-emerald rounded-2xl p-2.5"><ShieldCheck className="h-5 w-5" /></div>
            </div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Draft</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-amber-500 dark:text-amber-300">{draftJobs}</p>
                <p className="mt-1 text-xs text-muted-foreground">Unpublished</p>
              </div>
              <div className="workspace-tone-amber rounded-2xl p-2.5"><Briefcase className="h-5 w-5" /></div>
            </div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Applicants</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-violet-600 dark:text-violet-300">{totalApplicants}</p>
                <p className="mt-1 text-xs text-muted-foreground">Total applications</p>
              </div>
              <div className="workspace-tone-violet rounded-2xl p-2.5"><Users className="h-5 w-5" /></div>
            </div>
          </div>
      </section>

      {errorMessage && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-700 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          {errorMessage}
        </div>
      )}

      {/* Job Cards */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="workspace-panel-surface h-40 animate-pulse rounded-[28px]" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="workspace-panel-surface rounded-[28px] px-6 py-16 text-center">
          <div className="workspace-muted-pill mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[24px]">
            <Inbox className="h-7 w-7" />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{hasActiveFilters ? "No matching jobs" : "No jobs yet"}</p>
          <h3 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
            {hasActiveFilters ? "No jobs match the current search." : "No job postings found on the platform."}
          </h3>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
            {hasActiveFilters
              ? "Adjust the filters, remove a keyword, or try the AI search box to broaden the results."
              : "When employers or agents post jobs, they will appear here."}
          </p>
          {hasActiveFilters && (
            <Button
              onClick={resetFilters}
              variant="outline"
              className="mt-6 h-11 rounded-xl border-border bg-background/70 px-4 text-sm"
            >
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => {
            const posted = new Date(job.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
            const salaryLabel = formatSalary(job);
            const jobSummary = getJobSummary(job);

            return (
              <article
                key={job._id}
                className="workspace-panel-surface rounded-[28px] p-3.5 transition-all hover:-translate-y-0.5 hover:border-border sm:p-4"
              >
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_268px] xl:items-start">
                  {/* Left: Job metadata */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">{job.title}</h3>
                      <Badge className={`${STATUS_COLORS[job.status] ?? ""} border px-2.5 py-0.5 text-xs font-medium capitalize`}>{job.status}</Badge>
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {job.employerId?.companyName && (
                        <span className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-border dark:bg-background/80 dark:text-slate-300">
                          <Building2 className="h-3 w-3" />
                          {job.employerId.companyName}
                        </span>
                      )}
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-border dark:bg-background/80 dark:text-slate-300">{formatLocation(job.location)}</span>
                      {job.category && (
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-border dark:bg-background/80 dark:text-slate-300">{job.category}</span>
                      )}
                      {salaryLabel && (
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-border dark:bg-background/80 dark:text-slate-300">{salaryLabel}</span>
                      )}
                      {(job.vacancies ?? 0) > 0 && (
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-border dark:bg-background/80 dark:text-slate-300">
                          {job.vacancies} opening{job.vacancies === 1 ? "" : "s"}
                        </span>
                      )}
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-border dark:bg-background/80 dark:text-slate-300">Posted {posted}</span>
                    </div>

                    {(job.requirements?.skills?.length ?? 0) > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {job.requirements!.skills!.slice(0, 4).map((s) => (
                          <Badge key={s} variant="outline" className="rounded-full border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-normal text-slate-600 dark:border-border dark:bg-background/80 dark:text-slate-300">{s}</Badge>
                        ))}
                      </div>
                    )}

                    {jobSummary && (
                      <p className="mt-2.5 line-clamp-2 max-w-3xl text-sm leading-5 text-muted-foreground">{jobSummary}</p>
                    )}

                    <div className="mt-2.5 grid gap-2 sm:grid-cols-3">
                      <div className="workspace-subtle-surface rounded-xl border border-border px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Source</p>
                        <p className="mt-0.5 text-sm font-semibold text-foreground sm:text-base">{getSourceLabel(job)}</p>
                      </div>
                      <div className="workspace-subtle-surface rounded-xl border border-border px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Applicants</p>
                        <p className="mt-0.5 text-sm font-semibold text-foreground sm:text-base">{job.applicantsCount ?? 0}</p>
                      </div>
                      <div className="workspace-subtle-surface rounded-xl border border-border px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Capacity</p>
                        <p className="mt-0.5 text-sm font-semibold text-foreground sm:text-base">{job.vacancies ?? "Open"}</p>
                      </div>
                    </div>
                  </div>

                  {/* Right: Action buttons panel */}
                  <div aria-label={`Actions for ${job.title}`} role="group" className="workspace-subtle-surface flex flex-col gap-2 rounded-[20px] border border-border p-2.5 xl:self-start">
                    <div className="workspace-muted-pill flex items-center justify-between gap-3 rounded-2xl border border-border px-3 py-2">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Next actions</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Manage this role in one place.</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        className="col-span-2 h-10 gap-2 rounded-xl bg-sky-600 px-3 text-sm font-semibold text-white hover:bg-sky-700"
                        onClick={() => setSelectedJob(job)}
                      >
                        <Eye className="h-4 w-4" />
                        View Details
                        <ArrowRight className="ml-auto h-4 w-4" />
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
              {/* Sticky header */}
              <div className="sticky top-0 z-10 border-b border-border/60 bg-background/95 px-6 pb-4 pt-6 backdrop-blur-sm">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-3 text-xl font-semibold tracking-tight">
                    {selectedJob.title}
                    <StatusBadge status={selectedJob.status} />
                  </DialogTitle>
                  <DialogDescription className="sr-only">View full details for this job listing.</DialogDescription>
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

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto overscroll-contain scroll-smooth px-6 py-5">
                <div className="space-y-6">
                  {/* Key facts grid */}
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    <Fact icon={MapPin} label="Location" value={formatLocation(selectedJob.location)} />
                    <Fact icon={DollarSign} label="Salary" value={selectedJob.salary?.isNegotiable ? "Negotiable" : selectedJob.salary?.min ? `${selectedJob.salary.min.toLocaleString()} – ${selectedJob.salary.max?.toLocaleString()} ${selectedJob.salary.currency ?? ""}` : "—"} />
                    {selectedJob.employmentType && <Fact icon={Clock} label="Type" value={selectedJob.employmentType.replace(/_/g, " ")} />}
                    {selectedJob.workMode && <Fact icon={Globe} label="Work mode" value={selectedJob.workMode.replace(/_/g, " ")} />}
                    {(selectedJob.vacancies ?? 0) > 0 && <Fact icon={Users} label="Vacancies" value={String(selectedJob.vacancies)} />}
                    <Fact icon={Calendar} label="Posted" value={new Date(selectedJob.createdAt).toLocaleDateString()} />
                    <Fact icon={UserCheck} label="Source" value={getSourceLabel(selectedJob)} />
                  </div>

                  {/* Description */}
                  {selectedJob.description && (
                    <section>
                      <SectionHeading>Description</SectionHeading>
                      <p className="text-sm leading-relaxed text-foreground/90">{selectedJob.description}</p>
                    </section>
                  )}

                  {/* Skills */}
                  {(selectedJob.requirements?.skills?.length ?? 0) > 0 && (
                    <section>
                      <SectionHeading>Required Skills</SectionHeading>
                      <div className="flex flex-wrap gap-2">
                        {selectedJob.requirements!.skills!.map((s) => (
                          <Badge key={s} variant="secondary" className="rounded-full border border-border/40 bg-secondary/50 px-3 py-1 text-xs font-medium">{s}</Badge>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Experience & Education */}
                  {(selectedJob.requirements?.experience || selectedJob.requirements?.education) && (
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {selectedJob.requirements?.experience && <Fact icon={Briefcase} label="Experience" value={selectedJob.requirements.experience} />}
                      {selectedJob.requirements?.education && <Fact icon={FileText} label="Education" value={selectedJob.requirements.education} />}
                    </div>
                  )}

                  {/* Responsibilities */}
                  {(selectedJob.responsibilities?.length ?? 0) > 0 && (
                    <section>
                      <SectionHeading>Responsibilities</SectionHeading>
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

                  {/* Benefits */}
                  {(selectedJob.benefits?.length ?? 0) > 0 && (
                    <section>
                      <SectionHeading>Benefits</SectionHeading>
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
/*  Tiny helper                                                        */
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
      <span className="h-px flex-1 max-w-3 bg-border" />
      {children}
      <span className="h-px flex-1 bg-border/60" />
    </h4>
  );
}
