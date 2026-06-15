"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
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
  Search, Inbox, Sparkles, Briefcase, ShieldCheck, FileText, Users, Plus,
  Eye, Building2, MapPin, DollarSign, Clock, Calendar, Globe, UserCheck,
  Wand2, CheckCircle, ArrowRight, Trash2, XCircle, Edit2, ClipboardList, Filter, ChevronDown, ChevronUp,
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
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [serverApplicants, setServerApplicants] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
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
      setStatusCounts(data.statusCounts ?? {});
      setServerApplicants(typeof data.totalApplicants === "number" ? data.totalApplicants : null);
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

  const handleApproveJob = async (jobId: string) => {
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/approve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved: true }),
      });
      if (!res.ok) throw new Error("Failed to approve");
      toast.success("Job approved successfully");
      fetchJobs();
    } catch { toast.error("Failed to approve job"); }
  };

  const handleRejectJob = async (jobId: string) => {
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/approve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved: false }),
      });
      if (!res.ok) throw new Error("Failed to reject");
      toast.success("Job rejected");
      fetchJobs();
    } catch { toast.error("Failed to reject job"); }
  };

  const handleDeleteJob = async (jobId: string) => {
    if (!confirm("Are you sure you want to delete this job?")) return;
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Job deleted");
      fetchJobs();
    } catch { toast.error("Failed to delete job"); }
  };

  const activeJobs = statusCounts.active ?? jobs.filter((j) => j.status === "active").length;
  const pendingJobs = statusCounts.pending_approval ?? jobs.filter((j) => j.status === "pending_approval").length;
  const totalApplicants = serverApplicants ?? jobs.reduce((sum, j) => sum + (j.applicantsCount ?? 0), 0);

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
    <div className="page-container employer-legacy-surface space-y-6">

      {/* ─── Hero ─────────────────────────────────────────────────────── */}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">
              <Sparkles className="h-3.5 w-3.5" />
              Recruitment Control
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
              Job Listings
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Manage and monitor all job postings across the platform — approve, reject, or edit roles from employers and agents.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Platform total</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{total.toLocaleString()} jobs</p>
              <p className="text-xs text-muted-foreground">Across {totalPages} page{totalPages === 1 ? "" : "s"}</p>
            </div>
            <Link href="./new">
              <Button className="h-11 gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700">
                <Plus className="h-4 w-4" />
                Post Job
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats Row */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {([
            { label: "Total Jobs", value: total, note: "All postings", icon: Briefcase, tone: "text-sky-600", chip: "bg-sky-50 dark:bg-sky-950/30" },
            { label: "Active", value: activeJobs, note: "Currently live", icon: ShieldCheck, tone: "text-emerald-600", chip: "bg-emerald-50 dark:bg-emerald-950/30" },
            { label: "Pending Review", value: pendingJobs, note: "Awaiting moderation", icon: FileText, tone: "text-amber-600", chip: "bg-amber-50 dark:bg-amber-950/30" },
            { label: "Applicants", value: totalApplicants, note: "Total applications", icon: Users, tone: "text-violet-600", chip: "bg-violet-50 dark:bg-violet-950/30" },
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

        {/* ─── Filter toggle bar ──────────────────────────────────────── */}
        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-white/10 dark:hover:bg-white/5"
          >
            <Filter className="h-4 w-4 text-muted-foreground" />
            {showFilters ? "Hide Filters" : "Show Filters"}
            {hasActiveFilters && <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">Active</Badge>}
            {showFilters ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
          <div className="flex items-center gap-2">
            {(hasActiveFilters || aiSummary || aiQuery) && (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="gap-1.5 text-xs text-muted-foreground">
                Clear filters
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
                placeholder="Search by job title…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); resetPage(); }}
                className="h-11 rounded-xl border-border bg-card pl-9 text-sm shadow-none"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SearchableSelect
                id="admin-jobs-status-filter"
                className="h-11 w-full rounded-xl border-border bg-card"
                options={STATUS_OPTIONS}
                value={status}
                onValueChange={(value) => { setStatus(value); resetPage(); }}
                placeholder="All statuses"
              />
              {employers.length > 1 && (
                <SearchableSelect
                  id="admin-jobs-employer-filter"
                  className="h-11 w-full rounded-xl border-border bg-card"
                  options={employers}
                  value={selectedEmployer}
                  onValueChange={(value) => { setSelectedEmployer(value); resetPage(); }}
                  placeholder="All employers"
                />
              )}
              {agents.length > 1 && (
                <SearchableSelect
                  id="admin-jobs-agent-filter"
                  className="h-11 w-full rounded-xl border-border bg-card"
                  options={agents}
                  value={selectedAgent}
                  onValueChange={(value) => { setSelectedAgent(value); resetPage(); }}
                  placeholder="All agents"
                />
              )}
              <SearchableSelect
                id="admin-jobs-workmode-filter"
                className="h-11 w-full rounded-xl border-border bg-card"
                options={WORK_MODE_OPTIONS}
                value={workMode}
                onValueChange={(value) => { setWorkMode(value); resetPage(); }}
                placeholder="All work modes"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <Filter className="h-3.5 w-3.5" />
                Advanced Filters
                {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            </div>

            {showAdvanced && (
              <div className="grid gap-3 pt-1 sm:grid-cols-2 xl:grid-cols-4">
                <SearchableSelect
                  id="admin-jobs-type-filter"
                  className="h-11 w-full rounded-xl border-border bg-card"
                  options={EMPLOYMENT_TYPE_OPTIONS}
                  value={employmentType}
                  onValueChange={(value) => { setEmploymentType(value); resetPage(); }}
                  placeholder="All types"
                />
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Filter by location"
                    value={locationFilter}
                    onChange={(e) => { setLocationFilter(e.target.value); resetPage(); }}
                    className="h-11 rounded-xl border-border bg-card pl-9 text-sm shadow-none"
                  />
                </div>
                <Input
                  placeholder="Skills, comma separated"
                  value={skillsFilter}
                  onChange={(e) => { setSkillsFilter(e.target.value); resetPage(); }}
                  className="h-11 rounded-xl border-border bg-card text-sm shadow-none"
                />
              </div>
            )}

            <div className="grid gap-3 xl:grid-cols-[1fr_auto]">
              <div className="relative">
                <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-500" />
                <Input
                  placeholder='AI search: e.g. "active remote React jobs in Kochi"'
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
                {isApplyingAiSearch ? "Applying…" : "AI Search"}
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

      {/* ─── Error ────────────────────────────────────────────────────── */}
      {errorMessage && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-700 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          {errorMessage}
        </div>
      )}

      {/* ─── Job Cards ────────────────────────────────────────────────── */}
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {hasActiveFilters ? "No matching jobs" : "No jobs yet"}
          </p>
          <h3 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
            {hasActiveFilters ? "No jobs match the current search." : "No job postings found on the platform."}
          </h3>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
            {hasActiveFilters
              ? "Adjust the filters, remove a keyword, or try the AI search box to broaden the results."
              : "When employers or agents post jobs, they will appear here."}
          </p>
          {hasActiveFilters && (
            <Button onClick={resetFilters} variant="outline" className="mt-6 h-11 rounded-xl border-border bg-background/70 px-4 text-sm">
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

                  {/* Right: Action panel */}
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
                      {(job.poster?.approvalStatus === "pending" || job.status === "draft") && (
                        <Button
                          size="sm"
                          className="h-9 gap-1.5 rounded-xl bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700"
                          onClick={() => handleApproveJob(job._id)}
                        >
                          <CheckCircle className="h-3.5 w-3.5" /> Approve
                        </Button>
                      )}
                      {(job.poster?.approvalStatus === "pending" || job.status === "draft") && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 gap-1.5 rounded-xl border-amber-200 px-3 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                          onClick={() => handleRejectJob(job._id)}
                        >
                          <XCircle className="h-3.5 w-3.5" /> Reject
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 gap-1.5 rounded-xl px-3 text-xs font-semibold"
                        onClick={() => window.open(`/admin/jobs/${job._id}/edit`, "_blank")}
                      >
                        <Edit2 className="h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 gap-1.5 rounded-xl px-3 text-xs font-semibold"
                        onClick={() => window.open(`/admin/applications?jobId=${job._id}`, "_blank")}
                      >
                        <ClipboardList className="h-3.5 w-3.5" /> Applications
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="col-span-2 h-9 gap-1.5 rounded-xl border-destructive/20 px-3 text-xs font-semibold text-destructive hover:bg-destructive/5"
                        onClick={() => handleDeleteJob(job._id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
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

              <div className="flex-1 overflow-y-auto overscroll-contain scroll-smooth px-6 py-5">
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    <Fact icon={MapPin} label="Location" value={formatLocation(selectedJob.location)} />
                    <Fact icon={DollarSign} label="Salary" value={selectedJob.salary?.isNegotiable ? "Negotiable" : selectedJob.salary?.min ? `${selectedJob.salary.min.toLocaleString()} – ${selectedJob.salary.max?.toLocaleString()} ${selectedJob.salary.currency ?? ""}` : "—"} />
                    {selectedJob.employmentType && <Fact icon={Clock} label="Type" value={selectedJob.employmentType.replace(/_/g, " ")} />}
                    {selectedJob.workMode && <Fact icon={Globe} label="Work mode" value={selectedJob.workMode.replace(/_/g, " ")} />}
                    {(selectedJob.vacancies ?? 0) > 0 && <Fact icon={Users} label="Vacancies" value={String(selectedJob.vacancies)} />}
                    <Fact icon={Calendar} label="Posted" value={new Date(selectedJob.createdAt).toLocaleDateString()} />
                    <Fact icon={UserCheck} label="Source" value={getSourceLabel(selectedJob)} />
                  </div>

                  {selectedJob.description && (
                    <section>
                      <SectionHeading>Description</SectionHeading>
                      <p className="text-sm leading-relaxed text-foreground/90">{selectedJob.description}</p>
                    </section>
                  )}

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

                  {(selectedJob.requirements?.experience || selectedJob.requirements?.education) && (
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {selectedJob.requirements?.experience && <Fact icon={Briefcase} label="Experience" value={selectedJob.requirements.experience} />}
                      {selectedJob.requirements?.education && <Fact icon={FileText} label="Education" value={selectedJob.requirements.education} />}
                    </div>
                  )}

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
