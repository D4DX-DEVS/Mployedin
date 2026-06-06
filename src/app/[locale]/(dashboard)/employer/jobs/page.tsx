"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, Edit2, Eye, Clock, CheckCircle, FileText, Trash2, Copy, Users, BriefcaseBusiness, ShieldCheck, Banknote, BookTemplate, Search, Sparkles, ArrowRight, GitBranch, SlidersHorizontal, PauseCircle, PlayCircle, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { usePermissions } from "@/hooks/usePermissions";
import { useTableExport } from "@/hooks/useTableExport";
import { useConfirm } from "@/hooks/useConfirm";
import { useJobs, useUpdateJobStatus, useCloneJob, useDeleteJob, useSaveAsTemplate, useJobTemplates, type Job } from "@/hooks/useJobs";
import { useDebounce } from "@/hooks/useDebounce";
import { JobPosterDialog } from "@/components/features/employer/jobs/JobPosterDialog";
import type { ExportColumn } from "@/lib/export";

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
  const t = useTranslations("employerJobs");
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

  useEffect(() => { document.title = t("pageTitle"); }, [t]);

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

  const activeJobs = data?.statusCounts?.active ?? jobs.filter((job) => job.status === "active").length;
  const draftJobs = data?.statusCounts?.draft ?? jobs.filter((job) => job.status === "draft").length;
  const pausedJobs = data?.statusCounts?.paused ?? jobs.filter((job) => job.status === "paused").length;
  const hiddenSalaryJobs = jobs.filter((job) => job.showSalary === false).length;
  const totalOpenings = jobs.reduce((sum, job) => sum + (job.vacancies ?? 0), 0);

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
    <div className="page-container employer-legacy-surface space-y-6">
      {ConfirmDialogNode}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              {t("heroBadge")}
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
              {t("heroTitle")}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t("heroSubtitle")}
            </p>
          </div>

          {can("jobs", "create") ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("portfolioLabel")}</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{total} {t("totalJobsSuffix")}</p>
                <p className="text-xs text-muted-foreground">{t("portfolioDescription")}</p>
              </div>
              <Button
                onClick={() => router.push(`/${locale}/employer/jobs/new`)}
                className="h-11 gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700"
              >
                <Plus className="h-4 w-4" />
                {t("postAJob")}
              </Button>
            </div>
          ) : null}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("statActiveLabel")}</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{activeJobs}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("statActiveDescription")}</p>
              </div>
              <div className="workspace-tone-emerald rounded-2xl p-2.5">
                <ShieldCheck className="h-5 w-5" />
              </div>
            </div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("statDraftsLabel")}</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{draftJobs}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("statDraftsDescription")}</p>
              </div>
              <div className="workspace-tone-amber rounded-2xl p-2.5">
              <BriefcaseBusiness className="h-5 w-5" />
              </div>
            </div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("statSalaryHiddenLabel")}</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{hiddenSalaryJobs}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("statSalaryHiddenDescription")}</p>
              </div>
              <div className="workspace-muted-pill rounded-2xl p-2.5">
              <Banknote className="h-5 w-5" />
              </div>
            </div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("statOpeningsLabel")}</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{totalOpenings}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("statOpeningsDescription")}</p>
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
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("browseRolesLabel")}</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{t("filterHeading")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("filterDescription")}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px_220px]">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("searchJobsPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 rounded-xl border-border bg-background/70 pl-9 text-sm shadow-none"
            />
          </div>
          <SearchableSelect
            className="h-11 w-full rounded-xl border-border bg-background/70"
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
        </div>

        <div className="mt-3 grid gap-3 xl:grid-cols-[220px_220px_220px_minmax(0,1fr)_minmax(0,1fr)_150px]">
          <SearchableSelect
            className="h-11 w-full rounded-xl border-border bg-background/70"
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
            className="h-11 w-full rounded-xl border-border bg-background/70"
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
              className="h-11 rounded-xl border-border bg-background/70 pl-9 text-sm shadow-none"
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
              onClick={() => router.push(`/${locale}/employer/jobs/new`)}
              className="mt-6 h-11 gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700"
            >
              <Plus className="h-4 w-4" />
              {t("postAJob")}
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <TableToolbar
            onExportCsv={handleExportCsv}
            onExportExcel={handleExportExcel}
            onExportPdf={handleExportPdf}
          />
          {jobs.map((job) => {
            const posted = new Date(job.createdAt).toLocaleDateString(locale === "ar" ? "ar" : "en-US", { month: "short", day: "numeric", year: "numeric" });
            const expires = job.expiresAt ? new Date(job.expiresAt).toLocaleDateString(locale === "ar" ? "ar" : "en-US", { month: "short", day: "numeric" }) : null;
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
                          {job.vacancies} {job.vacancies === 1 ? t("openingSingular") : t("openingPlural")}
                        </span>
                      ) : null}
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-border dark:bg-background/80 dark:text-slate-300">{t("postedPrefix")} {posted}</span>
                      {expires ? (
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-border dark:bg-background/80 dark:text-slate-300">{t("expiresPrefix")} {expires}</span>
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
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("viewsStat")}</p>
                        <p className="mt-0.5 text-sm font-semibold text-foreground sm:text-base">{job.views?.toLocaleString() ?? 0}</p>
                      </div>
                      <div className="workspace-subtle-surface rounded-xl border border-border px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("applicantsStat")}</p>
                        <p className="mt-0.5 text-sm font-semibold text-foreground sm:text-base">{getFilledSlots(job)}</p>
                      </div>
                      <div className="workspace-subtle-surface rounded-xl border border-border px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("capacityStat")}</p>
                        <p className="mt-0.5 text-sm font-semibold text-foreground sm:text-base">{job.maxApplicants ?? t("capacityOpen")}</p>
                      </div>
                    </div>
                  </div>

                  <div aria-label={`Actions for ${job.title}`} role="group" className="workspace-subtle-surface flex flex-col gap-2 rounded-[20px] border border-border p-2.5 xl:self-start">
                    <div className="workspace-muted-pill flex items-center justify-between gap-3 rounded-2xl border border-border px-3 py-2">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("nextActionsLabel")}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{t("nextActionsDescription")}</p>
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
                        {t("applicationsButton")}
                        <ArrowRight className="ml-auto h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" title={t("viewButton")} className="h-9 gap-2 rounded-xl border-border bg-background/80 px-3 text-sm text-foreground"
                        onClick={() => router.push(`/${locale}/employer/jobs/${job._id}`)}>
                        <Eye className="h-4 w-4" /> {t("viewButton")}
                      </Button>
                      {can("jobs", "update") && (
                        <Button size="sm" variant="outline" title={t("editButton")} className="h-9 gap-2 rounded-xl border-border bg-background/80 px-3 text-sm text-foreground"
                          onClick={() => router.push(`/${locale}/employer/jobs/${job._id}/edit`)}>
                          <Edit2 className="h-4 w-4" /> {t("editButton")}
                        </Button>
                      )}
                      {can("jobs", "update") && (
                        <Button size="sm" variant="outline" title={t("workflowButton")} className="h-9 gap-2 rounded-xl border-border bg-background/80 px-3 text-sm text-foreground"
                          onClick={() => router.push(`/${locale}/employer/jobs/${job._id}?tab=workflow`)}>
                          <GitBranch className="h-4 w-4" /> {t("workflowButton")}
                        </Button>
                      )}
                      {can("jobs", "update") && (
                        <Button size="sm" variant="outline" title={t("weightsButton")} className="h-9 gap-2 rounded-xl border-border bg-background/80 px-3 text-sm text-foreground"
                          onClick={() => router.push(`/${locale}/employer/jobs/${job._id}?tab=matching-weights`)}>
                          <SlidersHorizontal className="h-4 w-4" /> {t("weightsButton")}
                        </Button>
                      )}
                      {can("jobs", "create") && (
                        <Button size="sm" variant="outline" title={t("posterButton")} className="h-9 gap-2 rounded-xl border-border bg-background/80 px-3 text-sm text-foreground"
                          onClick={() => setPosterJob(job)}>
                          <ImageIcon className="h-4 w-4" /> {t("posterButton")}
                        </Button>
                      )}
                      {can("jobs", "create") && (
                        <Button size="sm" variant="outline" title={t("cloneButton")} className="h-9 gap-2 rounded-xl border-border bg-background/80 px-3 text-sm text-foreground"
                          onClick={() => { void handleCloneJob(job); }}
                          disabled={cloningJobId === job._id}>
                          <Copy className="h-4 w-4" /> {cloningJobId === job._id ? t("cloningButton") : t("cloneButton")}
                        </Button>
                      )}
                      {can("jobs", "create") && (
                        <Button
                          size="sm"
                          variant="outline"
                          title={savedTemplateIds.has(job._id) ? t("templateSavedButton") : t("templateButton")}
                          className={`h-9 gap-2 rounded-xl border-border bg-background/80 px-3 text-sm text-foreground ${
                            savedTemplateIds.has(job._id)
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/40 cursor-default"
                              : ""
                          }`}
                          onClick={() => { if (!savedTemplateIds.has(job._id)) void handleSaveAsTemplate(job); }}
                          disabled={savingTemplateId === job._id || savedTemplateIds.has(job._id)}>
                          {savedTemplateIds.has(job._id) ? (
                            <><CheckCircle className="h-4 w-4" /> {t("templateSavedButton")}</>
                          ) : savingTemplateId === job._id ? (
                            <><BookTemplate className="h-4 w-4" /> {t("templateSavingButton")}</>
                          ) : (
                            <><BookTemplate className="h-4 w-4" /> {t("templateButton")}</>
                          )}
                        </Button>
                      )}
                      {can("jobs", "update") && job.status === "draft" && (
                        <Button size="sm" variant="outline" className="h-9 gap-1.5 rounded-xl border-emerald-200 px-3 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-300 dark:hover:bg-emerald-950/40" onClick={() => { void handleActivateJob(job); }} disabled={isActivating}>
                        <CheckCircle className="h-3.5 w-3.5" /> {isActivating ? t("activatingButton") : t("activateButton")}
                        </Button>
                      )}
                      {can("jobs", "update") && job.status === "active" && (
                        <Button size="sm" variant="outline" className="h-9 gap-2 rounded-xl border-sky-200 px-3 text-sky-700 hover:bg-sky-50 dark:border-sky-500/30 dark:text-sky-300 dark:hover:bg-sky-950/40" onClick={() => { void handlePauseJob(job); }} disabled={isPausing}>
                          <PauseCircle className="h-4 w-4" /> {isPausing ? t("pausingButton") : t("pauseButton")}
                        </Button>
                      )}
                      {can("jobs", "update") && job.status === "active" && (
                        <Button size="sm" variant="outline" className="h-9 gap-2 rounded-xl border-orange-200 px-3 text-orange-700 hover:bg-orange-50 dark:border-orange-500/30 dark:text-orange-300 dark:hover:bg-orange-950/40" onClick={() => { void handleDeactivateJob(job); }} disabled={isDeactivating}>
                          <Clock className="h-4 w-4" /> {isDeactivating ? t("deactivatingButton") : t("deactivateButton")}
                        </Button>
                      )}
                      {can("jobs", "update") && job.status === "paused" && (
                        <Button size="sm" variant="outline" className="h-9 gap-1.5 rounded-xl border-emerald-200 px-3 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-300 dark:hover:bg-emerald-950/40" onClick={() => { void handleResumeJob(job); }} disabled={isActivating}>
                          <PlayCircle className="h-3.5 w-3.5" /> {isActivating ? t("resumingButton") : t("resumeButton")}
                        </Button>
                      )}
                      {can("jobs", "update") && job.status === "paused" && (
                        <Button size="sm" variant="outline" className="h-9 gap-2 rounded-xl border-orange-200 px-3 text-orange-700 hover:bg-orange-50 dark:border-orange-500/30 dark:text-orange-300 dark:hover:bg-orange-950/40" onClick={() => { void handleDeactivateJob(job); }} disabled={isDeactivating}>
                          <Clock className="h-4 w-4" /> {isDeactivating ? t("deactivatingButton") : t("deactivateButton")}
                        </Button>
                      )}
                      {can("jobs", "delete") && (job.status === "draft" || job.status === "paused" || job.status === "closed" || job.status === "expired") && (
                        <Button size="sm" variant="outline" title={t("deleteButton")} className="h-9 gap-2 rounded-xl border-destructive/20 px-3 text-destructive hover:bg-destructive/5"
                          onClick={() => { void handleDeleteJob(job); }} disabled={isDeleting}>
                          <Trash2 className="h-4 w-4" /> {isDeleting ? t("deletingButton") : t("deleteButton")}
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
