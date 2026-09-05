"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, Edit2, Eye, Clock, CheckCircle, FileText, Trash2, Copy, Users, BriefcaseBusiness, BookTemplate, Search, Sparkles, ArrowRight, GitBranch, SlidersHorizontal, PauseCircle, PlayCircle, MoreHorizontal, Image as ImageIcon, Send, MapPin, CalendarDays } from "lucide-react";
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
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { CopilotLauncher } from "@/components/shared/CopilotLauncher";
import { DraftExtractionsCard } from "@/components/features/employer/dashboard";
import { usePermissions } from "@/hooks/usePermissions";
import { useTableExport } from "@/hooks/useTableExport";
import { useConfirm } from "@/hooks/useConfirm";
import { useJobs, useUpdateJobStatus, useCloneJob, useDeleteJob, useSaveAsTemplate, useJobTemplates, type Job } from "@/hooks/useJobs";
import { useDebounce } from "@/hooks/useDebounce";
import type { ExportColumn } from "@/lib/export";
import { toUserFacingError } from "@/lib/errors/user-facing";
import { formatCount } from "@/lib/ui/intlFormat";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-status-selected-bg text-emerald-700 border-status-selected/20",
  draft: "bg-status-shortlisted-bg text-status-shortlisted border-status-shortlisted/20",
  paused: "bg-status-applied-bg text-status-applied border-border",
  closed: "bg-muted text-muted-foreground",
  expired: "bg-status-rejected-bg text-status-rejected border-status-rejected/20",
};

// Map job.status → human label key. Avoids rendering raw snake_case status strings.
const STATUS_LABEL_KEYS: Record<string, string> = {
  active: "statusLabelActive",
  draft: "statusLabelDraft",
  paused: "statusLabelPaused",
  closed: "statusLabelClosed",
  expired: "statusLabelExpired",
};

function getStatusLabelKey(status: string): string {
  return STATUS_LABEL_KEYS[status] ?? "statusLabelDraft";
}

// Soft status tint for the card's leading icon tile — same palette as the badge.
const STATUS_TONES: Record<string, string> = {
  active: "workspace-tone-emerald",
  draft: "workspace-tone-amber",
  paused: "workspace-tone-sky",
  closed: "workspace-muted-pill",
  expired: "workspace-tone-rose",
};

type PendingJobAction = "activate" | "deactivate" | "pause" | "delete" | "publish";
type ExportJobRecord = Record<string, unknown> & {
  location?: string | { city?: string; country?: string; isRemote?: boolean };
  salary?: { min?: number; max?: number; currency?: string };
};

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
  const [statusFilter, setStatusFilter] = useState(() => {
    const status = searchParams.get("status") ?? "all";
    return ["active", "draft", "paused", "closed", "expired"].includes(status) ? status : "all";
  });
  const [workModeFilter, setWorkModeFilter] = useState("all");
  const [salaryVisibilityFilter, setSalaryVisibilityFilter] = useState("all");
  const [sortByFilter, setSortByFilter] = useState("default");
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [locationFilter, setLocationFilter] = useState("");
  const [skillsFilter, setSkillsFilter] = useState("");
  const [aiQuery, setAiQuery] = useState("");
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isApplyingAiSearch, setIsApplyingAiSearch] = useState(false);
  const [cloningJobId, setCloningJobId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [aiDraftsCount, setAiDraftsCount] = useState(0);

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
  }, [statusFilter, workModeFilter, salaryVisibilityFilter, sortByFilter, debouncedSearch, debouncedLocation, debouncedSkills]);

  // Keep the two primary retrieval tools recoverable across refresh, sharing,
  // and Back navigation. Advanced filter URL coverage can follow this seam.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (statusFilter === "all") params.delete("status"); else params.set("status", statusFilter);
    if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim()); else params.delete("q");
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [debouncedSearch, router, statusFilter]);

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
  const closedJobs = data?.statusCounts?.closed ?? jobs.filter((job) => job.status === "closed").length;
  const totalOpenings = data?.totalVacancies ?? jobs.reduce((sum, job) => sum + (job.vacancies ?? 0), 0);
  const exportColumns: ExportColumn<ExportJobRecord>[] = [
    { header: t("exportTitleCol"), key: "title", formatter: (v) => String(v ?? "") },
    { header: t("exportStatusCol"), key: "status", formatter: (v) => String(v ?? "\u2014") },
    { header: t("exportLocationCol"), key: "location", formatter: (_v, r) => { if (!r.location) return t("exportNotSet"); if (typeof r.location === "string") return r.location; if (r.location.isRemote) return t("exportRemote"); return [r.location.city, r.location.country].filter(Boolean).join(", ") || t("exportNotSet"); } },
    { header: t("exportSalaryMinCol"), key: "salary", formatter: (_v, r) => String(r.salary?.min ?? "") },
    { header: t("exportSalaryMaxCol"), key: "salary", formatter: (_v, r) => String(r.salary?.max ?? "") },
    { header: t("exportCurrencyCol"), key: "salary", formatter: (_v, r) => String(r.salary?.currency ?? "USD") },
    { header: t("exportVacanciesCol"), key: "vacancies", formatter: (v) => String(v ?? 0) },
    { header: t("exportCreatedCol"), key: "createdAt", formatter: (v) => v ? new Date(String(v)).toLocaleDateString(locale === "ar" ? "ar" : "en-US") : "\u2014" },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: jobs as unknown as ExportJobRecord[],
    columns: exportColumns,
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
      toast.error(toUserFacingError(error, { fallback: t("toastFailedClone") }).message, { id: loadingToastId });
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

  async function handleDeactivateJob(job: Job) {
    const ok = await confirmDialog(t("confirmDeactivate"));
    if (!ok) return;

    setPendingJobAction({ jobId: job._id, action: "deactivate" });

    try {
      await updateStatus.mutateAsync({ jobId: job._id, status: "closed" });
      toast.success(t("toastJobDeactivated"));
    } catch (error: unknown) {
      toast.error(toUserFacingError(error, { fallback: t("toastFailedDeactivate") }).message);
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
      toast.error(toUserFacingError(error, { fallback: t("toastFailedPause") }).message);
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
      toast.error(toUserFacingError(error, { fallback: t("toastFailedResume") }).message);
    } finally {
      setPendingJobAction((current) => (current?.jobId === job._id ? null : current));
    }
  }

  // Publish a draft. Jobs go live immediately — there is no approval queue.
  async function handlePublishJob(job: Job) {
    const ok = await confirmDialog(t("confirmPublish"));
    if (!ok) return;

    setPendingJobAction({ jobId: job._id, action: "publish" });

    try {
      await updateStatus.mutateAsync({ jobId: job._id, status: "active" });
      toast.success(t("toastJobPublished"));
    } catch (error: unknown) {
      toast.error(toUserFacingError(error, { fallback: t("toastFailedPublish") }).message);
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
      toast.error(toUserFacingError(error, { fallback: t("toastFailedDelete") }).message);
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
      return `${min.toLocaleString(locale === "ar" ? "ar" : "en-US")} - ${max.toLocaleString(locale === "ar" ? "ar" : "en-US")} ${currency}`;
    }

    return `${Math.max(min, max).toLocaleString(locale === "ar" ? "ar" : "en-US")} ${currency}`;
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
      setAiSummary(t("aiSearchFallbackSummary", { query }));
      toast.error(t("toastAiFallback"));
    } finally {
      setIsApplyingAiSearch(false);
    }
  }

  function getFilledSlots(job: Job): number {
    return job.applicationCount ?? job.applicantIds?.length ?? 0;
  }


  return (
    <div className="page-container">
      {ConfirmDialogNode}
      {/* Pattern A (compact workspace): title, the openings line, the two
          header actions, and a tap-to-filter status strip fed by the API-wide
          status counts (not this page). Export lives with the list toolbar. */}
      <WorkspaceHeader
        title={t("heroTitle")}
        context={
          <>
            <span className="sm:hidden">{t("openingsSummaryShort", { count: totalOpenings })}</span>
            <span className="hidden sm:inline">{t("openingsSummary", { count: totalOpenings })}</span>
          </>
        }
        actions={
          <>
            <CopilotLauncher />
            {can("jobs", "create") ? (
              <Button
                onClick={() => router.push(`/${locale}/employer/jobs/ai-create`)}
                aria-label={t("postAJob")}
                className="gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 sm:px-4"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">{t("postAJob")}</span>
              </Button>
            ) : null}
          </>
        }
        metrics={([
          { key: "active", label: t("statActiveLabel"), value: activeJobs, icon: PlayCircle, tone: "success" },
          { key: "draft", label: t("statDraftsLabel"), value: draftJobs, icon: Edit2, tone: "primary" },
          { key: "paused", label: t("statPausedLabel"), value: pausedJobs, icon: PauseCircle, tone: "warning" },
          { key: "closed", label: t("statusClosed"), value: closedJobs, icon: CheckCircle, tone: "info" },
        ] as const).map((m) => ({
          label: m.label,
          value: formatCount(m.value) ?? "0",
          icon: m.icon,
          tone: m.tone,
          active: statusFilter === m.key,
          // Tap a tile to filter the list by that status; tap again to clear.
          onClick: () => { setStatusFilter(statusFilter === m.key ? "all" : m.key); setPage(1); },
        }))}
      />

      {/* ── List toolbar — search, Filters and Export sit with the list ──
          No select here, so the search shares the phone row with the buttons. */}
      <div className="workspace-toolbar">
        <div className="workspace-toolbar-search basis-0 sm:basis-64">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            aria-label={t("searchJobsPlaceholder")}
            placeholder={t("searchJobsPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 rounded-xl border-border bg-background ps-9 text-sm shadow-none sm:h-10"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setFiltersOpen((v) => !v)}
          aria-expanded={filtersOpen}
          aria-controls="employer-job-filters"
          aria-label={t("filters")}
          className={`h-11 rounded-xl border-border bg-background px-3 text-sm font-semibold sm:h-10 sm:px-4 ${filtersOpen ? "border-primary/30 bg-primary/10 text-primary" : ""}`}
        >
          <SlidersHorizontal className="h-4 w-4 sm:me-2" aria-hidden="true" />
          <span className="hidden sm:inline">{t("filters")}</span>
          {hasActiveFilters && <span className="ms-1.5 inline-flex h-2 w-2 rounded-full bg-primary" aria-hidden="true" />}
        </Button>
        {jobs.length > 0 && (
          <TableToolbar
            className="ms-auto"
            onExportCsv={handleExportCsv}
            onExportExcel={handleExportExcel}
            onExportPdf={handleExportPdf}
          />
        )}
      </div>

      <div>

        {/* Filter panel — toggled from the compact hero control above. */}
        {filtersOpen && (
          <section id="employer-job-filters" className="workspace-panel-surface rounded-2xl panel-body">
            <div>
              {/* Two controls per row on phones — eight stacked full-width inputs
                  turned the open filter panel into three screens of scrolling. */}
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
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
                    className="h-10 rounded-xl border-border bg-background/70 text-sm shadow-none sm:h-11"
                  />
                </div>
                <div className="relative min-w-0">
                  <Input
                    placeholder={t("skillsPlaceholder")}
                    value={skillsFilter}
                    onChange={(e) => setSkillsFilter(e.target.value)}
                    className="h-10 rounded-xl border-border bg-background/70 text-sm shadow-none sm:h-11"
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

              <div className="workspace-subtle-surface card-pad mt-3 flex flex-col gap-3 rounded-2xl sm:flex-row sm:items-center sm:justify-between">
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
                    className="h-10 gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 sm:h-11"
                  >
                    <Sparkles className="h-4 w-4" />
                    {isApplyingAiSearch ? t("applyingAiSearch") : t("applyAiSearch")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetFilters}
                    disabled={!hasActiveFilters && !aiQuery && !aiSummary}
                    className="h-10 rounded-xl border-border bg-background/70 px-4 text-sm sm:h-11"
                  >
                    {t("clearFilters")}
                  </Button>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Job drafts already appear in the status strip and list. Only the
          distinct AI-extraction recovery state is promoted here. */}
      <div className={aiDraftsCount === 0 ? "hidden" : "block"}>
        <DraftExtractionsCard locale={locale} variant="banner" onCountChange={setAiDraftsCount} />
      </div>

      {isError ? (
        <div className="workspace-panel-surface px-6 py-12 text-center">
          <p className="text-sm font-semibold text-destructive">{t("loadError")}</p>
          <Button onClick={() => refetch()} variant="outline" className="mt-4 h-10 rounded-xl px-4 text-sm">
            {t("retry")}
          </Button>
        </div>
      ) : isLoading ? (
        <div className="workspace-panel-surface divide-y divide-border/70 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[78px] animate-pulse bg-secondary/40" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="workspace-panel-surface px-6 py-16 text-center">
          <div className="workspace-tone-sky mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl">
            <FileText className="h-7 w-7" />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{hasActiveFilters ? t("emptyFilteredLabel") : t("emptyNoJobsLabel")}</p>
          <h3 className="heading-subsection mt-3 font-semibold tracking-tight text-foreground">
            {hasActiveFilters ? t("emptyFilteredTitle") : t("emptyNoJobsTitle")}
          </h3>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
            {hasActiveFilters ? t("emptyFilteredHint") : t("emptyNoJobsHint")}
          </p>
          {hasActiveFilters ? (
            <Button
              onClick={resetFilters}
              variant="outline"
              className="mt-6 h-10 rounded-xl border-border bg-background/70 px-4 text-sm sm:h-11"
            >
              {t("clearFilters")}
            </Button>
          ) : (
            <Button
              onClick={() => router.push(`/${locale}/employer/jobs/ai-create`)}
              className="mt-6 h-10 gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 sm:h-11"
            >
              <Plus className="h-4 w-4" />
              {t("postAJob")}
            </Button>
          )}
        </div>
      ) : (
        <section aria-label={t("jobListLabel")} className="grid gap-3 md:grid-cols-2">
          {jobs.map((job) => {
            const posted = new Date(job.createdAt).toLocaleDateString(locale === "ar" ? "ar" : "en-US", { month: "short", day: "numeric", year: "numeric" });
            const isActivating = pendingJobAction?.jobId === job._id && pendingJobAction.action === "activate";
            const isDeactivating = pendingJobAction?.jobId === job._id && pendingJobAction.action === "deactivate";
            const isPausing = pendingJobAction?.jobId === job._id && pendingJobAction.action === "pause";
            const isDeleting = pendingJobAction?.jobId === job._id && pendingJobAction.action === "delete";
            const isPublishing = pendingJobAction?.jobId === job._id && pendingJobAction.action === "publish";
            const isUnpublished = job.status === "draft";
            const jobHref = `/${locale}/employer/jobs/${job._id}`;
            const applicants = getFilledSlots(job);
            const primaryAction = job.status === "draft"
              ? { label: t("continueDraftButton"), href: `${jobHref}/edit`, Icon: Edit2 }
              : job.status === "paused"
                ? { label: isActivating ? t("resumingButton") : t("resumeJobButton"), onClick: () => { void handleResumeJob(job); }, Icon: PlayCircle }
                : applicants > 0
                  ? { label: t("reviewApplicantsButton", { count: applicants }), href: `/${locale}/employer/applications?jobId=${job._id}`, Icon: Users }
                  : { label: t("viewJobButton"), href: jobHref, Icon: Eye };
            const primaryActionAria = t("primaryActionForJob", { action: primaryAction.label, title: job.title });
            const statusLabel = t(getStatusLabelKey(job.status));

            return (
              <article
                key={job._id}
                className="workspace-panel-surface card-pad group flex min-w-0 flex-col transition-colors hover:border-primary/25"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className={`${STATUS_TONES[job.status] ?? "workspace-tone-sky"} flex h-10 w-10 shrink-0 items-center justify-center rounded-xl`} aria-hidden>
                    <BriefcaseBusiness className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <Link
                        href={jobHref}
                        className="tap-target-row min-w-0 text-base font-semibold leading-5 tracking-tight text-foreground underline-offset-2 group-hover:text-primary group-hover:underline"
                      >
                        {job.title}
                      </Link>
                      <Badge className={`${STATUS_COLORS[job.status] ?? ""} shrink-0 border px-1.5 py-0 text-[11px] font-medium`}>
                        {statusLabel}
                      </Badge>
                      {job.clonedFrom ? (
                        <Badge variant="outline" className="inline-flex shrink-0 border-status-applied/20 bg-status-applied-bg px-1.5 py-0 text-[11px] font-medium text-status-applied">
                          <Copy className="me-1 h-2.5 w-2.5" />{t("clonedBadge")}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-2 space-y-1 text-xs leading-4 text-muted-foreground">
                      <p className="flex min-w-0 items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span className="truncate">{[formatLocation(job), job.category].filter(Boolean).join(" · ")}</span>
                      </p>
                      <p className="flex min-w-0 items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span className="truncate">{formatSalary(job)} · {t("postedPrefix")} {posted}</span>
                      </p>
                    </div>
                  </div>
                </div>

                <dl aria-label={t("jobMetricsLabel")} className="mt-4 grid grid-cols-3 divide-x divide-border/70 rounded-xl bg-secondary/50 py-2 rtl:divide-x-reverse">
                  {[
                    { label: t("viewsStat"), value: formatCount(job.views) ?? "0" },
                    { label: t("applicantsStat"), value: formatCount(applicants) },
                    { label: t("statOpeningsLabel"), value: formatCount((job.vacancies ?? 0)) },
                  ].map((metric) => (
                    <div key={metric.label} className="min-w-0 px-2 text-center">
                      <dd className="text-sm font-semibold tabular-nums text-foreground">{metric.value}</dd>
                      <dt className="truncate text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{metric.label}</dt>
                    </div>
                  ))}
                </dl>

                <div className="mt-3 flex items-center gap-2 border-t border-border/70 pt-3">
                  {primaryAction.href ? (
                    <Button asChild className="min-h-11 min-w-0 flex-1 justify-between rounded-xl px-3 text-sm font-semibold">
                      <Link href={primaryAction.href} aria-label={primaryActionAria}>
                        <span className="inline-flex min-w-0 items-center gap-2">
                          <primaryAction.Icon className="h-4 w-4 shrink-0" aria-hidden />
                          <span className="truncate">{primaryAction.label}</span>
                        </span>
                        <ArrowRight className="h-4 w-4 shrink-0 rtl:rotate-180" aria-hidden />
                      </Link>
                    </Button>
                  ) : (
                    <Button
                      onClick={primaryAction.onClick}
                      disabled={isActivating}
                      aria-label={primaryActionAria}
                      className="min-h-11 min-w-0 flex-1 justify-between rounded-xl px-3 text-sm font-semibold"
                    >
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <primaryAction.Icon className="h-4 w-4 shrink-0" aria-hidden />
                        <span className="truncate">{primaryAction.label}</span>
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 rtl:rotate-180" aria-hidden />
                    </Button>
                  )}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        title={t("moreActionsButton")}
                        aria-label={t("moreActionsForJob", { title: job.title, status: statusLabel })}
                        className="h-11 w-11 shrink-0 rounded-xl border border-border p-0 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem onClick={() => router.push(jobHref)}>
                        <Eye className="h-4 w-4" /> {t("viewButton")}
                      </DropdownMenuItem>
                      {can("jobs", "update") && (
                        <DropdownMenuItem onClick={() => router.push(`${jobHref}/edit`)}>
                          <Edit2 className="h-4 w-4" /> {t("editButton")}
                        </DropdownMenuItem>
                      )}
                      {can("jobs", "update") && job.status === "draft" && (
                        <DropdownMenuItem onClick={() => { void handlePublishJob(job); }} disabled={isPublishing}>
                          <Send className="h-4 w-4" /> {isPublishing ? t("publishingButton") : t("publishButton")}
                        </DropdownMenuItem>
                      )}
                      {can("jobs", "update") && job.status === "active" && (
                        <DropdownMenuItem onClick={() => { void handlePauseJob(job); }} disabled={isPausing}>
                          <PauseCircle className="h-4 w-4" /> {isPausing ? t("pausingButton") : t("pauseButton")}
                        </DropdownMenuItem>
                      )}
                      {can("jobs", "update") && job.status === "paused" && (
                        <DropdownMenuItem onClick={() => { void handleResumeJob(job); }} disabled={isActivating}>
                          <PlayCircle className="h-4 w-4" /> {isActivating ? t("resumingButton") : t("resumeButton")}
                        </DropdownMenuItem>
                      )}
                      {can("jobs", "update") && (job.status === "active" || job.status === "paused") && (
                        <DropdownMenuItem onClick={() => { void handleDeactivateJob(job); }} disabled={isDeactivating}>
                          <Clock className="h-4 w-4" /> {isDeactivating ? t("deactivatingButton") : t("deactivateButton")}
                        </DropdownMenuItem>
                      )}
                      {can("jobs", "update") && !isUnpublished && (
                        <DropdownMenuItem onClick={() => router.push(`${jobHref}?tab=workflow`)}>
                          <GitBranch className="h-4 w-4" /> {t("workflowButton")}
                        </DropdownMenuItem>
                      )}
                      {can("jobs", "update") && !isUnpublished && (
                        <DropdownMenuItem onClick={() => router.push(`${jobHref}?tab=matching-weights`)}>
                          <SlidersHorizontal className="h-4 w-4" /> {t("weightsButton")}
                        </DropdownMenuItem>
                      )}
                      {can("jobs", "create") && (
                        <DropdownMenuItem onClick={() => router.push(`${jobHref}/poster`)}>
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
                      {can("jobs", "delete") && ["draft", "paused", "closed", "expired"].includes(job.status) && (
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
                </div>
              </article>
            );
          })}
        </section>
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
