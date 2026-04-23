"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Plus, Edit2, Eye, Clock, CheckCircle, FileText, Trash2, Copy, Users, BriefcaseBusiness, ShieldCheck, Banknote, BookTemplate, Search, Sparkles, ArrowRight, GitBranch, SlidersHorizontal, PauseCircle, PlayCircle, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePermissions } from "@/hooks/usePermissions";
import { useConfirm } from "@/hooks/useConfirm";
import { useJobs, useUpdateJobStatus, useCloneJob, useDeleteJob, useSaveAsTemplate, useJobTemplates, type Job } from "@/hooks/useJobs";
import { useDebounce } from "@/hooks/useDebounce";
import { JobPosterDialog } from "@/components/features/employer/jobs/JobPosterDialog";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-500/30",
  draft: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-500/30",
  paused: "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-500/30",
  closed: "bg-muted text-muted-foreground",
  expired: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-500/30",
};

const JOB_SUMMARY_MAX_LENGTH = 180;

type PendingJobAction = "activate" | "deactivate" | "pause" | "delete";

export default function EmployerJobsPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const { can } = usePermissions();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [statusFilter, setStatusFilter] = useState("all");
  const [workModeFilter, setWorkModeFilter] = useState("all");
  const [salaryVisibilityFilter, setSalaryVisibilityFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [skillsFilter, setSkillsFilter] = useState("");
  const [aiQuery, setAiQuery] = useState("");
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isApplyingAiSearch, setIsApplyingAiSearch] = useState(false);
  const [cloningJobId, setCloningJobId] = useState<string | null>(null);
  const [posterJob, setPosterJob] = useState<Job | null>(null);
  const [pendingJobAction, setPendingJobAction] = useState<{ jobId: string; action: PendingJobAction } | null>(null);
  const debouncedSearch = useDebounce(search, 300);
  const debouncedLocation = useDebounce(locationFilter, 300);
  const debouncedSkills = useDebounce(skillsFilter, 300);
  const normalizedSkills = debouncedSkills
    .split(",")
    .map((skill) => skill.trim())
    .filter(Boolean);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [statusFilter, workModeFilter, salaryVisibilityFilter, debouncedSearch, debouncedLocation, debouncedSkills]);

  useEffect(() => { document.title = "My Jobs · MPLOYEDIN"; }, []);

  // ── React Query ────────────────────────────────────────────────
  const { data, isLoading } = useJobs({
    page,
    limit,
    status: statusFilter,
    workMode: workModeFilter,
    search: debouncedSearch,
    location: debouncedLocation,
    skills: normalizedSkills,
    showSalary: salaryVisibilityFilter === "all" ? undefined : salaryVisibilityFilter === "shown" ? "true" : "false",
    myJobs: true,
  });

  const jobs = data?.jobs ?? [];
  const total = data?.pagination?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const hasActiveFilters = statusFilter !== "all"
    || workModeFilter !== "all"
    || salaryVisibilityFilter !== "all"
    || Boolean(search.trim())
    || Boolean(locationFilter.trim())
    || Boolean(skillsFilter.trim());

  const updateStatus = useUpdateJobStatus();
  const cloneJob = useCloneJob();
  const deleteJob = useDeleteJob();
  const saveAsTemplate = useSaveAsTemplate();
  const { data: jobTemplates = [] } = useJobTemplates();
  const [savingTemplateId, setSavingTemplateId] = useState<string | null>(null);

  const savedTemplateIds = new Set(
    jobTemplates.filter((t) => t.sourceJobId).map((t) => t.sourceJobId as string)
  );

  const activeJobs = jobs.filter((job) => job.status === "active").length;
  const draftJobs = jobs.filter((job) => job.status === "draft").length;
  const pausedJobs = jobs.filter((job) => job.status === "paused").length;
  const hiddenSalaryJobs = jobs.filter((job) => job.showSalary === false).length;
  const totalOpenings = jobs.reduce((sum, job) => sum + (job.vacancies ?? 0), 0);

  async function handleCloneJob(job: Job) {
    setCloningJobId(job._id);
    const loadingToastId = toast.loading("Cloning job...");

    try {
      const data = await cloneJob.mutateAsync(job._id);
      const clonedJobId = data?.job?._id;

      if (!clonedJobId) {
        throw new Error("Failed to retrieve cloned job ID");
      }

      toast.success("Job cloned successfully", { id: loadingToastId });
      router.push(`/${locale}/employer/jobs/${clonedJobId}/edit`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to clone job", { id: loadingToastId });
    } finally {
      setCloningJobId(null);
    }
  }

  async function handleSaveAsTemplate(job: Job) {
    setSavingTemplateId(job._id);
    try {
      await saveAsTemplate.mutateAsync(job);
      toast.success(`"${job.title}" saved as template`);
    } catch {
      toast.error("Failed to save template");
    } finally {
      setSavingTemplateId(null);
    }
  }

  async function handleActivateJob(job: Job) {
    setPendingJobAction({ jobId: job._id, action: "activate" });

    try {
      await updateStatus.mutateAsync({ jobId: job._id, status: "active" });
      toast.success("Job activated successfully!");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to activate job");
    } finally {
      setPendingJobAction((current) => (current?.jobId === job._id ? null : current));
    }
  }

  async function handleDeactivateJob(job: Job) {
    const ok = await confirmDialog(
      "Deactivate this job? It will stop accepting new applications, but existing applications stay available."
    );
    if (!ok) return;

    setPendingJobAction({ jobId: job._id, action: "deactivate" });

    try {
      await updateStatus.mutateAsync({ jobId: job._id, status: "closed" });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to deactivate job");
    } finally {
      setPendingJobAction((current) => (current?.jobId === job._id ? null : current));
    }
  }

  async function handlePauseJob(job: Job) {
    const ok = await confirmDialog(
      "Pause this job? It will temporarily stop accepting new applications. You can resume it at any time."
    );
    if (!ok) return;

    setPendingJobAction({ jobId: job._id, action: "pause" });

    try {
      await updateStatus.mutateAsync({ jobId: job._id, status: "paused" });
      toast.success("Job paused successfully!");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to pause job");
    } finally {
      setPendingJobAction((current) => (current?.jobId === job._id ? null : current));
    }
  }

  async function handleResumeJob(job: Job) {
    setPendingJobAction({ jobId: job._id, action: "activate" });

    try {
      await updateStatus.mutateAsync({ jobId: job._id, status: "active" });
      toast.success("Job resumed successfully!");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to resume job");
    } finally {
      setPendingJobAction((current) => (current?.jobId === job._id ? null : current));
    }
  }

  async function handleDeleteJob(job: Job) {
    const prompt =
      job.status === "draft"
        ? "Delete this draft job? This cannot be undone."
        : "Permanently delete this job post? All associated data will be removed and this cannot be undone.";
    const ok = await confirmDialog(prompt);
    if (!ok) return;

    setPendingJobAction({ jobId: job._id, action: "delete" });

    try {
      await deleteJob.mutateAsync(job._id);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to delete job");
    } finally {
      setPendingJobAction((current) => (current?.jobId === job._id ? null : current));
    }
  }

  function formatLocation(job: Job): string {
    if (!job.location) return "Location not set";
    if (typeof job.location === "string") return job.location;
    if (job.location.isRemote) return "Remote";
    return [job.location.city, job.location.country].filter(Boolean).join(", ") || "Location not set";
  }

  function formatSalary(job: Job): string {
    if (job.showSalary === false) return "Salary not disclosed";

    const min = job.salary?.min ?? 0;
    const max = job.salary?.max ?? 0;
    const currency = job.salary?.currency ?? "USD";

    if (min <= 0 && max <= 0) return "Salary not set";

    if (min > 0 && max > 0) {
      return `${min.toLocaleString()} - ${max.toLocaleString()} ${currency}`;
    }

    return `${Math.max(min, max).toLocaleString()} ${currency}`;
  }

  function resetFilters() {
    setSearch("");
    setStatusFilter("all");
    setWorkModeFilter("all");
    setSalaryVisibilityFilter("all");
    setLocationFilter("");
    setSkillsFilter("");
    setAiQuery("");
    setAiSummary(null);
    setPage(1);
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

      if (!res.ok) {
        throw new Error("AI search failed");
      }

      const data = await res.json();
      const filters = data.filters ?? {};
      const hasSkills = Array.isArray(filters.skills) && filters.skills.length > 0;
      // Always clear text search when skills are extracted — mixing $text + skills
      // $all causes $text to match descriptions that merely mention the skill name.
      setSearch(hasSkills ? "" : (filters.search ?? ""));
      setStatusFilter(filters.status ?? "all");
      setWorkModeFilter(filters.workMode ?? "all");
      setLocationFilter(filters.location ?? "");
      setSkillsFilter(hasSkills ? filters.skills.join(", ") : "");
      setSalaryVisibilityFilter(
        filters.showSalary === true ? "shown" : filters.showSalary === false ? "hidden" : "all"
      );
      setAiSummary(data.summary ?? null);

      toast.success(data.degraded ? "AI search unavailable. Keyword search applied." : "AI search applied.");
    } catch {
      setSearch(query);
      setAiSummary(`AI search was unavailable, so keyword results are being shown for "${query}".`);
      toast.error("AI search unavailable. Keyword search applied instead.");
    } finally {
      setIsApplyingAiSearch(false);
    }
  }

  function getFilledSlots(job: Job): number {
    return job.applicationCount ?? job.applicantIds?.length ?? 0;
  }

  function getJobSummary(job: Job): string | null {
    if (!job.description) return null;

    const parser = new DOMParser();
    const plainText = parser.parseFromString(job.description, "text/html").body.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (!plainText) return null;

    if (plainText.length <= JOB_SUMMARY_MAX_LENGTH) return plainText;

    return `${plainText.slice(0, JOB_SUMMARY_MAX_LENGTH - 3).trimEnd()}...`;
  }

  return (
    <div className="page-container employer-legacy-surface space-y-6">
      {ConfirmDialogNode}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Hiring workspace
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
              My Job Postings
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Review live roles, keep draft jobs moving, and jump into applications from the same polished workspace used in job creation.
            </p>
          </div>

          {can("jobs", "create") ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Portfolio</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{total} total jobs</p>
                <p className="text-xs text-muted-foreground">Active, draft, and archived roles in one place.</p>
              </div>
              <Button
                onClick={() => router.push(`/${locale}/employer/jobs/new`)}
                className="h-11 gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700"
              >
                <Plus className="h-4 w-4" />
                Post a Job
              </Button>
            </div>
          ) : null}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Active</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{activeJobs}</p>
                <p className="mt-1 text-xs text-muted-foreground">Roles currently accepting candidates.</p>
              </div>
              <div className="workspace-tone-emerald rounded-2xl p-2.5">
                <ShieldCheck className="h-5 w-5" />
              </div>
            </div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Drafts</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{draftJobs}</p>
                <p className="mt-1 text-xs text-muted-foreground">Roles waiting for a final review or activation.</p>
              </div>
              <div className="workspace-tone-amber rounded-2xl p-2.5">
              <BriefcaseBusiness className="h-5 w-5" />
              </div>
            </div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Salary Hidden</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{hiddenSalaryJobs}</p>
                <p className="mt-1 text-xs text-muted-foreground">Jobs using private compensation details.</p>
              </div>
              <div className="workspace-muted-pill rounded-2xl p-2.5">
              <Banknote className="h-5 w-5" />
              </div>
            </div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Openings</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{totalOpenings}</p>
                <p className="mt-1 text-xs text-muted-foreground">Combined vacancies across the current results.</p>
              </div>
              <div className="workspace-tone-sky rounded-2xl p-2.5">
              <Users className="h-5 w-5" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="workspace-panel-surface rounded-[28px] p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Browse roles</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Filter the jobs you want to act on next</h2>
            <p className="mt-1 text-sm text-muted-foreground">Search by keyword, layer on structured filters, or describe the jobs you need in plain English.</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px_220px]">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search jobs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 rounded-xl border-border bg-background/70 pl-9 text-sm shadow-none"
            />
          </div>
          <SearchableSelect
            className="h-11 w-full rounded-xl border-border bg-background/70"
            options={[
              { value: "all", label: "All statuses" },
              { value: "active", label: "Active" },
              { value: "paused", label: "Paused" },
              { value: "draft", label: "Draft" },
              { value: "closed", label: "Closed" },
              { value: "expired", label: "Expired" },
            ]}
            value={statusFilter}
            onValueChange={setStatusFilter}
            placeholder="All statuses"
          />
        </div>

        <div className="mt-3 grid gap-3 xl:grid-cols-[220px_220px_220px_minmax(0,1fr)_minmax(0,1fr)_150px]">
          <SearchableSelect
            className="h-11 w-full rounded-xl border-border bg-background/70"
            options={[
              { value: "all", label: "All work modes" },
              { value: "onsite", label: "On-site" },
              { value: "hybrid", label: "Hybrid" },
              { value: "remote", label: "Remote" },
            ]}
            value={workModeFilter}
            onValueChange={setWorkModeFilter}
            placeholder="All work modes"
          />
          <SearchableSelect
            className="h-11 w-full rounded-xl border-border bg-background/70"
            options={[
              { value: "all", label: "All salary visibility" },
              { value: "shown", label: "Salary shown" },
              { value: "hidden", label: "Salary hidden" },
            ]}
            value={salaryVisibilityFilter}
            onValueChange={setSalaryVisibilityFilter}
            placeholder="All salary visibility"
          />
          <div className="relative min-w-0">
            <Input
              placeholder="Filter by location"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="h-11 rounded-xl border-border bg-background/70 text-sm shadow-none"
            />
          </div>
          <div className="relative min-w-0">
            <Input
              placeholder="Skills, comma separated"
              value={skillsFilter}
              onChange={(e) => setSkillsFilter(e.target.value)}
              className="h-11 rounded-xl border-border bg-background/70 text-sm shadow-none"
            />
          </div>
          <div className="relative min-w-0 xl:col-span-2">
            <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-500" />
            <Input
              placeholder="AI search: e.g. draft remote React roles in Dubai with hidden salary"
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleApplyAiSearch();
                }
              }}
              className="h-11 rounded-xl border-border bg-background/70 pl-9 text-sm shadow-none"
            />
          </div>
        </div>

        <div className="workspace-subtle-surface mt-3 flex flex-col gap-3 rounded-2xl p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Need a faster cut?</p>
            <p className="text-sm text-muted-foreground">Describe the roles you want, and AI will apply the matching filters for you.</p>
            {aiSummary ? <p className="mt-2 text-sm text-primary">{aiSummary}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => { void handleApplyAiSearch(); }}
              disabled={!aiQuery.trim() || isApplyingAiSearch}
              className="h-11 gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Sparkles className="h-4 w-4" />
              {isApplyingAiSearch ? "Applying AI search…" : "Apply AI Search"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={resetFilters}
              disabled={!hasActiveFilters && !aiQuery && !aiSummary}
              className="h-11 rounded-xl border-border bg-background/70 px-4 text-sm"
            >
              Clear filters
            </Button>
          </div>
        </div>
      </section>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="workspace-panel-surface h-40 animate-pulse rounded-[28px]"
            />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="workspace-panel-surface rounded-[28px] px-6 py-16 text-center">
          <div className="workspace-tone-sky mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[24px]">
            <FileText className="h-7 w-7" />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{hasActiveFilters ? "No matching roles" : "No roles yet"}</p>
          <h3 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
            {hasActiveFilters ? "No jobs match the current search." : "Start your employer hiring workflow here."}
          </h3>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
            {hasActiveFilters
              ? "Adjust the filters, remove a keyword, or try the AI search box to broaden the results."
              : "Post your first role, invite the right applicants, and manage every next step from a consistent employer dashboard."}
          </p>
          {hasActiveFilters ? (
            <Button
              onClick={resetFilters}
              variant="outline"
              className="mt-6 h-11 rounded-xl border-border bg-background/70 px-4 text-sm"
            >
              Clear filters
            </Button>
          ) : (
            <Button
              onClick={() => router.push(`/${locale}/employer/jobs/new`)}
              className="mt-6 h-11 gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700"
            >
              <Plus className="h-4 w-4" />
              Post a Job
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => {
            const posted = new Date(job.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
            const expires = job.expiresAt ? new Date(job.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
            const isActivating = pendingJobAction?.jobId === job._id && pendingJobAction.action === "activate";
            const isDeactivating = pendingJobAction?.jobId === job._id && pendingJobAction.action === "deactivate";
            const isPausing = pendingJobAction?.jobId === job._id && pendingJobAction.action === "pause";
            const isDeleting = pendingJobAction?.jobId === job._id && pendingJobAction.action === "delete";
            const jobSummary = getJobSummary(job);

            return (
              <article
                key={job._id}
                className="workspace-panel-surface rounded-[28px] p-3.5 transition-all hover:-translate-y-0.5 hover:border-border sm:p-4"
              >
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_268px] xl:items-start">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">{job.title}</h3>
                      <Badge className={`${STATUS_COLORS[job.status] ?? ""} border px-2.5 py-0.5 text-xs font-medium capitalize`}>{job.status}</Badge>
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-border dark:bg-background/80 dark:text-slate-300">{formatLocation(job)}</span>
                      {job.category ? (
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-border dark:bg-background/80 dark:text-slate-300">{job.category}</span>
                      ) : null}
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-border dark:bg-background/80 dark:text-slate-300">{formatSalary(job)}</span>
                      {job.vacancies != null ? (
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-border dark:bg-background/80 dark:text-slate-300">
                          {job.vacancies} opening{job.vacancies === 1 ? "" : "s"}
                        </span>
                      ) : null}
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-border dark:bg-background/80 dark:text-slate-300">Posted {posted}</span>
                      {expires ? (
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-border dark:bg-background/80 dark:text-slate-300">Expires {expires}</span>
                      ) : null}
                    </div>

                    {job.requirements?.skills?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {job.requirements.skills.slice(0, 4).map((s) => (
                          <Badge key={s} variant="outline" className="rounded-full border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-normal text-slate-600 dark:border-border dark:bg-background/80 dark:text-slate-300">{s}</Badge>
                        ))}
                      </div>
                    )}

                    {jobSummary ? (
                      <p className="mt-2.5 line-clamp-2 max-w-3xl text-sm leading-5 text-muted-foreground">{jobSummary}</p>
                    ) : null}

                    <div className="mt-2.5 grid gap-2 sm:grid-cols-3">
                      <div className="workspace-subtle-surface rounded-xl border border-border px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Views</p>
                        <p className="mt-0.5 text-sm font-semibold text-foreground sm:text-base">{job.views?.toLocaleString() ?? 0}</p>
                      </div>
                      <div className="workspace-subtle-surface rounded-xl border border-border px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Applicants</p>
                        <p className="mt-0.5 text-sm font-semibold text-foreground sm:text-base">{getFilledSlots(job)}</p>
                      </div>
                      <div className="workspace-subtle-surface rounded-xl border border-border px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Capacity</p>
                        <p className="mt-0.5 text-sm font-semibold text-foreground sm:text-base">{job.maxApplicants ?? "Open"}</p>
                      </div>
                    </div>
                  </div>

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
                        onClick={() => router.push(`/${locale}/employer/applications?jobId=${job._id}`)}
                      >
                        <Users className="h-4 w-4" />
                        Applications
                        <ArrowRight className="ml-auto h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" title="View job" className="h-9 gap-2 rounded-xl border-border bg-background/80 px-3 text-sm text-foreground"
                        onClick={() => router.push(`/${locale}/employer/jobs/${job._id}`)}>
                        <Eye className="h-4 w-4" /> View
                      </Button>
                      {can("jobs", "update") && (
                        <Button size="sm" variant="outline" title="Edit" className="h-9 gap-2 rounded-xl border-border bg-background/80 px-3 text-sm text-foreground"
                          onClick={() => router.push(`/${locale}/employer/jobs/${job._id}/edit`)}>
                          <Edit2 className="h-4 w-4" /> Edit
                        </Button>
                      )}
                      {can("jobs", "update") && (
                        <Button size="sm" variant="outline" title="Job Workflow" className="h-9 gap-2 rounded-xl border-border bg-background/80 px-3 text-sm text-foreground"
                          onClick={() => router.push(`/${locale}/employer/jobs/${job._id}?tab=workflow`)}>
                          <GitBranch className="h-4 w-4" /> Workflow
                        </Button>
                      )}
                      {can("jobs", "update") && (
                        <Button size="sm" variant="outline" title="Matching Weights" className="h-9 gap-2 rounded-xl border-border bg-background/80 px-3 text-sm text-foreground"
                          onClick={() => router.push(`/${locale}/employer/jobs/${job._id}?tab=matching-weights`)}>
                          <SlidersHorizontal className="h-4 w-4" /> Weights
                        </Button>
                      )}
                      {can("jobs", "create") && (
                        <Button size="sm" variant="outline" title="Create Poster" className="h-9 gap-2 rounded-xl border-border bg-background/80 px-3 text-sm text-foreground"
                          onClick={() => setPosterJob(job)}>
                          <ImageIcon className="h-4 w-4" /> Poster
                        </Button>
                      )}
                      {can("jobs", "create") && (
                        <Button size="sm" variant="outline" title="Clone" className="h-9 gap-2 rounded-xl border-border bg-background/80 px-3 text-sm text-foreground"
                          onClick={() => { void handleCloneJob(job); }}
                          disabled={cloningJobId === job._id}>
                          <Copy className="h-4 w-4" /> {cloningJobId === job._id ? "Cloning…" : "Clone"}
                        </Button>
                      )}
                      {can("jobs", "create") && (
                        <Button
                          size="sm"
                          variant="outline"
                          title={savedTemplateIds.has(job._id) ? "Already saved as template" : "Save as Template"}
                          className={`h-9 gap-2 rounded-xl border-border bg-background/80 px-3 text-sm text-foreground ${
                            savedTemplateIds.has(job._id)
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/40 cursor-default"
                              : ""
                          }`}
                          onClick={() => { if (!savedTemplateIds.has(job._id)) void handleSaveAsTemplate(job); }}
                          disabled={savingTemplateId === job._id || savedTemplateIds.has(job._id)}>
                          {savedTemplateIds.has(job._id) ? (
                            <><CheckCircle className="h-4 w-4" /> Saved</>
                          ) : savingTemplateId === job._id ? (
                            <><BookTemplate className="h-4 w-4" /> Saving…</>
                          ) : (
                            <><BookTemplate className="h-4 w-4" /> Template</>
                          )}
                        </Button>
                      )}
                      {can("jobs", "update") && job.status === "draft" && (
                        <Button size="sm" variant="outline" className="h-9 gap-1.5 rounded-xl border-emerald-200 px-3 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-300 dark:hover:bg-emerald-950/40" onClick={() => { void handleActivateJob(job); }} disabled={isActivating}>
                        <CheckCircle className="h-3.5 w-3.5" /> {isActivating ? "Activating…" : "Activate"}
                        </Button>
                      )}
                      {can("jobs", "update") && job.status === "active" && (
                        <Button size="sm" variant="outline" className="h-9 gap-2 rounded-xl border-sky-200 px-3 text-sky-700 hover:bg-sky-50 dark:border-sky-500/30 dark:text-sky-300 dark:hover:bg-sky-950/40" onClick={() => { void handlePauseJob(job); }} disabled={isPausing}>
                          <PauseCircle className="h-4 w-4" /> {isPausing ? "Pausing…" : "Pause"}
                        </Button>
                      )}
                      {can("jobs", "update") && job.status === "active" && (
                        <Button size="sm" variant="outline" className="h-9 gap-2 rounded-xl border-orange-200 px-3 text-orange-700 hover:bg-orange-50 dark:border-orange-500/30 dark:text-orange-300 dark:hover:bg-orange-950/40" onClick={() => { void handleDeactivateJob(job); }} disabled={isDeactivating}>
                          <Clock className="h-4 w-4" /> {isDeactivating ? "Deactivating…" : "Deactivate"}
                        </Button>
                      )}
                      {can("jobs", "update") && job.status === "paused" && (
                        <Button size="sm" variant="outline" className="h-9 gap-1.5 rounded-xl border-emerald-200 px-3 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-300 dark:hover:bg-emerald-950/40" onClick={() => { void handleResumeJob(job); }} disabled={isActivating}>
                          <PlayCircle className="h-3.5 w-3.5" /> {isActivating ? "Resuming…" : "Resume"}
                        </Button>
                      )}
                      {can("jobs", "update") && job.status === "paused" && (
                        <Button size="sm" variant="outline" className="h-9 gap-2 rounded-xl border-orange-200 px-3 text-orange-700 hover:bg-orange-50 dark:border-orange-500/30 dark:text-orange-300 dark:hover:bg-orange-950/40" onClick={() => { void handleDeactivateJob(job); }} disabled={isDeactivating}>
                          <Clock className="h-4 w-4" /> {isDeactivating ? "Deactivating…" : "Deactivate"}
                        </Button>
                      )}
                      {can("jobs", "delete") && (job.status === "draft" || job.status === "paused" || job.status === "closed" || job.status === "expired") && (
                        <Button size="sm" variant="outline" title="Delete" className="h-9 gap-2 rounded-xl border-destructive/20 px-3 text-destructive hover:bg-destructive/5"
                          onClick={() => { void handleDeleteJob(job); }} disabled={isDeleting}>
                          <Trash2 className="h-4 w-4" /> {isDeleting ? "Deleting…" : "Delete"}
                        </Button>
                      )}
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
        onLimitChange={(l) => { setLimit(l); setPage(1); }}
      />

      {posterJob && (
        <JobPosterDialog
          open={!!posterJob}
          onOpenChange={(open) => { if (!open) setPosterJob(null); }}
          job={posterJob}
          locale={locale}
        />
      )}
    </div>
  );
}
