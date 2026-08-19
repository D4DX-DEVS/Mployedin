"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, Edit2, Eye, Clock, CheckCircle, FileText, Trash2, Copy, Users, BriefcaseBusiness, ShieldCheck, BookTemplate, Search, Sparkles, ArrowRight, GitBranch, SlidersHorizontal, PauseCircle, PlayCircle, MoreHorizontal, Image as ImageIcon, Send, Undo2, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { PageHero } from "@/components/shared/PageHero";
import { CountCardGrid } from "@/components/shared/CountCardGrid";
import { DraftExtractionsCard, DraftJobsCard } from "@/components/features/employer/dashboard";
import { usePermissions } from "@/hooks/usePermissions";
import { useTableExport } from "@/hooks/useTableExport";
import { useConfirm } from "@/hooks/useConfirm";
import { useJobs, useUpdateJobStatus, useCloneJob, useDeleteJob, useSaveAsTemplate, useJobTemplates, type Job } from "@/hooks/useJobs";
import { useDebounce } from "@/hooks/useDebounce";
import type { ExportColumn } from "@/lib/export";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-status-selected-bg text-emerald-700 border-status-selected/20 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-500/30",
  draft: "bg-status-shortlisted-bg text-status-shortlisted border-status-shortlisted/20 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-500/30",
  pending_approval: "bg-status-applied-bg text-status-applied border-status-applied/20 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-500/30",
  paused: "bg-status-applied-bg text-status-applied border-border dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-500/30",
  closed: "bg-muted text-muted-foreground",
  expired: "bg-status-rejected-bg text-status-rejected border-status-rejected/20 dark:bg-red-950/40 dark:text-red-300 dark:border-red-500/30",
};

// Map job.status → human label key. Avoids rendering raw snake_case status strings.
const STATUS_LABEL_KEYS: Record<string, string> = {
  active: "statusLabelActive",
  draft: "statusLabelDraft",
  pending_approval: "statusLabelPendingApproval",
  paused: "statusLabelPaused",
  closed: "statusLabelClosed",
  expired: "statusLabelExpired",
};

function getStatusLabelKey(status: string): string {
  return STATUS_LABEL_KEYS[status] ?? "statusLabelDraft";
}

const JOB_SUMMARY_MAX_LENGTH = 180;

type PendingJobAction = "activate" | "deactivate" | "pause" | "delete" | "submit" | "withdraw";

export default function EmployerJobsPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const searchParams = useSearchParams();
  const t = useTranslations("employerJobs");
  const { can } = usePermissions();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();

  const [page, setPageState] = useState(() => Number(searchParams.get("page")) || 1);

  function setPage(next: number) {
    setPageState(next);
    const params = new URLSearchParams(window.location.search);
    if (next > 1) params.set("page", String(next)); else params.delete("page");
    router.replace(`?${params.toString()}`, { scroll: false });
  }
  const [limit, setLimit] = useState(10);
  const [statusFilter, setStatusFilter] = useState("all");
  const [workModeFilter, setWorkModeFilter] = useState("all");
  const [salaryVisibilityFilter, setSalaryVisibilityFilter] = useState("all");
  const [sortByFilter, setSortByFilter] = useState("default");
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [skillsFilter, setSkillsFilter] = useState("");
  const [aiQuery, setAiQuery] = useState("");
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isApplyingAiSearch, setIsApplyingAiSearch] = useState(false);
  const [cloningJobId, setCloningJobId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [jobDraftsCount, setJobDraftsCount] = useState(0);
  const [aiDraftsCount, setAiDraftsCount] = useState(0);
  // Phones show one collapsed row per job; tapping the header expands it. Desktop
  // ignores this entirely (details are always `sm:block`).
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  const [pendingJobAction, setPendingJobAction] = useState<{ jobId: string; action: PendingJobAction } | null>(null);
  const debouncedSearch = useDebounce(search, 300);
  const debouncedLocation = useDebounce(locationFilter, 300);
  const debouncedSkills = useDebounce(skillsFilter, 300);
  const normalizedSkills = debouncedSkills
    .split(",")
    .map((skill) => skill.trim())
    .filter(Boolean);

  // Reset page when filters change (skip the initial mount so a page restored from the URL survives)
  const skipFilterResetRef = useRef(true);
  useEffect(() => {
    if (skipFilterResetRef.current) { skipFilterResetRef.current = false; return; }
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, workModeFilter, salaryVisibilityFilter, debouncedSearch, debouncedLocation, debouncedSkills]);

  // Pre-apply status filter from deep-link query (?status=active|draft|paused|closed|expired)
  // Used by the employer dashboard quick-filter tabs.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const deepStatus = params.get("status");
    const valid = ["active", "draft", "paused", "closed", "expired"];
    if (deepStatus && valid.includes(deepStatus) && deepStatus !== statusFilter) {
      setStatusFilter(deepStatus);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { document.title = t("pageTitle"); }, [t]);

  // ── React Query ────────────────────────────────────────────────
  const { data, isLoading, isError, refetch } = useJobs({
    page,
    limit,
    status: statusFilter,
    workMode: workModeFilter,
    search: debouncedSearch,
    location: debouncedLocation,
    skills: normalizedSkills,
    showSalary: salaryVisibilityFilter === "all" ? undefined : salaryVisibilityFilter === "shown" ? "true" : "false",
    sortBy: sortByFilter,
    myJobs: true,
  });

  const jobs = data?.jobs ?? [];
  const total = data?.pagination?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const hasActiveFilters = statusFilter !== "all"
    || workModeFilter !== "all"
    || salaryVisibilityFilter !== "all"
    || sortByFilter !== "default"
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

  const activeJobs = data?.statusCounts?.active ?? jobs.filter((job) => job.status === "active").length;
  const draftJobs = data?.statusCounts?.draft ?? jobs.filter((job) => job.status === "draft").length;
  const pausedJobs = data?.statusCounts?.paused ?? jobs.filter((job) => job.status === "paused").length;
  const totalOpenings = data?.totalVacancies ?? jobs.reduce((sum, job) => sum + (job.vacancies ?? 0), 0);

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: t("exportTitleCol"), key: "title", formatter: (v) => String(v ?? "") },
    { header: t("exportStatusCol"), key: "status", formatter: (v) => String(v ?? "\u2014") },
    { header: t("exportLocationCol"), key: "location", formatter: (_v, r) => { const j = r as Record<string, any>; if (!j.location) return t("exportNotSet"); if (typeof j.location === "string") return j.location; if (j.location.isRemote) return t("exportRemote"); return [j.location.city, j.location.country].filter(Boolean).join(", ") || t("exportNotSet"); } },
    { header: t("exportSalaryMinCol"), key: "salary", formatter: (_v, r) => String((r as Record<string, any>).salary?.min ?? "") },
    { header: t("exportSalaryMaxCol"), key: "salary", formatter: (_v, r) => String((r as Record<string, any>).salary?.max ?? "") },
    { header: t("exportCurrencyCol"), key: "salary", formatter: (_v, r) => String((r as Record<string, any>).salary?.currency ?? "USD") },
    { header: t("exportVacanciesCol"), key: "vacancies", formatter: (v) => String(v ?? 0) },
    { header: t("exportCreatedCol"), key: "createdAt", formatter: (v) => v ? new Date(String(v)).toLocaleDateString(locale === "ar" ? "ar" : "en-US") : "\u2014" },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: jobs as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "jobs",
    title: t("exportFileTitle"),
  });

  async function handleCloneJob(job: Job) {
    setCloningJobId(job._id);
    const loadingToastId = toast.loading(t("toastCloningJob"));

    try {
      const data = await cloneJob.mutateAsync(job._id);
      const clonedJobId = data?.job?._id;

      if (!clonedJobId) {
        throw new Error(t("toastFailedClone"));
      }

      toast.success(t("toastJobCloned"), { id: loadingToastId });
      router.push(`/${locale}/employer/jobs/${clonedJobId}/edit`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("toastFailedClone"), { id: loadingToastId });
    } finally {
      setCloningJobId(null);
    }
  }

  async function handleSaveAsTemplate(job: Job) {
    setSavingTemplateId(job._id);
    try {
      await saveAsTemplate.mutateAsync(job);
      toast.success(`"${job.title}" ${t("toastSavedAsTemplate")}`);
    } catch {
      toast.error(t("toastFailedTemplate"));
    } finally {
      setSavingTemplateId(null);
    }
  }

  async function handleActivateJob(job: Job) {
    setPendingJobAction({ jobId: job._id, action: "activate" });

    try {
      await updateStatus.mutateAsync({ jobId: job._id, status: "active" });
      toast.success(t("toastJobActivated"));
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("toastFailedActivate"));
    } finally {
      setPendingJobAction((current) => (current?.jobId === job._id ? null : current));
    }
  }

  async function handleDeactivateJob(job: Job) {
    const ok = await confirmDialog(t("confirmDeactivate"));
    if (!ok) return;

    setPendingJobAction({ jobId: job._id, action: "deactivate" });

    try {
      await updateStatus.mutateAsync({ jobId: job._id, status: "closed" });
      toast.success(t("toastJobDeactivated"));
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("toastFailedDeactivate"));
    } finally {
      setPendingJobAction((current) => (current?.jobId === job._id ? null : current));
    }
  }

  async function handlePauseJob(job: Job) {
    const ok = await confirmDialog(t("confirmPause"));
    if (!ok) return;

    setPendingJobAction({ jobId: job._id, action: "pause" });

    try {
      await updateStatus.mutateAsync({ jobId: job._id, status: "paused" });
      toast.success(t("toastJobPaused"));
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("toastFailedPause"));
    } finally {
      setPendingJobAction((current) => (current?.jobId === job._id ? null : current));
    }
  }

  async function handleResumeJob(job: Job) {
    setPendingJobAction({ jobId: job._id, action: "activate" });

    try {
      await updateStatus.mutateAsync({ jobId: job._id, status: "active" });
      toast.success(t("toastJobResumed"));
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("toastFailedResume"));
    } finally {
      setPendingJobAction((current) => (current?.jobId === job._id ? null : current));
    }
  }

  // Submit a draft for admin approval. PATCH reroutes unverified employers'
  // status:"active" → "pending_approval" on the server (see api/jobs/[id]/route.ts).
  async function handleSubmitForApproval(job: Job) {
    const ok = await confirmDialog(t("confirmSubmitForApproval"));
    if (!ok) return;

    setPendingJobAction({ jobId: job._id, action: "submit" });

    try {
      await updateStatus.mutateAsync({ jobId: job._id, status: "active" });
      toast.success(t("toastJobSubmitted"));
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("toastFailedSubmit"));
    } finally {
      setPendingJobAction((current) => (current?.jobId === job._id ? null : current));
    }
  }

  // Withdraw a pending_approval job back to draft so the employer can keep editing.
  async function handleWithdrawJob(job: Job) {
    const ok = await confirmDialog(t("confirmWithdraw"));
    if (!ok) return;

    setPendingJobAction({ jobId: job._id, action: "withdraw" });

    try {
      await updateStatus.mutateAsync({ jobId: job._id, status: "draft" });
      toast.success(t("toastJobWithdrawn"));
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("toastFailedWithdraw"));
    } finally {
      setPendingJobAction((current) => (current?.jobId === job._id ? null : current));
    }
  }

  async function handleDeleteJob(job: Job) {
    const prompt =
      job.status === "draft"
        ? t("confirmDeleteDraft")
        : t("confirmDeleteJob");
    const ok = await confirmDialog(prompt);
    if (!ok) return;

    setPendingJobAction({ jobId: job._id, action: "delete" });

    try {
      await deleteJob.mutateAsync(job._id);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("toastFailedDelete"));
    } finally {
      setPendingJobAction((current) => (current?.jobId === job._id ? null : current));
    }
  }

  function formatLocation(job: Job): string {
    if (!job.location) return t("locationNotSet");
    if (typeof job.location === "string") return job.location;
    if (job.location.isRemote) return t("workModeRemote");
    return [job.location.city, job.location.country].filter(Boolean).join(", ") || t("locationNotSet");
  }

  function formatSalary(job: Job): string {
    if (job.showSalary === false) return t("salaryNotDisclosed");

    const min = job.salary?.min ?? 0;
    const max = job.salary?.max ?? 0;
    const currency = job.salary?.currency ?? "USD";

    if (min <= 0 && max <= 0) return t("salaryNotSet");

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
    setSortByFilter("default");
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
      setSearch(hasSkills ? "" : (filters.search ?? ""));
      setStatusFilter(filters.status ?? "all");
      setWorkModeFilter(filters.workMode ?? "all");
      setLocationFilter(filters.location ?? "");
      setSkillsFilter(hasSkills ? filters.skills.join(", ") : "");
      setSalaryVisibilityFilter(
        filters.showSalary === true ? "shown" : filters.showSalary === false ? "hidden" : "all"
      );
      setSortByFilter(filters.sortBy ?? "default");
      setAiSummary(data.summary ?? null);

      toast.success(data.degraded ? t("toastAiUnavailable") : t("toastAiApplied"));
    } catch {
      setSearch(query);
      setAiSummary(`AI search was unavailable, so keyword results are being shown for "${query}".`);
      toast.error(t("toastAiFallback"));
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
    <div className="page-container">
      {ConfirmDialogNode}
      <PageHero
        /* ponytail: phones put the action inline with the title instead of a
           third full-width row — the hero was ~180px tall for one button. */
        className="[&>div:first-child]:flex-row [&>div:first-child]:items-start [&>div:first-child]:justify-between"
        title={t("heroTitle")}
        description={t("heroSubtitle")}
        eyebrow={t("heroBadge")}
        actions={can("jobs", "create") && (isLoading || jobs.length > 0 || hasActiveFilters) ? (
          <>
            {/* Hidden on phones — the same totals sit in the stat grid right below. */}
            {/* Two rows, no description — the third line pushed the whole hero taller. */}
            <div className="workspace-glass-panel hidden rounded-2xl px-4 py-2 text-left sm:block">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("portfolioLabel")}</p>
              <p className="mt-0.5 text-lg font-semibold leading-6 text-foreground">{total} {t("totalJobsSuffix")}</p>
            </div>
            <Button
              onClick={() => router.push(`/${locale}/employer/jobs/ai-create`)}
              aria-label={t("postAJob")}
              className="h-11 w-11 shrink-0 gap-2 self-start rounded-xl bg-primary p-0 text-sm font-semibold text-primary-foreground hover:bg-primary/90 sm:h-11 sm:w-auto sm:px-4"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">{t("postAJob")}</span>
            </Button>
          </>
        ) : undefined}
      />

      <div className="space-y-3">
        {/* Phones get all four counters on one row: label + number only. Icon and
            description are desktop-only so each tile survives an ~80px column. */}
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4">
          {[
            { label: t("statActiveLabel"), value: activeJobs, description: t("statActiveDescription"), Icon: ShieldCheck, tone: "workspace-tone-emerald" },
            { label: t("statDraftsLabel"), value: draftJobs, description: t("statDraftsDescription"), Icon: BriefcaseBusiness, tone: "workspace-tone-amber" },
            { label: t("statPausedLabel"), value: pausedJobs, description: t("statPausedDescription"), Icon: PauseCircle, tone: "workspace-tone-sky" },
            { label: t("statOpeningsLabel"), value: totalOpenings, description: t("statOpeningsDescription"), Icon: Users, tone: "workspace-tone-sky" },
          ].map(({ label, value, description, Icon, tone }) => (
            <div key={label} className="workspace-glass-panel rounded-xl p-2 sm:rounded-2xl sm:p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[9px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-[11px] sm:tracking-[0.18em]">{label}</p>
                  <p className="mt-0.5 text-lg font-semibold tracking-tight text-foreground sm:mt-1 sm:text-2xl">{value}</p>
                  <p className="mt-0.5 hidden text-xs text-muted-foreground sm:line-clamp-1">{description}</p>
                </div>
                <div className={`${tone} hidden rounded-2xl p-2.5 sm:block`}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Filter jobs — toggle + filters live in one card and expand in place.
            Export sits on the same row instead of a standalone toolbar strip. */}
        <div className="workspace-panel-surface overflow-hidden rounded-2xl">
          <div className="flex items-center gap-1 pe-2">
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
              className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-primary/5"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                {t("filterHeading")}
                {hasActiveFilters && (
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
                )}
              </span>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
            </button>
            {jobs.length > 0 && (
              <TableToolbar
                className="shrink-0"
                onExportCsv={handleExportCsv}
                onExportExcel={handleExportExcel}
                onExportPdf={handleExportPdf}
              />
            )}
          </div>

          {filtersOpen && (
            <div className="border-t border-border/60 p-3 sm:p-5">
              <p className="hidden text-sm text-muted-foreground sm:block">{t("filterDescription")}</p>

              {/* Two controls per row on phones — eight stacked full-width inputs
                  turned the open filter panel into three screens of scrolling. */}
              <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:gap-3 xl:grid-cols-[minmax(0,1fr)_220px_220px]">
                <div className="relative col-span-2 min-w-0 xl:col-span-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder={t("searchJobsPlaceholder")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-10 rounded-xl border-border bg-background/70 pl-9 text-sm shadow-none sm:h-11"
                  />
                </div>
                <SearchableSelect
                  className="h-10 w-full rounded-xl border-border bg-background/70 sm:h-11"
                  options={[
                    { value: "all", label: t("allStatuses") },
                    { value: "active", label: t("statusActive") },
                    { value: "paused", label: t("statusPaused") },
                    { value: "draft", label: t("statusDraft") },
                    { value: "closed", label: t("statusClosed") },
                    { value: "expired", label: t("statusExpired") },
                  ]}
                  value={statusFilter}
                  onValueChange={setStatusFilter}
                  placeholder={t("allStatuses")}
                />
                <SearchableSelect
                  className="h-10 w-full rounded-xl border-border bg-background/70 sm:h-11"
                  options={[
                    { value: "default", label: t("sortDefault") },
                    { value: "applications_desc", label: t("sortMostApplications") },
                    { value: "applications_asc", label: t("sortFewestApplications") },
                    { value: "newest", label: t("sortNewest") },
                    { value: "oldest", label: t("sortOldest") },
                  ]}
                  value={sortByFilter}
                  onValueChange={setSortByFilter}
                  placeholder={t("sortDefault")}
                />
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-3 sm:gap-3 xl:grid-cols-[220px_220px_220px_minmax(0,1fr)_minmax(0,1fr)_150px]">
                <SearchableSelect
                  className="h-10 w-full rounded-xl border-border bg-background/70 sm:h-11"
                  options={[
                    { value: "all", label: t("allWorkModes") },
                    { value: "onsite", label: t("workModeOnsite") },
                    { value: "hybrid", label: t("workModeHybrid") },
                    { value: "remote", label: t("workModeRemote") },
                  ]}
                  value={workModeFilter}
                  onValueChange={setWorkModeFilter}
                  placeholder={t("allWorkModes")}
                />
                <SearchableSelect
                  className="h-10 w-full rounded-xl border-border bg-background/70 sm:h-11"
                  options={[
                    { value: "all", label: t("allSalaryVisibility") },
                    { value: "shown", label: t("salaryShown") },
                    { value: "hidden", label: t("salaryHiddenFilter") },
                  ]}
                  value={salaryVisibilityFilter}
                  onValueChange={setSalaryVisibilityFilter}
                  placeholder={t("allSalaryVisibility")}
                />
                <div className="relative min-w-0">
                  <Input
                    placeholder={t("filterByLocationPlaceholder")}
                    value={locationFilter}
                    onChange={(e) => setLocationFilter(e.target.value)}
                    className="h-11 rounded-xl border-border bg-background/70 text-sm shadow-none"
                  />
                </div>
                <div className="relative min-w-0">
                  <Input
                    placeholder={t("skillsPlaceholder")}
                    value={skillsFilter}
                    onChange={(e) => setSkillsFilter(e.target.value)}
                    className="h-11 rounded-xl border-border bg-background/70 text-sm shadow-none"
                  />
                </div>
                <div className="relative min-w-0 xl:col-span-2">
                  <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-500" />
                  <Input
                    placeholder={t("aiSearchPlaceholder")}
                    value={aiQuery}
                    onChange={(e) => setAiQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleApplyAiSearch();
                      }
                    }}
                    className="h-10 rounded-xl border-border bg-background/70 pl-9 text-sm shadow-none sm:h-11"
                  />
                </div>
              </div>

              <div className="workspace-subtle-surface mt-3 flex flex-col gap-3 rounded-2xl p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{t("needFasterCut")}</p>
                  <p className="text-sm text-muted-foreground">{t("aiFilterDescription")}</p>
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
                    {isApplyingAiSearch ? t("applyingAiSearch") : t("applyAiSearch")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetFilters}
                    disabled={!hasActiveFilters && !aiQuery && !aiSummary}
                    className="h-11 rounded-xl border-border bg-background/70 px-4 text-sm"
                  >
                    {t("clearFilters")}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Resume unfinished work (banners — self-hide when none) ── */}
      {/* Stays mounted so the children can report their counts, but drops out of
          layout when both are empty — otherwise it burns two space-y-6 gaps. */}
      <div className={`gap-3 ${jobDraftsCount === 0 && aiDraftsCount === 0 ? "hidden" : "grid"} ${jobDraftsCount > 0 && aiDraftsCount > 0 ? "sm:grid-cols-2" : "grid-cols-1"}`}>
        <DraftJobsCard locale={locale} variant="banner" onCountChange={setJobDraftsCount} />
        <DraftExtractionsCard locale={locale} variant="banner" onCountChange={setAiDraftsCount} />
      </div>

      {isError ? (
        <div className="workspace-panel-surface rounded-[28px] px-6 py-12 text-center">
          <p className="text-sm font-semibold text-destructive">{t("loadError")}</p>
          <Button onClick={() => refetch()} variant="outline" className="mt-4 h-10 rounded-xl px-4 text-sm">
            {t("retry")}
          </Button>
        </div>
      ) : isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="workspace-panel-surface h-28 animate-pulse rounded-[20px]"
            />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="workspace-panel-surface rounded-[28px] px-6 py-16 text-center">
          <div className="workspace-tone-sky mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[24px]">
            <FileText className="h-7 w-7" />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{hasActiveFilters ? t("emptyFilteredLabel") : t("emptyNoJobsLabel")}</p>
          <h3 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
            {hasActiveFilters ? t("emptyFilteredTitle") : t("emptyNoJobsTitle")}
          </h3>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
            {hasActiveFilters ? t("emptyFilteredHint") : t("emptyNoJobsHint")}
          </p>
          {hasActiveFilters ? (
            <Button
              onClick={resetFilters}
              variant="outline"
              className="mt-6 h-11 rounded-xl border-border bg-background/70 px-4 text-sm"
            >
              {t("clearFilters")}
            </Button>
          ) : (
            <Button
              onClick={() => router.push(`/${locale}/employer/jobs/ai-create`)}
              className="mt-6 h-11 gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              {t("postAJob")}
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2 sm:space-y-4">
          {jobs.map((job) => {
            const posted = new Date(job.createdAt).toLocaleDateString(locale === "ar" ? "ar" : "en-US", { month: "short", day: "numeric", year: "numeric" });
            const expires = job.expiresAt ? new Date(job.expiresAt).toLocaleDateString(locale === "ar" ? "ar" : "en-US", { month: "short", day: "numeric" }) : null;
            const isActivating = pendingJobAction?.jobId === job._id && pendingJobAction.action === "activate";
            const isDeactivating = pendingJobAction?.jobId === job._id && pendingJobAction.action === "deactivate";
            const isPausing = pendingJobAction?.jobId === job._id && pendingJobAction.action === "pause";
            const isDeleting = pendingJobAction?.jobId === job._id && pendingJobAction.action === "delete";
            const isSubmitting = pendingJobAction?.jobId === job._id && pendingJobAction.action === "submit";
            const isWithdrawing = pendingJobAction?.jobId === job._id && pendingJobAction.action === "withdraw";
            const jobSummary = getJobSummary(job);
            const isUnpublished = job.status === "draft" || job.status === "pending_approval";
            const isExpanded = expandedJobId === job._id;
            const collapsible = isExpanded ? "" : "hidden sm:block";

            return (
              <article
                key={job._id}
                className="workspace-panel-surface rounded-[20px] p-2 transition-all hover:-translate-y-0.5 hover:border-border sm:p-3.5"
              >
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_268px] xl:items-start">
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => setExpandedJobId(isExpanded ? null : job._id)}
                      aria-expanded={isExpanded}
                      className="flex w-full items-center gap-2 text-left sm:pointer-events-none"
                    >
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                        <h3 className="min-w-0 truncate text-base font-semibold tracking-tight text-foreground sm:whitespace-normal">{job.title}</h3>
                        <Badge className={`${STATUS_COLORS[job.status] ?? ""} border px-2 py-0.5 text-[11px] font-medium`}>
                          {t(getStatusLabelKey(job.status))}
                        </Badge>
                        {job.clonedFrom ? <Badge variant="outline" className="border-status-applied/20 bg-status-applied-bg px-2 py-0.5 text-[11px] font-medium text-status-applied dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300"><Copy className="mr-1 h-3 w-3" />{t("clonedBadge")}</Badge> : null}
                      </div>
                      <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform sm:hidden ${isExpanded ? "rotate-180" : ""}`} />
                    </button>
                    {/* Always-visible meta: location / category / salary / openings /
                        dates / skills. A collapsed row showing only a title gave no
                        reason to tap. Heavier content stays behind the toggle. */}
                    <div className="mt-1.5 -mx-1 flex flex-nowrap gap-1.5 overflow-x-auto px-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:flex-wrap sm:px-0 sm:overflow-visible">
                      <span className="shrink-0 whitespace-nowrap rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground dark:border-border dark:bg-background/80 dark:text-muted-foreground">{formatLocation(job)}</span>
                      {job.category ? (
                        <span className="shrink-0 whitespace-nowrap rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground dark:border-border dark:bg-background/80 dark:text-muted-foreground">{job.category}</span>
                      ) : null}
                      <span className="shrink-0 whitespace-nowrap rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground dark:border-border dark:bg-background/80 dark:text-muted-foreground">{formatSalary(job)}</span>
                      {job.vacancies != null ? (
                        <span className="shrink-0 whitespace-nowrap rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground dark:border-border dark:bg-background/80 dark:text-muted-foreground">
                          {job.vacancies} {job.vacancies === 1 ? t("openingSingular") : t("openingPlural")}
                        </span>
                      ) : null}
                      <span className="shrink-0 whitespace-nowrap rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground dark:border-border dark:bg-background/80 dark:text-muted-foreground">{t("postedPrefix")} {posted}</span>
                      {expires ? (
                        <span className="shrink-0 whitespace-nowrap rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground dark:border-border dark:bg-background/80 dark:text-muted-foreground">{t("expiresPrefix")} {expires}</span>
                      ) : null}
                    </div>

                    {job.requirements?.skills?.length > 0 && (
                      <div className={`mt-1.5 -mx-1 flex-nowrap gap-1.5 overflow-x-auto px-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:flex sm:flex-wrap sm:px-0 sm:overflow-visible ${isExpanded ? "flex" : "hidden"}`}>
                        {job.requirements.skills.slice(0, 4).map((s) => (
                          <Badge key={s} variant="outline" className="shrink-0 whitespace-nowrap rounded-full border-border bg-secondary/65 px-2.5 py-0.5 text-[11px] font-normal text-muted-foreground dark:border-border dark:bg-background/80 dark:text-muted-foreground">{s}</Badge>
                        ))}
                      </div>
                    )}

                    <div className={collapsible}>
                    {job.status === "draft" ? (
                      <p className="mt-1 text-[11px] font-medium text-status-shortlisted dark:text-amber-300">{t("draftHint")}</p>
                    ) : null}
                    {job.status === "pending_approval" ? (
                      <p className="mt-1 text-[11px] font-medium text-status-applied dark:text-blue-300">{t("inReviewHint")}</p>
                    ) : null}
                    {jobSummary ? (
                      <p className="mt-1.5 line-clamp-1 max-w-3xl text-xs leading-4 text-muted-foreground">{jobSummary}</p>
                    ) : null}

                    <CountCardGrid
                      className="mt-2"
                      items={[
                        { label: t("viewsStat"), value: job.views?.toLocaleString() ?? 0 },
                        { label: t("applicantsStat"), value: getFilledSlots(job) },
                        { label: t("capacityStat"), value: job.maxApplicants ?? t("capacityOpen") },
                      ]}
                    />
                    </div>
                  </div>

                  <div aria-label={`Actions for ${job.title}`} role="group" className={`workspace-subtle-surface flex-col gap-1.5 rounded-[16px] border border-border p-2 xl:self-start ${isExpanded ? "flex" : "hidden sm:flex"}`}>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        className="w-full h-8 gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                        onClick={() => router.push(`/${locale}/employer/applications?jobId=${job._id}`)}
                      >
                        <Users className="h-4 w-4" />
                        {t("applicationsButton")}
                        <ArrowRight className="ml-auto h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" title={t("viewButton")} className="flex-1 basis-[30%] min-w-0 h-8 gap-2 rounded-lg border-border bg-background/80 px-2 text-xs text-foreground"
                        onClick={() => router.push(`/${locale}/employer/jobs/${job._id}`)}>
                        <Eye className="h-4 w-4" /> {t("viewButton")}
                      </Button>
                      {can("jobs", "update") ? (
                        <Button size="sm" variant="outline" title={t("editButton")} className="flex-1 basis-[30%] min-w-0 h-8 gap-2 rounded-lg border-border bg-background/80 px-2 text-xs text-foreground"
                          onClick={() => router.push(`/${locale}/employer/jobs/${job._id}/edit`)}>
                          <Edit2 className="h-4 w-4" /> {t("editButton")}
                        </Button>
                      ) : null}

                      {/* Contextual status action stays visible — it is the primary lifecycle control */}
                      {can("jobs", "update") && job.status === "draft" && (
                        <Button size="sm" variant="outline" className="flex-1 basis-[60%] min-w-0 h-8 gap-1.5 rounded-lg border-status-selected/20 px-3 text-emerald-700 hover:bg-status-selected-bg dark:border-emerald-500/30 dark:text-emerald-300 dark:hover:bg-emerald-950/40" onClick={() => { void handleSubmitForApproval(job); }} disabled={isSubmitting}>
                        <Send className="h-3.5 w-3.5" /> {isSubmitting ? t("submittingForApprovalButton") : t("submitForApprovalButton")}
                        </Button>
                      )}
                      {can("jobs", "update") && job.status === "pending_approval" && (
                        <Button size="sm" variant="outline" className="flex-1 basis-[60%] min-w-0 h-8 gap-1.5 rounded-lg border-status-shortlisted/20 px-3 text-status-shortlisted hover:bg-status-shortlisted-bg dark:border-amber-500/30 dark:text-amber-300 dark:hover:bg-amber-950/40" onClick={() => { void handleWithdrawJob(job); }} disabled={isWithdrawing}>
                          <Undo2 className="h-3.5 w-3.5" /> {isWithdrawing ? t("withdrawingButton") : t("withdrawButton")}
                        </Button>
                      )}
                      {can("jobs", "update") && job.status === "active" && (
                        <Button size="sm" variant="outline" className="flex-1 basis-[30%] min-w-0 h-8 gap-2 rounded-lg border-border px-2 text-xs text-status-applied hover:bg-status-applied-bg dark:border-sky-500/30 dark:text-sky-300 dark:hover:bg-sky-950/40" onClick={() => { void handlePauseJob(job); }} disabled={isPausing}>
                          <PauseCircle className="h-4 w-4" /> {isPausing ? t("pausingButton") : t("pauseButton")}
                        </Button>
                      )}
                      {can("jobs", "update") && job.status === "active" && (
                        <Button size="sm" variant="outline" className="flex-1 basis-[30%] min-w-0 h-8 gap-2 rounded-lg border-status-shortlisted/20 px-2 text-xs text-status-shortlisted hover:bg-status-shortlisted-bg dark:border-orange-500/30 dark:text-orange-300 dark:hover:bg-orange-950/40" onClick={() => { void handleDeactivateJob(job); }} disabled={isDeactivating}>
                          <Clock className="h-4 w-4" /> {isDeactivating ? t("deactivatingButton") : t("deactivateButton")}
                        </Button>
                      )}
                      {can("jobs", "update") && job.status === "paused" && (
                        <Button size="sm" variant="outline" className="flex-1 basis-[30%] min-w-0 h-8 gap-1.5 rounded-lg border-status-selected/20 px-2 text-xs text-emerald-700 hover:bg-status-selected-bg dark:border-emerald-500/30 dark:text-emerald-300 dark:hover:bg-emerald-950/40" onClick={() => { void handleResumeJob(job); }} disabled={isActivating}>
                          <PlayCircle className="h-3.5 w-3.5" /> {isActivating ? t("resumingButton") : t("resumeButton")}
                        </Button>
                      )}
                      {can("jobs", "update") && job.status === "paused" && (
                        <Button size="sm" variant="outline" className="flex-1 basis-[30%] min-w-0 h-8 gap-2 rounded-lg border-status-shortlisted/20 px-2 text-xs text-status-shortlisted hover:bg-status-shortlisted-bg dark:border-orange-500/30 dark:text-orange-300 dark:hover:bg-orange-950/40" onClick={() => { void handleDeactivateJob(job); }} disabled={isDeactivating}>
                          <Clock className="h-4 w-4" /> {isDeactivating ? t("deactivatingButton") : t("deactivateButton")}
                        </Button>
                      )}

                      {/* Secondary actions collapsed into a menu to keep each card compact.
                          Every item is permission-gated — hide the trigger when the menu
                          would open empty (renders as a bare white sliver otherwise). */}
                      {((can("jobs", "update") && !isUnpublished) ||
                        can("jobs", "create") ||
                        (can("jobs", "delete") && ["draft", "pending_approval", "paused", "closed", "expired"].includes(job.status))) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="outline" title={t("moreActionsButton")} className="flex-1 basis-[30%] min-w-0 h-8 gap-2 rounded-lg border-border bg-background/80 px-2 text-xs text-foreground">
                            <MoreHorizontal className="h-4 w-4" /> {t("moreActionsButton")}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          {can("jobs", "update") && !isUnpublished && (
                            <DropdownMenuItem onClick={() => router.push(`/${locale}/employer/jobs/${job._id}?tab=workflow`)}>
                              <GitBranch className="h-4 w-4" /> {t("workflowButton")}
                            </DropdownMenuItem>
                          )}
                          {can("jobs", "update") && !isUnpublished && (
                            <DropdownMenuItem onClick={() => router.push(`/${locale}/employer/jobs/${job._id}?tab=matching-weights`)}>
                              <SlidersHorizontal className="h-4 w-4" /> {t("weightsButton")}
                            </DropdownMenuItem>
                          )}
                          {can("jobs", "create") && (
                            <DropdownMenuItem onClick={() => router.push(`/${locale}/employer/jobs/${job._id}/poster`)}>
                              <ImageIcon className="h-4 w-4" /> {t("posterButton")}
                            </DropdownMenuItem>
                          )}
                          {can("jobs", "create") && (
                            <DropdownMenuItem onClick={() => { void handleCloneJob(job); }} disabled={cloningJobId === job._id}>
                              <Copy className="h-4 w-4" /> {cloningJobId === job._id ? t("cloningButton") : t("cloneButton")}
                            </DropdownMenuItem>
                          )}
                          {can("jobs", "create") && (
                            <DropdownMenuItem
                              onClick={() => { if (!savedTemplateIds.has(job._id)) void handleSaveAsTemplate(job); }}
                              disabled={savingTemplateId === job._id || savedTemplateIds.has(job._id)}
                            >
                              {savedTemplateIds.has(job._id) ? (
                                <><CheckCircle className="h-4 w-4 text-status-selected" /> {t("templateSavedButton")}</>
                              ) : savingTemplateId === job._id ? (
                                <><BookTemplate className="h-4 w-4" /> {t("templateSavingButton")}</>
                              ) : (
                                <><BookTemplate className="h-4 w-4" /> {t("templateButton")}</>
                              )}
                            </DropdownMenuItem>
                          )}
                          {can("jobs", "delete") && (job.status === "draft" || job.status === "pending_approval" || job.status === "paused" || job.status === "closed" || job.status === "expired") && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => { void handleDeleteJob(job); }}
                                disabled={isDeleting}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" /> {isDeleting ? t("deletingButton") : t("deleteButton")}
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {total > 0 && (
        <PaginationControls
          page={page}
          totalPages={totalPages}
          total={total}
          limit={limit}
          onPageChange={setPage}
          onLimitChange={(l) => { setLimit(l); setPage(1); }}
        />
      )}
    </div>
  );
}
