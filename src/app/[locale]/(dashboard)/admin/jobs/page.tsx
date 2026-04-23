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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Search, Inbox, Sparkles, Briefcase, ShieldCheck, FileText, Users,
  Eye, Building2, MapPin, DollarSign, Clock, Calendar, Globe, UserCheck,
  Wand2, CheckCircle,
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
    <div className="page-container space-y-6">
      {/* Hero */}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Recruitment
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
              Job Listings
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Manage and monitor all job postings across the platform.
            </p>
          </div>

          <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left sm:min-w-[240px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Overview</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{total.toLocaleString()} total jobs</p>
            <p className="text-xs text-muted-foreground">{totalPages.toLocaleString()} page{totalPages === 1 ? "" : "s"}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
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
        </div>
      </section>

      {/* Filters */}
      <section className="workspace-panel-surface rounded-[28px] p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="relative min-w-0">
            <label htmlFor="admin-jobs-search" className="sr-only">Search jobs</label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="admin-jobs-search"
              placeholder="Search by job title..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); resetPage(); }}
              className="h-11 rounded-xl border-border bg-secondary/65 pl-9 text-sm shadow-none"
            />
          </div>
          <div>
            <label htmlFor="admin-jobs-status-filter" className="sr-only">Status</label>
            <SearchableSelect
              id="admin-jobs-status-filter"
              className="h-11 w-full rounded-xl border-border bg-secondary/65"
              options={STATUS_OPTIONS}
              value={status}
              onValueChange={(v) => { setStatus(v); resetPage(); }}
              placeholder="All statuses"
            />
          </div>
          {employers.length > 1 && (
            <div>
              <label htmlFor="admin-jobs-employer-filter" className="sr-only">Employer</label>
              <SearchableSelect
                id="admin-jobs-employer-filter"
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
              <label htmlFor="admin-jobs-agent-filter" className="sr-only">Agent</label>
              <SearchableSelect
                id="admin-jobs-agent-filter"
                className="h-11 w-full rounded-xl border-border bg-secondary/65"
                options={agents}
                value={selectedAgent}
                onValueChange={(v) => { setSelectedAgent(v); resetPage(); }}
                placeholder="All agents"
              />
            </div>
          )}
          <div>
            <label htmlFor="admin-jobs-workmode-filter" className="sr-only">Work mode</label>
            <SearchableSelect
              id="admin-jobs-workmode-filter"
              className="h-11 w-full rounded-xl border-border bg-secondary/65"
              options={WORK_MODE_OPTIONS}
              value={workMode}
              onValueChange={(v) => { setWorkMode(v); resetPage(); }}
              placeholder="All work modes"
            />
          </div>
          <div>
            <label htmlFor="admin-jobs-type-filter" className="sr-only">Employment type</label>
            <SearchableSelect
              id="admin-jobs-type-filter"
              className="h-11 w-full rounded-xl border-border bg-secondary/65"
              options={EMPLOYMENT_TYPE_OPTIONS}
              value={employmentType}
              onValueChange={(v) => { setEmploymentType(v); resetPage(); }}
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
              onChange={(e) => { setLocationFilter(e.target.value); resetPage(); }}
              className="h-11 rounded-xl border-border bg-secondary/65 pl-9 text-sm shadow-none"
            />
          </div>
          <div className="relative min-w-0">
            <label htmlFor="admin-jobs-skills-filter" className="sr-only">Skills</label>
            <Input
              id="admin-jobs-skills-filter"
              placeholder="Skills, comma separated"
              value={skillsFilter}
              onChange={(e) => { setSkillsFilter(e.target.value); resetPage(); }}
              className="h-11 rounded-xl border-border bg-secondary/65 text-sm shadow-none"
            />
          </div>
        </div>

        {/* AI Search */}
        <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_auto]">
          <div className="relative min-w-0">
            <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-500" />
            <Input
              placeholder='AI search: e.g. "active remote React jobs in Kochi" or "draft jobs with no applicants"'
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
              onClick={resetFilters}
              disabled={!hasActiveFilters && !aiQuery && !aiSummary}
              className="h-11 rounded-xl border-border bg-secondary/65 px-4 text-sm"
            >
              Clear filters
            </Button>
          </div>
        </div>

        {aiSummary && (
          <p className="mt-3 rounded-xl bg-primary/5 px-4 py-2.5 text-sm text-primary">
            <Sparkles className="mr-1.5 inline-block h-3.5 w-3.5" />
            {aiSummary}
          </p>
        )}
      </section>

      {errorMessage && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-700 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          {errorMessage}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="workspace-panel-surface h-20 animate-pulse rounded-[28px]" />
          ))}
        </div>
      ) : (
        <section className="workspace-panel-surface overflow-hidden rounded-[24px]">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/80 bg-secondary/72 hover:bg-secondary/72">
                  <TableHead>Job</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Applicants</TableHead>
                  <TableHead className="pe-6">Posted</TableHead>
                  <TableHead className="w-[60px] text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                    <TableRow key={job._id} className="border-border/70">
                      {/* Job: title + category + company */}
                      <TableCell className="max-w-[280px]">
                        <div>
                          <p className="truncate font-medium text-foreground">{job.title}</p>
                          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                            {job.employerId?.companyName && (
                              <span className="flex items-center gap-1">
                                <Building2 className="h-3 w-3" />
                                {job.employerId.companyName}
                              </span>
                            )}
                            {job.category && (
                              <>
                                <span className="text-border">·</span>
                                <span>{job.category}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      {/* Source: who posted */}
                      <TableCell className="text-xs text-muted-foreground">{getSourceLabel(job)}</TableCell>

                      {/* Location */}
                      <TableCell className="text-xs text-muted-foreground">{formatLocation(job.location)}</TableCell>

                      {/* Status */}
                      <TableCell>
                        <StatusBadge status={job.status} />
                      </TableCell>

                      {/* Applicants */}
                      <TableCell className="text-center text-muted-foreground">{job.applicantsCount ?? 0}</TableCell>

                      {/* Posted date */}
                      <TableCell className="pe-6 text-xs text-muted-foreground">{new Date(job.createdAt).toLocaleDateString()}</TableCell>

                      {/* Actions */}
                      <TableCell className="w-[60px]">
                        <div className="flex items-center justify-center">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedJob(job)} title="View details">
                            <Eye className="h-4 w-4" />
                            <span className="sr-only">View details</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                {jobs.length === 0 && (
                  <TableRow className="border-border/70">
                    <TableCell colSpan={7} className="px-6 py-14 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="workspace-muted-pill rounded-[20px] p-3"><Inbox className="h-6 w-6" /></div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">No jobs found</p>
                          <p className="mt-1 text-sm text-muted-foreground">Adjust the filters to widen the view.</p>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="border-t border-border/80 px-4 py-3 sm:px-5">
            <PaginationControls
              page={page}
              totalPages={totalPages}
              total={total}
              limit={limit}
              onPageChange={setPage}
              onLimitChange={setLimit}
              className="text-muted-foreground"
            />
          </div>
        </section>
      )}

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
