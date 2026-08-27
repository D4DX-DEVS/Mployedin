"use client";

import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageHero } from "@/components/shared/PageHero";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePermissions } from "@/hooks/usePermissions";
import { usePagination } from "@/hooks/usePagination";
import {
  Pencil, Trash2, UserX, ChevronDown, ChevronUp, Briefcase,
  GraduationCap, Globe, Award, Search, Inbox, Download,
  FileSpreadsheet, FileText, Sparkles, X, SlidersHorizontal,
  FileDown, Loader2, Eye, RotateCcw,
} from "lucide-react";
import { useConfirm } from "@/hooks/useConfirm";
import { ResumeViewerModal } from "@/components/shared/ResumeViewerModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useTableExport } from "@/hooks/useTableExport";
import type { ExportColumn } from "@/lib/export";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { formatDate } from "@/lib/ui/intlFormat";
import { CandidateDataNotice } from "@/components/shared/CandidateDataNotice";

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
  createdAt: string;
}

interface AiFilters {
  search?: string;
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
  const { can } = usePermissions();

  // Translation maps
  const aiSuggestions = [
    tr("aiSuggestionElectricalEngineers"),
    tr("aiSuggestionHrManagers"),
    tr("aiSuggestionMbaCandidates"),
    tr("aiSuggestionRemoteDevelopers"),
    tr("aiSuggestionFreshGraduates"),
    tr("aiSuggestionAccountants"),
  ];

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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<JobSeeker | null>(null);
  const [viewCv, setViewCv] = useState<{ id: string; name: string } | null>(null);

  // ── Filter state ────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [skillsFilter, setSkillsFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState("");
  const [jobTypeFilter, setJobTypeFilter] = useState("");
  const [sortFilter, setSortFilter] = useState("newest");
  const [hasCVFilter, setHasCVFilter] = useState(false);
  const [educationFilter, setEducationFilter] = useState("");
  const [nationalityFilter, setNationalityFilter] = useState("");
  const [experienceYearsFilter, setExperienceYearsFilter] = useState(0);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  // Phones only: the five example queries stack into five rows above the list.
  // They sit behind a toggle there and stay always-visible from `sm:` up.
  const [showAiSuggestions, setShowAiSuggestions] = useState(false);

  // ── AI search state ─────────────────────────────────────
  const [aiQuery, setAiQuery] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiActive, setAiActive] = useState(false);
  const aiInputRef = useRef<HTMLInputElement>(null);

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
  ], [tr]);

  // PDF fits ~10 columns in landscape A4; the full 17-column set is unreadable
  const pdfColumns = useMemo(() => {
    const keepKeys = ["fullName", "email", "phone", "nationality", "currentLocation", "totalExperienceYears", "availabilityStatus", "profileCompleteness", "cv", "createdAt"];
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
    if (skillsFilter) params.set("skills", skillsFilter);
    if (locationFilter) params.set("location", locationFilter);
    if (availabilityFilter) params.set("availability", availabilityFilter);
    if (jobTypeFilter) params.set("jobType", jobTypeFilter);
    if (sortFilter && sortFilter !== "newest") params.set("sort", sortFilter);
    if (hasCVFilter) params.set("hasCV", "1");
    if (educationFilter) params.set("education", educationFilter);
    if (nationalityFilter) params.set("nationality", nationalityFilter);
    if (experienceYearsFilter > 0) params.set("experienceYears", String(experienceYearsFilter));

    try {
      const res = await fetch(`/api/job-seekers?${params}`);
      if (res.ok) {
        const data = await res.json();
        setJobSeekers(data.items ?? data.jobSeekers ?? []);
        updateTotal(data.total ?? data.totalCount ?? data.pagination?.total ?? ((data.totalPages ?? 1) * limit));
      }
    } finally {
      setLoading(false);
    }
  }, [search, skillsFilter, locationFilter, availabilityFilter, jobTypeFilter, sortFilter, hasCVFilter, educationFilter, nationalityFilter, experienceYearsFilter, page, limit]);

  useEffect(() => {
    const timeout = setTimeout(fetchJobSeekers, 300);
    return () => clearTimeout(timeout);
  }, [fetchJobSeekers]);

  // ── AI Search handler ───────────────────────────────────
  const handleAiSearch = async (query?: string) => {
    const q = (query ?? aiQuery).trim();
    if (!q) return;
    setAiLoading(true);
    setAiSummary(null);

    try {
      // Run AI filter extraction AND vector search in parallel
      const [aiRes, vectorRes] = await Promise.all([
        fetch("/api/ai/admin-jobseeker-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q }),
        }),
        fetch("/api/job-seekers/vector-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q, page: 1, limit: 50 }),
        }).catch(() => null), // Vector search is optional enhancement
      ]);

      if (!aiRes.ok) throw new Error("AI search failed");
      const aiData = await aiRes.json();
      const filters: AiFilters = aiData.filters ?? {};

      // Apply extracted filters for structured search
      if (filters.search) setSearch(filters.search);
      if (filters.skills?.length) setSkillsFilter(filters.skills.join(","));
      if (filters.location) setLocationFilter(filters.location);
      if (filters.availability) setAvailabilityFilter(filters.availability);
      if (filters.jobType) setJobTypeFilter(filters.jobType);
      if (filters.sort) setSortFilter(filters.sort);
      if (filters.hasCV) setHasCVFilter(true);
      if (filters.education) setEducationFilter(filters.education);
      if (filters.nationality) setNationalityFilter(filters.nationality);
      if (filters.experienceYears && filters.experienceYears > 0) setExperienceYearsFilter(filters.experienceYears);

      // If vector search returned results, merge them with upcoming structured results
      if (vectorRes?.ok) {
        const vectorData = await vectorRes.json();
        if (vectorData.items?.length) {
          // Store vector results directly if they have good relevance
          const vectorItems = vectorData.items.filter((item: JobSeeker & { _relevanceScore?: number }) => (item._relevanceScore ?? 0) >= 50);
          if (vectorItems.length > 0) {
            setJobSeekers(vectorItems);
            updateTotal(vectorItems.length);
            setAiSummary(`${aiData.summary ?? `AI search: "${q}"`} (${vectorItems.length} ${tr("semanticMatches")})`);
            setAiActive(true);
            setShowAdvancedFilters(true);
            resetPage();
            setAiLoading(false);
            toast.success(tr("vectorSearchLoaded"));
            return;
          }
        }
      }

      setAiSummary(aiData.summary ?? `AI search: "${q}"`);
      setAiActive(true);
      setShowAdvancedFilters(true);
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

  const clearAiFilters = () => {
    setAiActive(false);
    setAiSummary(null);
    setAiQuery("");
    setSearch("");
    setSkillsFilter("");
    setLocationFilter("");
    setAvailabilityFilter("");
    setJobTypeFilter("");
    setSortFilter("newest");
    setHasCVFilter(false);
    setEducationFilter("");
    setNationalityFilter("");
    setExperienceYearsFilter(0);
    setShowAdvancedFilters(false);
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
          skills: skillsFilter ? skillsFilter.split(",").map((s) => s.trim()) : undefined,
          location: locationFilter || undefined,
          availability: availabilityFilter || undefined,
          hasCV: "1",
          jobType: jobTypeFilter || undefined,
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
    if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed"); }
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
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (search) count++;
    if (skillsFilter) count++;
    if (locationFilter) count++;
    if (availabilityFilter) count++;
    if (jobTypeFilter) count++;
    if (hasCVFilter) count++;
    if (sortFilter !== "newest") count++;
    return count;
  }, [search, skillsFilter, locationFilter, availabilityFilter, jobTypeFilter, hasCVFilter, sortFilter]);

  return (
    <div className="page-container">
      {ConfirmDialogNode}

      <PageHero
        title={tr("heroTitle")}
        description={tr("heroDescription")}
      />

      {/* ── AI Search Bar ─────────────────────────────────── */}
      <section className="workspace-panel-surface rounded-3xl panel-body">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="heading-label font-semibold text-foreground">{tr("aiSearchTitle")}</h2>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Sparkles className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/60" />
            <Input
              ref={aiInputRef}
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAiSearch(); }}
              placeholder={tr("aiSearchPlaceholder")}
              className="h-10 pl-10 text-sm rounded-lg"
              disabled={aiLoading}
            />
          </div>
          <Button
            onClick={() => handleAiSearch()}
            disabled={aiLoading || !aiQuery.trim()}
            className="h-10 rounded-lg px-4"
          >
            {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span className="ml-1.5">{tr("searchButton")}</span>
          </Button>
          {aiActive && (
            <Button variant="ghost" size="sm" onClick={clearAiFilters} className="h-10 rounded-lg">
              <X className="h-4 w-4" /> {tr("clearButton")}
            </Button>
          )}
        </div>

        {/* AI Suggestions — revealed on tap on phones, always shown from sm: up */}
        <button
          type="button"
          onClick={() => setShowAiSuggestions((open) => !open)}
          aria-expanded={showAiSuggestions}
          className="mt-2 flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground sm:hidden"
        >
          <Sparkles className="h-3 w-3" />
          {tr("aiSuggestionsToggle")}
          {showAiSuggestions ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        <div className={`mt-2 flex-wrap gap-1.5 sm:flex ${showAiSuggestions ? "flex" : "hidden"}`}>
          {aiSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => { setAiQuery(suggestion); handleAiSearch(suggestion); }}
              className="rounded-full border border-border/60 bg-muted/30 px-2.5 py-1 text-[0.65rem] text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>

        {/* AI Summary */}
        {aiSummary && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 chip-pad">
            <Sparkles className="h-3.5 w-3.5 text-primary flex-shrink-0" />
            <p className="text-xs text-primary">{tr("aiSummarySuffix", { summary: aiSummary })}</p>
          </div>
        )}
      </section>

      {/* ── Main Panel ────────────────────────────────────── */}
      <section className="workspace-panel-surface overflow-hidden rounded-3xl">
        {/* Header with filters & actions */}
        <div className="flex flex-col gap-3 border-b border-border/80 panel-head">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <PageHeader
              title={tr("mainTitle")}
              description={total > 0 ? tr("candidatesFound", { count: total }) : tr("mainSubtitle")}
              headingLevel={2}
            />
            {/* data-table-toolbar opts this hand-rolled header into the shared
                mobile toolbar rules: one row, icon-only action buttons. */}
            <div data-table-toolbar="compact-admin" className="flex flex-wrap items-center gap-2">
              {/* Generate Embeddings (admin only) */}
              <Button
                variant="ghost"
                size="dense"
                className="text-xs text-muted-foreground hover:text-primary"
                onClick={async () => {
                  toast.info(tr("embeddingGenerationStarted"));
                  try {
                    const res = await fetch("/api/job-seekers/generate-embeddings", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ forceAll: false }),
                    });
                    if (res.ok) {
                      const data = await res.json();
                      toast.success(tr("embeddingGenerationSuccess", { count: data.generated }));
                    } else {
                      toast.error(tr("embeddingGenerationFailed"));
                    }
                  } catch {
                    toast.error(tr("embeddingGenerationError"));
                  }
                }}
              >
                <Sparkles className="h-3 w-3" /> {tr("indexAiButton")}
              </Button>
              {/* Keyword search */}
              <div className="relative toolbar-search-field">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); resetPage(); }}
                  placeholder={tr("keywordSearchPlaceholder")}
                  className="h-8 w-56 rounded-lg pl-8 text-sm"
                />
              </div>

              {/* Toggle Advanced Filters */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className="h-8 rounded-lg border-border/80"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {tr("filtersButton")}
                {activeFilterCount > 0 && (
                  <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[0.6rem] text-primary-foreground">
                    {activeFilterCount}
                  </span>
                )}
              </Button>

              {/* CV Download */}
              <Button
                variant="outline"
                size="dense"
                onClick={handleBulkCvDownload}
                disabled={cvDownloading}
                className="rounded-lg border-border/80"
              >
                {cvDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
                {tr("downloadCvsButton")}
              </Button>

              {/* Export Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="dense" className="rounded-lg border-border/80">
                    <Download className="h-3.5 w-3.5" /> {tr("exportButton")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>{tr("exportLabel")}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleExportCsv}>
                    <FileText className="h-4 w-4" /> {tr("exportCsv")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportExcel}>
                    <FileSpreadsheet className="h-4 w-4" /> {tr("exportExcel")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportPdf}>
                    <FileText className="h-4 w-4" /> {tr("exportPdf")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Advanced Filters Row */}
          {showAdvancedFilters && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 pt-2 border-t border-border/50">
              {/* Skills */}
              <div>
                <label className="text-[0.65rem] font-medium text-muted-foreground mb-0.5 block">{tr("filterLabelSkills")}</label>
                <Input
                  value={skillsFilter}
                  onChange={(e) => { setSkillsFilter(e.target.value); resetPage(); }}
                  placeholder={tr("filterPlaceholderSkills")}
                  className="h-7 text-xs rounded-md"
                />
              </div>
              {/* Location */}
              <div>
                <label className="text-[0.65rem] font-medium text-muted-foreground mb-0.5 block">{tr("filterLabelLocation")}</label>
                <Input
                  value={locationFilter}
                  onChange={(e) => { setLocationFilter(e.target.value); resetPage(); }}
                  placeholder={tr("filterPlaceholderLocation")}
                  className="h-7 text-xs rounded-md"
                />
              </div>
              {/* Availability */}
              <div>
                <label className="text-[0.65rem] font-medium text-muted-foreground mb-0.5 block">{tr("filterLabelAvailability")}</label>
                <Select value={availabilityFilter || "all"} onValueChange={(v) => { setAvailabilityFilter(v === "all" ? "" : v); resetPage(); }}>
                  <SelectTrigger className="h-7 text-xs rounded-md">
                    <SelectValue placeholder={tr("filterPlaceholderAll")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{tr("filterPlaceholderAll")}</SelectItem>
                    <SelectItem value="immediately">{tr("availabilityImmediately")}</SelectItem>
                    <SelectItem value="within_month">{tr("availabilityWithinMonth")}</SelectItem>
                    <SelectItem value="within_3_months">{tr("availabilityWithin3Months")}</SelectItem>
                    <SelectItem value="not_available">{tr("availabilityNotAvailable")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Job Type */}
              <div>
                <label className="text-[0.65rem] font-medium text-muted-foreground mb-0.5 block">{tr("filterLabelJobType")}</label>
                <Select value={jobTypeFilter || "all"} onValueChange={(v) => { setJobTypeFilter(v === "all" ? "" : v); resetPage(); }}>
                  <SelectTrigger className="h-7 text-xs rounded-md">
                    <SelectValue placeholder={tr("filterPlaceholderAll")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{tr("filterPlaceholderAll")}</SelectItem>
                    <SelectItem value="remote">{tr("jobTypeRemote")}</SelectItem>
                    <SelectItem value="hybrid">{tr("jobTypeHybrid")}</SelectItem>
                    <SelectItem value="onsite">{tr("jobTypeOnsite")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Sort */}
              <div>
                <label className="text-[0.65rem] font-medium text-muted-foreground mb-0.5 block">{tr("filterLabelSort")}</label>
                <Select value={sortFilter} onValueChange={(v) => { setSortFilter(v); resetPage(); }}>
                  <SelectTrigger className="h-7 text-xs rounded-md">
                    <SelectValue placeholder={tr("sortNewest")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">{tr("sortNewest")}</SelectItem>
                    <SelectItem value="oldest">{tr("sortOldest")}</SelectItem>
                    <SelectItem value="profile_high">{tr("sortProfileHigh")}</SelectItem>
                    <SelectItem value="profile_low">{tr("sortProfileLow")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Has CV */}
              <div className="flex items-end">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasCVFilter}
                    onChange={(e) => { setHasCVFilter(e.target.checked); resetPage(); }}
                    className="h-3.5 w-3.5 rounded border-border accent-primary"
                  />
                  <span className="text-xs text-muted-foreground">{tr("filterHasCvOnly")}</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* ── Table ───────────────────────────────────────── */}
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
              <TableHead>{tr("tableHeaderProfilePercent")}</TableHead>
              <TableHead>{tr("tableHeaderJoined")}</TableHead>
              {(can("job_seekers", "update") || can("job_seekers", "delete")) && (
                <TableHead>{tr("tableHeaderActions")}</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : jobSeekers.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-8 w-8 opacity-40" />
                    <span className="text-sm">{tr("emptyStateTitle")}</span>
                    <span className="text-xs">{tr("emptyStateSubtitle")}</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : jobSeekers.map((js) => (
              <Fragment key={js._id}><TableRow className="cursor-pointer hover:bg-muted/30" onClick={() => setExpandedId(expandedId === js._id ? null : js._id)}>
                <TableCell>
                  <div className="flex items-start gap-1.5">
                    {expandedId === js._id ? <ChevronUp className="mt-1 h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="mt-1 h-3.5 w-3.5 text-muted-foreground" />}
                    <div className="flex min-w-0 flex-col items-start gap-1">
                      <span className="font-medium">{js.fullName || js.userId?.name || "—"}</span>
                      <span className="max-w-[15rem] truncate text-xs text-muted-foreground">{js.email ?? js.userId?.email ?? "—"}</span>
                      <StatusBadge status={js.userId?.isActive === false ? "inactive" : (js.status ?? "active")} />
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs max-w-[140px]">
                  <span className="line-clamp-2 font-medium text-foreground/80">{js.experience?.[0]?.jobTitle || js.headline?.slice(0, 60) || "—"}</span>
                  <span className="mt-1 block line-clamp-2">
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
                      {js.availabilityStatus.replace(/_/g, " ")}
                    </span>
                  ) : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  <span className="block">{js.skills?.length ? `${js.skills.slice(0, 2).join(", ")}${js.skills.length > 2 ? ` +${js.skills.length - 2}` : ""}` : "—"}</span>
                  <span className="mt-1 block">{js.totalExperienceYears != null ? `${js.totalExperienceYears}y` : "—"}</span>
                </TableCell>
                <TableCell className="text-xs">
                  <span className="mb-1.5 block font-semibold tabular-nums">{js.profileCompleteness != null ? `${js.profileCompleteness}%` : "—"}</span>
                  {js.cv?.originalUrl ? (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setViewCv({ id: js._id, name: js.fullName || js.userId?.name || "CV" }); }}
                      className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-primary/10 text-primary transition-colors"
                      title={tr("viewCvTitle")}
                      aria-label={tr("viewCvTitle")}
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  ) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">{formatDate(new Date(js.createdAt))}</TableCell>
                {(can("job_seekers", "update") || can("job_seekers", "delete")) && (
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      {can("job_seekers", "update") && (
                        <Button variant="ghost" size="xs" onClick={() => setEditItem(js)} title={tr("actionEditTitle")}>
                          <Pencil className="h-3.5 w-3.5 text-primary" />
                        </Button>
                      )}
                      {can("job_seekers", "delete") && (
                        js.userId?.isActive === false ? (
                          <Button variant="ghost" size="xs" onClick={() => handleReactivate(js._id)} title={tr("actionReactivateTitle")} aria-label={tr("actionReactivateTitle")}>
                            <RotateCcw className="h-3.5 w-3.5 text-emerald-600" />
                          </Button>
                        ) : (
                          <Button variant="ghost" size="xs" onClick={() => handleDelete(js._id)} title={tr("actionDeactivateTitle")}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        )
                      )}
                      {can("job_seekers", "delete") && (
                        <Button variant="ghost" size="xs" onClick={() => handlePermanentDelete(js._id)} title={tr("actionDeletePermanentlyTitle")}>
                          <UserX className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>

              {/* Expanded Row */}
              {expandedId === js._id && (
                <TableRow className="bg-muted/10 hover:bg-muted/10">
                  <TableCell colSpan={7} className="p-4">
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
