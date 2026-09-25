"use client";

import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import { ReferralSourceChip } from "@/components/shared/ReferralSourceChip";
import type { ReferralSummary } from "@/lib/referrals/summary";
import { useLocale, useTranslations } from "next-intl";
import { formErrorFromResponse } from "@/lib/errors/form-error";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";
import { TableBodySkeleton } from "@/components/ui/loading";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePermissions } from "@/hooks/usePermissions";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { usePagination } from "@/hooks/usePagination";
import {
  Pencil, Trash2, Ban, ChevronDown, ChevronUp, Briefcase,
  GraduationCap, Globe, Award, Inbox, Download, Filter,
  FileDown, Loader2, Eye, RotateCcw, MoreHorizontal, X,
} from "lucide-react";
import { useConfirm } from "@/hooks/useConfirm";
import { ResumeViewerModal } from "@/components/shared/ResumeViewerModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useTableExport } from "@/hooks/useTableExport";
import type { ExportColumn } from "@/lib/export";
import { toast } from "sonner";
import { formatDate } from "@/lib/ui/intlFormat";
import { CandidateDataNotice } from "@/components/shared/CandidateDataNotice";
import {
  JobSeekersFilterPanel, EMPTY_JOB_SEEKER_FILTERS, countActiveJobSeekerFilters,
  buildJobSeekerFilterChips, FIELDLESS_FILTER_KEYS, type JobSeekerFilterChip, type JobSeekerFilters,
} from "./_components/JobSeekersFilterPanel";

interface JobSeeker {
  _id: string;
  fullName: string;
  email?: string;
  nationality?: string;
  currentLocation?: string;
  status?: string;
  userId?: { name?: string; email?: string; isActive?: boolean };
  headline?: string;
  summary?: string;
  skills?: string[];
  education?: { degree?: string; institution?: string; field?: string; startYear?: string; passingYear?: string }[];
  experience?: { jobTitle?: string; company?: string; location?: string; isCurrent?: boolean; startDate?: string; endDate?: string; description?: string }[];
  languages?: { language?: string; proficiency?: string }[];
  certifications?: string[];
  profileCompleteness?: number;
  phone?: string;
  totalExperienceYears?: number;
  preferredJobType?: string;
  availabilityStatus?: string;
  preferredLocations?: string[];
  cv?: { originalUrl?: string };
  referralSummary?: ReferralSummary;
  createdAt: string;
}

interface AiFilters {
  search?: string;
  referred?: string;
  skills?: string[];
  location?: string;
  availability?: string;
  jobType?: string;
  minProfile?: number;
  maxProfile?: number;
  hasCV?: boolean;
  sort?: string;
  experienceYears?: number;
  education?: string;
  nationality?: string;
  summary?: string;
}

export default function AdminJobSeekersPage() {
  const tr = useTranslations("adminJobSeekers");
  const tf = useTranslations("formErrors");
  const locale = useLocale();
  const { can } = usePermissions();

  const availabilityLabels: Record<string, string> = {
    immediately: tr("availabilityImmediately"),
    within_month: tr("availabilityWithinMonth"),
    within_3_months: tr("availabilityWithin3Months"),
    not_available: tr("availabilityNotAvailable"),
  };

  const editFields: CrudField[] = [
    { name: "name", label: tr("editFieldName"), type: "text", required: true },
    { name: "email", label: tr("editFieldEmail"), type: "email" },
    { name: "nationality", label: tr("editFieldNationality"), type: "text" },
    { name: "currentLocation", label: tr("editFieldLocation"), type: "text" },
    { name: "summary", label: tr("editFieldSummary"), type: "textarea" },
  ];
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();

  // ── Data state ──────────────────────────────────────────
  const [jobSeekers, setJobSeekers] = useState<JobSeeker[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<JobSeeker | null>(null);
  const [viewCv, setViewCv] = useState<{ id: string; name: string } | null>(null);

  // ── Filter state ────────────────────────────────────────
  /* In the URL so a ⌘K hit, an application row or a notification can open this
     list already narrowed to one candidate. */
  const [search, setSearch] = useUrlFilter("search", "", { debounceMs: 400 });
  const [filters, setFilters] = useState<JobSeekerFilters>(EMPTY_JOB_SEEKER_FILTERS);
  // Open on arrival when a deep link already narrowed the list, so the search
  // doing the narrowing is visible.
  const [showFilters, setShowFilters] = useState(() => Boolean(search));

  const updateFilters = (patch: Partial<JobSeekerFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setClosestTo(null);
    resetPage();
  };
  const changeSearch = (value: string) => {
    setSearch(value);
    setClosestTo(null);
    resetPage();
  };

  // ── AI search state ─────────────────────────────────────
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  // The brief behind the last AI search, kept for "Show closest matches".
  const [aiBrief, setAiBrief] = useState<string | null>(null);
  // Set while the list shows similarity-ranked matches for this brief instead
  // of filter results. Any filter or search edit drops back to filter results.
  const [closestTo, setClosestTo] = useState<string | null>(null);

  // ── CV download state ───────────────────────────────────
  const [cvDownloading, setCvDownloading] = useState(false);

  // ── Export columns (comprehensive) ──────────────────────
  const exportColumns: ExportColumn<JobSeeker>[] = useMemo(() => [
    { header: tr("tableHeaderName"), key: "fullName", formatter: (v, r) => String(v || (r as unknown as JobSeeker).userId?.name || "—") },
    { header: tr("tableHeaderEmail"), key: "email", formatter: (v, r) => String(v ?? (r as unknown as JobSeeker).userId?.email ?? "—") },
    { header: tr("exportColumnHeaderPhone"), key: "phone", formatter: (v) => String(v ?? "—") },
    { header: tr("exportColumnHeaderHeadline"), key: "headline", formatter: (v) => String(v ?? "—") },
    { header: tr("tableHeaderNationality"), key: "nationality", formatter: (v) => String(v ?? "—") },
    { header: tr("tableHeaderLocation"), key: "currentLocation", formatter: (v) => String(v ?? "—") },
    { header: tr("tableHeaderSkills"), key: "skills", formatter: (v) => Array.isArray(v) ? v.join(", ") : "—" },
    { header: tr("tableHeaderExp"), key: "totalExperienceYears", formatter: (v) => v != null ? String(v) : "—" },
    { header: tr("exportHeaderCurrentRole"), key: "experience", formatter: (v) => {
      const exp = v as JobSeeker["experience"];
      const current = exp?.find((e) => e.isCurrent);
      return current ? `${current.jobTitle} at ${current.company}` : exp?.[0]?.jobTitle || "—";
    }},
    { header: tr("exportColumnHeaderEducation"), key: "education", formatter: (v) => {
      const edu = v as JobSeeker["education"];
      return edu?.[0] ? `${edu[0].degree}${edu[0].field ? ` - ${edu[0].field}` : ""}${edu[0].institution ? ` (${edu[0].institution})` : ""}` : "—";
    }},
    { header: tr("exportColumnHeaderLanguages"), key: "languages", formatter: (v) => {
      const langs = v as JobSeeker["languages"];
      return langs?.length ? langs.map((l) => `${l.language} (${l.proficiency})`).join(", ") : "—";
    }},
    { header: tr("exportColumnHeaderCertifications"), key: "certifications", formatter: (v) => Array.isArray(v) && v.length ? v.join(", ") : "—" },
    { header: tr("tableHeaderAvailability"), key: "availabilityStatus", formatter: (v) => String(v ?? "—").replace(/_/g, " ") },
    { header: tr("exportHeaderJobTypePreference"), key: "preferredJobType", formatter: (v) => String(v ?? "—") },
    { header: tr("exportHeaderPreferredLocations"), key: "preferredLocations", formatter: (v) => Array.isArray(v) ? v.join(", ") : "—" },
    { header: tr("tableHeaderProfilePercent"), key: "profileCompleteness", formatter: (v) => v != null ? `${v}%` : "—" },
    { header: tr("exportColumnHeaderHasCv"), key: "cv", formatter: (v) => (v as JobSeeker["cv"])?.originalUrl ? tr("exportYes") : tr("exportNo") },
    { header: tr("tableHeaderStatus"), key: "status", formatter: (v) => String(v ?? "active") },
    { header: tr("tableHeaderJoined"), key: "createdAt", formatter: (v) => v ? formatDate(new Date(String(v))) : "—" },
    { header: tr("exportHeaderReferredBy"), key: "referralSummary", formatter: (v) => {
      const sum = v as ReferralSummary | undefined;
      if (!sum) return "—";
      const role = sum.role === "super_agent" ? tr("referredByRoleSuperAgent") : tr("referredByRoleAgent");
      return sum.name ? `${role}: ${sum.name}` : role;
    }},
  ], [tr]);

  // PDF fits ~10 columns in landscape A4; the full 17-column set is unreadable
  const pdfColumns = useMemo(() => {
    const keepKeys = ["fullName", "email", "phone", "nationality", "currentLocation", "totalExperienceYears", "availabilityStatus", "profileCompleteness", "cv", "createdAt", "referralSummary"];
    return exportColumns.filter((c) => keepKeys.includes(c.key));
  }, [exportColumns]);

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: jobSeekers as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    pdfColumns: pdfColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "job-seekers-search-results",
    title: tr("exportTitle"),
  });

  // ── Fetch job seekers ───────────────────────────────────
  const fetchJobSeekers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set("search", search);
    if (filters.skills) params.set("skills", filters.skills);
    if (filters.location) params.set("location", filters.location);
    if (filters.availability) params.set("availability", filters.availability);
    if (filters.jobType) params.set("jobType", filters.jobType);
    if (filters.sort && filters.sort !== "newest") params.set("sort", filters.sort);
    if (filters.hasCV) params.set("hasCV", "1");
    if (filters.referred) params.set("referred", filters.referred);
    if (filters.education) params.set("education", filters.education);
    if (filters.nationality) params.set("nationality", filters.nationality);
    if (filters.experienceYears > 0) params.set("experienceYears", String(filters.experienceYears));

    try {
      const res = closestTo
        ? await fetch("/api/job-seekers/vector-search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: closestTo, page, limit }),
          })
        : await fetch(`/api/job-seekers?${params}`);
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      const data = await res.json();
      setJobSeekers(data.items ?? data.jobSeekers ?? []);
      updateTotal(data.total ?? data.totalCount ?? data.pagination?.total ?? ((data.totalPages ?? 1) * limit));
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [search, filters, closestTo, page, limit]);

  useEffect(() => {
    const timeout = setTimeout(fetchJobSeekers, 300);
    return () => clearTimeout(timeout);
  }, [fetchJobSeekers]);

  // ── AI Search handler ───────────────────────────────────
  // Reads the search box as a plain-language brief ("HR managers in Dubai")
  // and turns it into structured filters.
  const handleAiSearch = async () => {
    const q = search.trim();
    if (!q) return;
    setAiLoading(true);
    setAiSummary(null);

    try {
      // The brief becomes filters and nothing else, so the list always shows
      // exactly what the filters match. Similarity ranking is a separate,
      // explicit step ("Show closest matches") when the filters find nobody:
      // loading both at once let the filter refetch wipe the ranked list
      // while the summary still claimed its matches.
      const aiRes = await fetch("/api/ai/admin-jobseeker-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      if (!aiRes.ok) throw new Error("AI search failed");
      const aiData = await aiRes.json();
      const extracted: AiFilters = aiData.filters ?? {};

      // A brief describes the whole search, so it replaces earlier filters.
      const next: JobSeekerFilters = { ...EMPTY_JOB_SEEKER_FILTERS };
      if (extracted.skills?.length) next.skills = extracted.skills.join(",");
      if (extracted.location) next.location = extracted.location;
      if (extracted.availability) next.availability = extracted.availability;
      if (extracted.referred) next.referred = extracted.referred;
      if (extracted.jobType) next.jobType = extracted.jobType;
      if (extracted.sort) next.sort = extracted.sort;
      if (extracted.hasCV) next.hasCV = true;
      if (extracted.education) next.education = extracted.education;
      if (extracted.nationality) next.nationality = extracted.nationality;
      if (extracted.experienceYears && extracted.experienceYears > 0) next.experienceYears = extracted.experienceYears;
      setFilters(next);
      setSearch(extracted.search ?? "");
      setClosestTo(null);
      setAiBrief(q);
      setAiSummary(aiData.summary ?? `AI search: "${q}"`);
      resetPage();
      toast.success(aiData.degraded ? tr("aiUnavailableKeywordSearch") : tr("aiFiltersApplied"));
    } catch {
      setSearch(q);
      resetPage();
      setAiSummary(tr("aiSearchUnavailable"));
      toast.error(tr("aiSearchFailed"));
    } finally {
      setAiLoading(false);
    }
  };

  const showClosestMatches = () => {
    if (!aiBrief) return;
    setSearch("");
    setFilters(EMPTY_JOB_SEEKER_FILTERS);
    setClosestTo(aiBrief);
    setAiSummary(tr("closestMatchesSummary", { query: aiBrief }));
    resetPage();
  };

  const clearAllFilters = () => {
    setAiSummary(null);
    setAiBrief(null);
    setClosestTo(null);
    setSearch("");
    setFilters(EMPTY_JOB_SEEKER_FILTERS);
    resetPage();
  };

  // ── Bulk CV Download (single ZIP: CVs + details sheet) ──
  const handleBulkCvDownload = async () => {
    const ok = await confirmDialog({
      message: tr("bulkCvDownloadConfirmMessage"),
      confirmLabel: tr("downloadCvsButton"),
    });
    if (!ok) return;
    setCvDownloading(true);
    try {
      const res = await fetch("/api/job-seekers/bulk-cv-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          search: search || undefined,
          skills: filters.skills ? filters.skills.split(",").map((s) => s.trim()) : undefined,
          location: filters.location || undefined,
          availability: filters.availability || undefined,
          hasCV: "1",
          jobType: filters.jobType || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to fetch CVs");
      const data = await res.json();
      const cvs = data.cvs as {
        id: string; name: string; headline?: string; email?: string;
        nationality?: string; location?: string; experienceYears?: number;
      }[];

      if (cvs.length === 0) {
        toast.error(tr("noCvsFound"));
        return;
      }

      const [{ default: JSZip }, { excelBlobFromRows }] = await Promise.all([
        import("jszip"),
        import("@/lib/export"),
      ]);
      const zip = new JSZip();
      const extFromType = (ct: string | null): string =>
        ct?.includes("pdf") ? "pdf"
        : ct?.includes("wordprocessingml") ? "docx"
        : ct?.includes("msword") ? "doc"
        : ct?.includes("png") ? "png"
        : ct?.includes("jpeg") ? "jpg"
        : "pdf";
      const rows: string[][] = [[tr("bulkCvExcelSheetHeaderName"), tr("bulkCvExcelSheetHeaderEmail"), tr("bulkCvExcelSheetHeaderNationality"), tr("bulkCvExcelSheetHeaderLocation"), tr("bulkCvExcelSheetHeaderExperience"), tr("bulkCvExcelSheetHeaderHeadline"), tr("bulkCvExcelSheetHeaderCvFile")]];
      let added = 0;
      for (const cv of cvs.slice(0, 50)) {
        try {
          // Stream through our authenticated endpoint — raw storage URLs are private-ACL
          const fileRes = await fetch(`/api/employers/candidates/${cv.id}/cv`);
          if (!fileRes.ok) continue;
          const ext = extFromType(fileRes.headers.get("content-type"));
          const safe = cv.name.replace(/[^a-zA-Z0-9 _-]/g, "").trim() || cv.id;
          const fileName = `CVs/${safe}_${cv.id.slice(-6)}.${ext}`;
          zip.file(fileName, await fileRes.arrayBuffer());
          rows.push([
            cv.name, cv.email ?? "", cv.nationality ?? "", cv.location ?? "",
            cv.experienceYears != null ? String(cv.experienceYears) : "", cv.headline ?? "", fileName,
          ]);
          added++;
        } catch {
          // Skip individual failures
        }
      }
      if (added === 0) {
        toast.error(tr("cvsDownloadFailed"));
        return;
      }
      zip.file("candidates.xls", excelBlobFromRows(rows, "Candidates"));
      const blob = await zip.generateAsync({ type: "blob" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "job-seeker-cvs.zip";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      toast.success(tr("cvsDownloadedSuccess", { count: added }));
    } catch {
      toast.error(tr("cvsDownloadFailed"));
    } finally {
      setCvDownloading(false);
    }
  };

  // ── Handlers ────────────────────────────────────────────
  const handleEdit = async (values: Record<string, string>) => {
    const res = await fetch(`/api/job-seekers/${editItem!._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!res.ok) throw await formErrorFromResponse(res, { t: tf, locale, fieldLabels: editFields });
    setEditItem(null);
    fetchJobSeekers();
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({ message: tr("confirmDeactivateMessage"), confirmLabel: tr("confirmDeactivateButton") });
    if (!ok) return;
    const res = await fetch(`/api/job-seekers/${id}`, { method: "DELETE" });
    if (res.ok) toast.success(tr("toastAccountDeactivated"));
    else { const e = await res.json().catch(() => ({})); toast.error(e.error ?? tr("toastFailedDeactivate")); }
    fetchJobSeekers();
  };

  const handleReactivate = async (id: string) => {
    const res = await fetch(`/api/job-seekers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: true }),
    });
    if (res.ok) toast.success(tr("toastAccountReactivated"));
    else { const e = await res.json().catch(() => ({})); toast.error(e.error ?? tr("toastFailedReactivate")); }
    fetchJobSeekers();
  };

  const handlePermanentDelete = async (id: string) => {
    const ok = await confirmDialog({ title: tr("confirmDeleteTitle"), message: tr("confirmDeleteMessage"), confirmLabel: tr("confirmDeleteButton") });
    if (!ok) return;
    const res = await fetch(`/api/job-seekers/${id}?permanent=true`, { method: "DELETE" });
    if (res.ok) toast.success(tr("toastJobSeekerDeletedPermanently"));
    else { const e = await res.json().catch(() => ({})); toast.error(e.error ?? tr("toastFailedDelete")); }
    fetchJobSeekers();
  };

  // ── Active filter count ─────────────────────────────────
  const activeFilterCount = countActiveJobSeekerFilters(search, filters);
  const allFilterChips = buildJobSeekerFilterChips(tr, search, filters);
  // Open panel: its fields already show most filters, so only the ones without
  // a field (set by AI search) need a chip.
  const filterChips = showFilters
    ? allFilterChips.filter((chip) => FIELDLESS_FILTER_KEYS.includes(chip.key))
    : allFilterChips;
  const removeFilterChip = (chip: JobSeekerFilterChip) => {
    if (chip.clear === "search") {
      changeSearch("");
    } else {
      updateFilters(chip.clear);
    }
  };
  const canUpdate = can("job_seekers", "update");
  const canDelete = can("job_seekers", "delete");
  const columnCount = 8;

  return (
    <div className="page-container">
      {ConfirmDialogNode}

      <DashboardPageHeader
        compact
        compactOnMobile
        title={tr("heroTitle")}
        description={tr("heroDescription")}
        footer={(
          <>
            <button
              type="button"
              onClick={() => setShowFilters((open) => !open)}
              aria-expanded={showFilters}
              className="flex min-h-11 items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-background/50 sm:min-h-0"
            >
              <Filter className="h-4 w-4 text-muted-foreground" />
              {showFilters ? tr("hideFilters") : tr("showFilters")}
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">
                  {tr("activeFiltersBadge", { count: activeFilterCount })}
                </Badge>
              )}
              {showFilters ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
            <div className="flex items-center gap-2">
              {(activeFilterCount > 0 || aiSummary) && (
                <Button variant="ghost" size="sm" onClick={clearAllFilters} className="gap-1.5 text-xs text-muted-foreground">
                  {tr("clearFilters")}
                </Button>
              )}
              <TableToolbar
                onExportCsv={handleExportCsv}
                onExportExcel={handleExportExcel}
                onExportPdf={handleExportPdf}
                exportExtra={(
                  <DropdownMenuItem onClick={() => void handleBulkCvDownload()} disabled={cvDownloading}>
                    {cvDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                    {tr("downloadCvsButton")}
                  </DropdownMenuItem>
                )}
              />
            </div>
          </>
        )}
      >
        {/* Active filters as removable chips: all of them while the panel is
            closed, only the fieldless ones while it is open. */}
        {filterChips.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {filterChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => removeFilterChip(chip)}
                aria-label={tr("removeFilter", { label: chip.label })}
                className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
              >
                <span className="min-w-0 truncate">{chip.label}</span>
                <X className="h-3 w-3 shrink-0" aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
        {showFilters && (
          <JobSeekersFilterPanel
            search={search}
            onSearchChange={changeSearch}
            filters={filters}
            onFiltersChange={updateFilters}
            aiLoading={aiLoading}
            aiSummary={aiSummary}
            onAiSearch={() => { void handleAiSearch(); }}
          />
        )}
      </DashboardPageHeader>

      {/* ── List ──────────────────────────────────────────── */}
      <section className="workspace-panel-surface overflow-hidden rounded-2xl">
        {loadError ? (
          <div className="p-6">
            <ErrorState onRetry={fetchJobSeekers} />
          </div>
        ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead>
                <div className="flex items-center gap-1.5">
                  <span>{tr("tableHeaderName")}</span>
                  <CandidateDataNotice variant="candidateList" compact />
                </div>
              </TableHead>
              <TableHead>{tr("tableHeaderProfession")}</TableHead>
              <TableHead>{tr("tableHeaderNationality")}</TableHead>
              <TableHead>{tr("tableHeaderSkills")}</TableHead>
              {/* Wraps to two lines: nowrap made this the widest column. */}
              <TableHead className="whitespace-normal">{tr("tableHeaderProfilePercent")}</TableHead>
              {/* Gives way below ~1360px so the actions menu stays on screen;
                  the expanded row shows the date instead. */}
              <TableHead className="hidden min-[1360px]:table-cell">{tr("tableHeaderJoined")}</TableHead>
              <TableHead>{tr("tableHeaderReferredBy")}</TableHead>
              <TableHead>{tr("tableHeaderActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableBodySkeleton rows={5} cols={columnCount} />
            ) : jobSeekers.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columnCount} className="py-12">
                  <EmptyState
                    icon={Inbox}
                    title={tr("emptyStateTitle")}
                    description={tr("emptyStateSubtitle")}
                    action={activeFilterCount > 0 || aiSummary ? (
                      <div className="flex flex-wrap justify-center gap-2">
                        {aiBrief && !closestTo && (
                          <Button size="sm" onClick={showClosestMatches}>{tr("showClosestMatches")}</Button>
                        )}
                        <Button variant="outline" size="sm" onClick={clearAllFilters}>{tr("clearFilters")}</Button>
                      </div>
                    ) : undefined}
                  />
                </TableCell>
              </TableRow>
            ) : jobSeekers.map((js) => (
              <Fragment key={js._id}><TableRow className="cursor-pointer hover:bg-muted/30" onClick={() => setExpandedId(expandedId === js._id ? null : js._id)}>
                <TableCell>
                  <div className="flex items-start gap-1.5">
                    {expandedId === js._id ? <ChevronUp className="mt-1 h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="mt-1 h-3.5 w-3.5 text-muted-foreground" />}
                    <div className="flex min-w-0 flex-col items-start gap-1">
                      <span className="font-medium">{js.fullName || js.userId?.name || "—"}</span>
                      <span className="max-w-[11rem] truncate text-xs text-muted-foreground">{js.email ?? js.userId?.email ?? "—"}</span>
                      <StatusBadge status={js.userId?.isActive === false ? "inactive" : (js.status ?? "active")} />
                    </div>
                  </div>
                </TableCell>
                <TableCell className="min-w-[9rem] max-w-[13rem] text-xs text-muted-foreground">
                  <span className="line-clamp-2 font-medium text-foreground/80">{js.experience?.[0]?.jobTitle || js.headline?.slice(0, 60) || "—"}</span>
                  {/* No `block` here: it overrides line-clamp's -webkit-box and
                      long degrees wrapped to four lines. */}
                  <span className="mt-1 line-clamp-2">
                    {js.education?.[0]?.degree ? `${js.education[0].degree}${js.education[0].field ? ` - ${js.education[0].field}` : ""}` : "—"}
                  </span>
                </TableCell>
                <TableCell className="text-xs">
                  <span className="mb-1.5 block text-muted-foreground">{js.nationality ?? "—"}</span>
                  {js.availabilityStatus ? (
                    <span className={`inline-block rounded-full px-1.5 py-0.5 text-[0.6rem] font-medium ${
                      js.availabilityStatus === "immediately" ? "bg-emerald-100 text-emerald-700" :
                      js.availabilityStatus === "within_month" ? "bg-amber-100 text-amber-700" :
                      js.availabilityStatus === "not_available" ? "bg-rose-100 text-rose-700" :
                      "bg-blue-100 text-blue-700"
                    }`}>
                      {availabilityLabels[js.availabilityStatus] ?? js.availabilityStatus.replace(/_/g, " ")}
                    </span>
                  ) : "—"}
                </TableCell>
                <TableCell className="max-w-[16rem] text-xs text-muted-foreground">
                  <span className="line-clamp-2">{js.skills?.length ? `${js.skills.slice(0, 2).join(", ")}${js.skills.length > 2 ? ` +${js.skills.length - 2}` : ""}` : "—"}</span>
                  <span className="mt-1 block">{js.totalExperienceYears != null ? `${js.totalExperienceYears}y` : "—"}</span>
                </TableCell>
                <TableCell className="text-xs font-semibold tabular-nums">
                  {js.profileCompleteness != null ? `${js.profileCompleteness}%` : "—"}
                </TableCell>
                <TableCell className="hidden min-[1360px]:table-cell text-xs text-muted-foreground">{formatDate(new Date(js.createdAt))}</TableCell>
                <TableCell className="text-xs">
                  {js.referralSummary
                    ? <ReferralSourceChip namespace="adminJobSeekers" summary={js.referralSummary} />
                    : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {js.cv?.originalUrl || canUpdate || canDelete ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 max-sm:min-h-11 max-sm:min-w-11"
                          aria-label={tr("rowActionsFor", { name: js.fullName || js.userId?.name || js.email || "" })}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        {js.cv?.originalUrl && (
                          <DropdownMenuItem onClick={() => setViewCv({ id: js._id, name: js.fullName || js.userId?.name || "CV" })}>
                            <Eye className="h-4 w-4" /> {tr("viewCvTitle")}
                          </DropdownMenuItem>
                        )}
                        {canUpdate && (
                          <DropdownMenuItem onClick={() => setEditItem(js)}>
                            <Pencil className="h-4 w-4" /> {tr("actionEditTitle")}
                          </DropdownMenuItem>
                        )}
                        {canDelete && (
                          <>
                            {(js.cv?.originalUrl || canUpdate) && <DropdownMenuSeparator />}
                            {js.userId?.isActive === false ? (
                              <DropdownMenuItem onClick={() => void handleReactivate(js._id)}>
                                <RotateCcw className="h-4 w-4" /> {tr("actionReactivateTitle")}
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => void handleDelete(js._id)} className="text-destructive focus:text-destructive">
                                <Ban className="h-4 w-4" /> {tr("actionDeactivateTitle")}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => void handlePermanentDelete(js._id)} className="text-destructive focus:text-destructive">
                              <Trash2 className="h-4 w-4" /> {tr("actionDeletePermanentlyTitle")}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : <span className="text-muted-foreground">—</span>}
                </TableCell>
              </TableRow>

              {/* Expanded Row */}
              {expandedId === js._id && (
                <TableRow className="bg-muted/10 hover:bg-muted/10">
                  <TableCell colSpan={columnCount} className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      {/* Summary */}
                      {js.summary && (
                        <div className="md:col-span-3">
                          <p className="text-xs font-semibold text-muted-foreground mb-1">{tr("expandedLabelSummary")}</p>
                          <p className="text-muted-foreground text-xs">{js.summary}</p>
                        </div>
                      )}
                      {/* Contact */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">{tr("expandedLabelContact")}</p>
                        <p className="text-muted-foreground text-xs">{js.email ?? js.userId?.email ?? "—"}</p>
                        {js.phone && <p className="text-muted-foreground text-xs">{js.phone}</p>}
                        {js.currentLocation && <p className="text-muted-foreground text-xs">{js.currentLocation}</p>}
                        <p className="text-muted-foreground text-xs">{tr("tableHeaderJoined")}: {formatDate(new Date(js.createdAt))}</p>
                      </div>
                      {/* Experience */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1"><Briefcase className="h-3 w-3" /> {tr("expandedLabelExperience")}</p>
                        {js.experience?.length ? js.experience.slice(0, 3).map((exp, i) => (
                          <div key={i} className="mb-1.5">
                            <p className="font-medium text-foreground text-xs">{exp.jobTitle || "—"}</p>
                            <p className="text-xs text-muted-foreground">{exp.company}{exp.isCurrent ? ` · ${tr("experienceCurrent")}` : ""}</p>
                          </div>
                        )) : <p className="text-xs text-muted-foreground">{tr("expandedNoExperience")}</p>}
                      </div>
                      {/* Education */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1"><GraduationCap className="h-3 w-3" /> {tr("expandedLabelEducation")}</p>
                        {js.education?.length ? js.education.slice(0, 3).map((edu, i) => (
                          <div key={i} className="mb-1.5">
                            <p className="font-medium text-foreground text-xs">{edu.degree || "—"}{edu.field ? ` — ${edu.field}` : ""}</p>
                            <p className="text-xs text-muted-foreground">{edu.institution}{edu.passingYear ? ` · ${edu.passingYear}` : ""}</p>
                          </div>
                        )) : <p className="text-xs text-muted-foreground">{tr("expandedNoEducation")}</p>}
                      </div>
                      {/* Skills */}
                      {js.skills?.length ? (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1"><Award className="h-3 w-3" /> {tr("expandedLabelSkills")}</p>
                          <div className="flex flex-wrap gap-1">
                            {js.skills.slice(0, 12).map((s) => (
                              <span key={s} className="rounded-full border bg-muted/30 px-2 py-0.5 text-[0.65rem] text-muted-foreground">{s}</span>
                            ))}
                            {js.skills.length > 12 && <span className="text-xs text-muted-foreground">{tr("expandedMoreSkills", { count: js.skills.length - 12 })}</span>}
                          </div>
                        </div>
                      ) : null}
                      {/* Languages */}
                      {js.languages?.length ? (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1"><Globe className="h-3 w-3" /> {tr("expandedLabelLanguages")}</p>
                          <div className="flex flex-wrap gap-1">
                            {js.languages.map((l, i) => (
                              <span key={i} className="rounded-full border bg-muted/30 px-2 py-0.5 text-[0.65rem] text-muted-foreground">{l.language} ({l.proficiency})</span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {/* Certifications */}
                      {js.certifications?.length ? (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">{tr("expandedLabelCertifications")}</p>
                          <div className="flex flex-wrap gap-1">
                            {js.certifications.slice(0, 5).map((c, i) => (
                              <span key={i} className="rounded-full border bg-muted/30 px-2 py-0.5 text-[0.65rem] text-muted-foreground">{c}</span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {/* CV Download (individual) */}
                      {js.cv?.originalUrl && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">{tr("expandedLabelCvResume")}</p>
                          <button
                            type="button"
                            onClick={() => setViewCv({ id: js._id, name: js.fullName || js.userId?.name || "CV" })}
                            className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs text-primary hover:bg-primary/10 transition-colors"
                          >
                            <Download className="h-3 w-3" />
                            {tr("downloadCvLink")}
                          </button>
                        </div>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
        )}
      </section>

      {/* ── Pagination ────────────────────────────────────── */}
      <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />

      {/* ── In-app CV Viewer ──────────────────────────────── */}
      {viewCv && (
        <ResumeViewerModal
          url={`/api/employers/candidates/${viewCv.id}/cv#cv.pdf`}
          candidateName={viewCv.name}
          jobSeekerId={viewCv.id}
          onClose={() => setViewCv(null)}
        />
      )}

      {/* ── Edit Modal ────────────────────────────────────── */}
      <CrudModal open={!!editItem} onClose={() => setEditItem(null)} title={tr("editModalTitle")} fields={editFields}
        initialValues={editItem ? { name: editItem.fullName || editItem.userId?.name || "", email: editItem.email ?? editItem.userId?.email ?? "", nationality: editItem.nationality ?? "", currentLocation: editItem.currentLocation ?? "", summary: editItem.summary ?? "" } : undefined}
        onSubmit={handleEdit} />
    </div>
  );
}
