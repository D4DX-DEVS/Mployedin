"use client";

import { IndustryChips } from "@/components/shared/IndustryChips";
import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import { ReferralSourceChip } from "@/components/shared/ReferralSourceChip";
import type { ReferralSummary } from "@/lib/referrals/summary";
import { seekerCvAvailability } from "@/lib/cv/seekerCvAvailability";
import { useLocale, useTranslations } from "next-intl";
import { FormError, formErrorFromResponse } from "@/lib/errors/form-error";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
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
  Pencil, Trash2, Ban, Inbox, FileDown, FileText, Loader2, Eye, RotateCcw, X, Crown,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { JobSeekerMobileList } from "./_components/JobSeekerMobileList";
import { useConfirm } from "@/hooks/useConfirm";
import { ResumeViewerModal } from "@/components/shared/ResumeViewerModal";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { RowActions, type RowAction } from "@/components/shared/RowActions";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { isRowToggleClick } from "@/components/shared/RowExpandToggle";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useTableExport } from "@/hooks/useTableExport";
import type { ExportColumn } from "@/lib/export";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { seekersInListOrder } from "@/lib/jobseekers/seekersInListOrder";
import { useRowSelection } from "@/hooks/useRowSelection";
import { Checkbox } from "@/components/ui/checkbox";
import { SelectionBar, ExportCvsButton } from "@/components/shared/SelectionBar";
import { CvExportDialog } from "@/components/shared/CvExport/CvExportDialog";
import { CV_EXPORT_MAX_ITEMS } from "@/lib/cv/cvExportTypes";
import { toast } from "sonner";
import { formatListDate } from "@/lib/ui/intlFormat";
import { CandidateDataNotice } from "@/components/shared/CandidateDataNotice";
import {
  JobSeekersFilterPanel, EMPTY_JOB_SEEKER_FILTERS, countActiveJobSeekerFilters,
  buildJobSeekerFilterChips, FIELDLESS_FILTER_KEYS, type JobSeekerFilterChip, type JobSeekerFilters,
  splitJobSeekerSort, joinJobSeekerSort, type JobSeekerSortField,
} from "./_components/JobSeekersFilterPanel";
import { SortableTableHeader } from "@/components/shared/TableSortControl";
import { useDebounce } from "@/hooks/useDebounce";
import { useInitialLoading } from "@/hooks/useInitialLoading";

interface JobSeeker {
  _id: string;
  fullName: string;
  email?: string;
  nationality?: string;
  currentLocation?: string;
  status?: string;
  userId?: { _id?: string; name?: string; email?: string; isActive?: boolean };
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
  badges?: string[];
  industry?: string;
  industrySource?: "auto" | "manual";
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

/**
 * The list query for the current search + filters. The table, the exports and
 * the CV export all build it here, so they always describe the same people.
 */
function seekerListParams(search: string, filters: JobSeekerFilters): URLSearchParams {
  const params = new URLSearchParams();
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
  if (filters.industry) params.set("industry", filters.industry);
  if (filters.experienceYears > 0) params.set("experienceYears", String(filters.experienceYears));
  return params;
}

export default function AdminJobSeekersPage() {
  const tr = useTranslations("adminJobSeekers");
  const tf = useTranslations("formErrors");
  const tSelect = useTranslations("selectionBar");
  const tViewer = useTranslations("resumeViewerModal");
  const locale = useLocale();
  const router = useRouter();
  const { can } = usePermissions();

  const availabilityLabels: Record<string, string> = {
    immediately: tr("availabilityImmediately"),
    within_month: tr("availabilityWithinMonth"),
    within_3_months: tr("availabilityWithin3Months"),
    not_available: tr("availabilityNotAvailable"),
  };

  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();

  // ── Data state ──────────────────────────────────────────
  const [jobSeekers, setJobSeekers] = useState<JobSeeker[]>([]);
  const [loading, setLoading] = useState(true);
  const initialLoading = useInitialLoading(loading);
  const [loadError, setLoadError] = useState(false);
  const [editItem, setEditItem] = useState<JobSeeker | null>(null);
  // `source: "file"` opens the original upload; otherwise the viewer opens on the Standardised CV.
  const [viewCv, setViewCv] = useState<{ id: string; name: string; source?: "file" } | null>(null);
  // Industry counts aggregated from the filtered scope
  const [industryCounts, setIndustryCounts] = useState<Array<{ industry: string; count: number }>>([]);
  // Industries for the admin edit form dropdown
  const [industryOptions, setIndustryOptions] = useState<Array<{ value: string; label: string }>>([]);

  // ── Filter state ────────────────────────────────────────
  /* In the URL so a ⌘K hit, an application row or a notification can open this
     list already narrowed to one candidate. */
  const [search, setSearch] = useUrlFilter("search", "", { debounceMs: 400 });
  const debouncedSearch = useDebounce(search, 350);
  const [filters, setFilters] = useState<JobSeekerFilters>(EMPTY_JOB_SEEKER_FILTERS);

  const updateFilters = (patch: Partial<JobSeekerFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setClosestTo(null);
    resetPage();
  };
  const currentSort = splitJobSeekerSort(filters.sort);
  /** Column heads share the filter bar's sort: same column flips it, a new one starts high-to-low. */
  const sortByColumn = (field: JobSeekerSortField) => {
    const order = currentSort.field === field && currentSort.order === "desc" ? "asc" : "desc";
    updateFilters({ sort: joinJobSeekerSort(field, order) });
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

  // ── CV export: row selection + the shared export dialog ──
  const selection = useRowSelection<JobSeeker>((js) => js._id);
  // Who the dialog is for: the ticked rows, or the first 50 of the filtered list.
  const [exportRows, setExportRows] = useState<JobSeeker[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  // True while the filtered list is being paged for an export with nothing ticked.
  const [exportPreparing, setExportPreparing] = useState(false);

  // ── Export columns (comprehensive) ──────────────────────
  const exportColumns: ExportColumn<JobSeeker>[] = useMemo(() => [
    { header: tr("tableHeaderName"), key: "fullName", formatter: (v, r) => String(v || (r as unknown as JobSeeker).userId?.name || "—") },
    { header: tr("tableHeaderEmail"), key: "email", formatter: (v, r) => String(v ?? (r as unknown as JobSeeker).userId?.email ?? "—") },
    { header: tr("exportColumnHeaderPhone"), key: "phone", formatter: (v) => String(v ?? "—") },
    { header: tr("exportColumnHeaderHeadline"), key: "headline", formatter: (v) => String(v ?? "—") },
    { header: tr("tableHeaderNationality"), key: "nationality", formatter: (v) => String(v ?? "—") },
    { header: tr("tableHeaderLocation"), key: "currentLocation", formatter: (v) => String(v ?? "—") },
    { header: tr("tableHeaderIndustry"), key: "industry", formatter: (v) => String(v ?? "—") },
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
    { header: tr("tableHeaderJoined"), key: "createdAt", formatter: (v) => v ? formatListDate(new Date(String(v))) : "—" },
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

  // BUG-004: export the full filtered result set, not just the visible page.
  // Ranked vector-search results have no paginated full set — export the page.
  const fetchAllJobSeekers = useCallback(async () => {
    if (closestTo) return jobSeekers as unknown as Record<string, unknown>[];
    const base = seekerListParams(search, filters);
    return fetchAllPaginated<Record<string, unknown>>(
      (page, limit) => `/api/job-seekers?${new URLSearchParams({ ...Object.fromEntries(base), page: String(page), limit: String(limit) })}`,
      (json) => ({
        rows: (((json.items ?? json.jobSeekers ?? []) as Record<string, unknown>[])),
        total: Number(json.total ?? json.totalCount ?? (json.pagination as { total?: number } | undefined)?.total ?? 0),
      }),
    );
  }, [closestTo, jobSeekers, search, filters]);
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: jobSeekers as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    pdfColumns: pdfColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "job-seekers-search-results",
    title: tr("exportTitle"),
    fetchAll: fetchAllJobSeekers,
  });

  // ── Fetch job seekers ───────────────────────────────────
  const fetchJobSeekers = useCallback(async () => {
    setLoading(true);
    const params = seekerListParams(debouncedSearch, filters);
    params.set("page", String(page));
    params.set("limit", String(limit));
    params.set("industryCounts", "1");

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
      setIndustryCounts(data.industryCounts ?? []);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filters, closestTo, page, limit]);

  useEffect(() => {
    const timeout = setTimeout(fetchJobSeekers, 300);
    return () => clearTimeout(timeout);
  }, [fetchJobSeekers]);

  // ── Fetch industries for admin edit form ─────────────────
  useEffect(() => {
    const fetchIndustries = async () => {
      try {
        const res = await fetch("/api/admin/job-attributes/industries?limit=500&status=active");
        if (!res.ok) return;
        const data = await res.json();
        const options = (data.data ?? []).map((ind: Record<string, unknown>) => ({
          value: String(ind._id ?? ind.name ?? ""),
          label: String(ind.name ?? ""),
        }));
        setIndustryOptions(options);
      } catch {
        // Non-critical: industry dropdown may be empty
      }
    };
    void fetchIndustries();
  }, []);

  // ── Edit form fields (dynamic to include industries) ──────
  const editFields: CrudField[] = useMemo(() => [
    { name: "name", label: tr("editFieldName"), type: "text", required: true },
    { name: "email", label: tr("editFieldEmail"), type: "email" },
    { name: "nationality", label: tr("editFieldNationality"), type: "text" },
    { name: "currentLocation", label: tr("editFieldLocation"), type: "text" },
    { name: "summary", label: tr("editFieldSummary"), type: "textarea" },
    { name: "industry", label: tr("editFieldIndustry"), type: "select", options: industryOptions },
  ], [tr, industryOptions]);

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

  // ── CV export (shared dialog: Standardised / Original / Both, one ZIP) ──
  const seekerName = (js: JobSeeker) => js.fullName || js.userId?.name || "";
  const exportItems = useMemo(
    () => exportRows.map((js) => ({ seekerId: js._id, name: js.fullName || js.userId?.name || "" })),
    [exportRows],
  );
  // The candidates.xlsx columns the old ZIP had, minus the CV-file column: the
  // ZIP adds the Standardised / Original columns itself.
  const exportDetails = useMemo(() => ({
    header: [
      tr("bulkCvExcelSheetHeaderName"), tr("bulkCvExcelSheetHeaderEmail"), tr("bulkCvExcelSheetHeaderNationality"),
      tr("bulkCvExcelSheetHeaderLocation"), tr("bulkCvExcelSheetHeaderExperience"), tr("bulkCvExcelSheetHeaderHeadline"),
    ],
    rowsById: new Map(exportRows.map((js) => [js._id, [
      js.fullName || js.userId?.name || "", js.email ?? js.userId?.email ?? "", js.nationality ?? "", js.currentLocation ?? "",
      js.totalExperienceYears != null ? String(js.totalExperienceYears) : "", js.headline ?? "",
    ]])),
  }), [exportRows, tr]);

  const openCvExport = (picked: JobSeeker[]) => {
    setExportRows(picked);
    setExportOpen(true);
  };

  // The "Download CVs" menu item: the ticked rows, or, with none ticked and the
  // admin's say-so, the first 50 of the filtered list in the order shown.
  const handleCvExportMenu = async () => {
    if (selection.count > 0) {
      openCvExport(selection.items);
      return;
    }
    const filteredTotal = closestTo ? jobSeekers.length : total;
    if (filteredTotal === 0) {
      toast.error(tr("noCvsFound"));
      return;
    }
    const ok = await confirmDialog({
      message: filteredTotal > CV_EXPORT_MAX_ITEMS
        ? tr("exportFilteredFirstMessage", { max: CV_EXPORT_MAX_ITEMS, total: filteredTotal })
        : tr("exportFilteredAllMessage", { count: filteredTotal }),
      confirmLabel: tSelect("exportCvs"),
    });
    if (!ok) return;
    setExportPreparing(true);
    try {
      // The export holds exactly the people on screen, top to bottom: page through
      // the same list query (filters + sort) the table uses. A ranked AI search
      // has no paged full set, so it uses the rows it showed.
      const picked = closestTo
        ? jobSeekers.slice(0, CV_EXPORT_MAX_ITEMS)
        : await seekersInListOrder<JobSeeker>(async (p, l) => {
            const params = seekerListParams(search, filters);
            params.set("page", String(p));
            params.set("limit", String(l));
            const listRes = await fetch(`/api/job-seekers?${params}`);
            if (!listRes.ok) throw new Error("list");
            const json = await listRes.json();
            return { rows: json.items ?? json.jobSeekers ?? [], total: Number(json.total ?? 0) };
          }, CV_EXPORT_MAX_ITEMS);
      if (picked.length === 0) {
        toast.error(tr("noCvsFound"));
        return;
      }
      openCvExport(picked);
    } catch {
      toast.error(tr("exportListError"));
    } finally {
      setExportPreparing(false);
    }
  };

  // ── Handlers ────────────────────────────────────────────
  const handleEdit = async (values: Record<string, string>) => {
    const item = editItem!;
    const { name = "", email = "", industry = "", ...profile } = values;
    // Name and email belong to the account. The profile route refuses to write
    // them (account-takeover fix W1-1), so they go through the admin user
    // route, which also keeps the profile's display name in step.
    const account: Record<string, string> = {};
    if (name.trim() && name.trim() !== (item.fullName || item.userId?.name || "")) account.name = name.trim();
    if (email.trim() && email.trim().toLowerCase() !== (item.email ?? item.userId?.email ?? "").toLowerCase()) {
      account.email = email.trim().toLowerCase();
    }
    if (Object.keys(account).length > 0) {
      if (!item.userId?._id) throw new FormError(tf("notFound"));
      const accountRes = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: item.userId._id, ...account }),
      });
      if (!accountRes.ok) {
        throw await formErrorFromResponse(accountRes, { t: tf, locale, fieldLabels: editFields, conflict: tf("emailInUse") });
      }
    }
    // When admin sets industry, mark it as manual override
    if (industry.trim()) {
      profile.industry = industry.trim();
      profile.industrySource = "manual";
    }
    const res = await fetch(`/api/job-seekers/${item._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
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
  // The bar's fields show every filter they own, so only the ones without a
  // field (set by AI search) need a chip.
  const filterChips = allFilterChips.filter((chip) => FIELDLESS_FILTER_KEYS.includes(chip.key));
  const removeFilterChip = (chip: JobSeekerFilterChip) => {
    if (chip.clear === "search") {
      changeSearch("");
    } else {
      updateFilters(chip.clear);
    }
  };
  const canUpdate = can("job_seekers", "update");
  const canDelete = can("job_seekers", "delete");
  const columnCount = 10;
  const pageSelection = selection.pageState(jobSeekers);

  // Premium = the `premium` entry in badges[]; the route also re-stamps the
  // seeker's applications as priority (or takes it back).
  const [premiumPendingId, setPremiumPendingId] = useState<string | null>(null);
  const togglePremium = async (js: JobSeeker) => {
    const next = !(js.badges ?? []).includes("premium");
    const name = js.fullName || js.userId?.name || "";
    setPremiumPendingId(js._id);
    try {
      const res = await fetch(`/api/job-seekers/${js._id}/premium`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ premium: next }),
      });
      if (!res.ok) {
        toast.error(tr("premiumUpdateError"));
        return;
      }
      setJobSeekers((rows) => rows.map((r) => r._id !== js._id ? r : {
        ...r, badges: next ? [...(r.badges ?? []), "premium"] : (r.badges ?? []).filter((b) => b !== "premium"),
      }));
      toast.success(next ? tr("premiumGranted", { name }) : tr("premiumRevoked", { name }));
    } catch {
      toast.error(tr("premiumUpdateError"));
    } finally {
      setPremiumPendingId(null);
    }
  };

  const rowActionsFor = (js: JobSeeker): { quick: RowAction[]; menu: RowAction[] } => {
    const inactive = js.userId?.isActive === false;
    const isPremium = (js.badges ?? []).includes("premium");
    const name = seekerName(js) || "CV";
    const { hasCv, canBuildCv } = seekerCvAvailability(js);
    return {
      // View CV opens the Standardised CV, which is made from the profile, so it
      // is offered for someone with no upload too, but not when there is neither a file
      // nor profile content to build one from (same rule as the super-agent profile panel).
      quick: hasCv || canBuildCv
        ? [{ key: "cv", label: tr("viewCvTitle"), icon: Eye, onSelect: () => setViewCv({ id: js._id, name }) }]
        : [],
      menu: [
        ...(js.cv?.originalUrl
          ? [{ key: "originalCv", label: tViewer("originalCv"), icon: FileText, onSelect: () => setViewCv({ id: js._id, name, source: "file" as const }) }]
          : []),
        ...(canUpdate ? [
          { key: "edit", label: tr("actionEditTitle"), icon: Pencil, onSelect: () => setEditItem(js) },
          {
            key: "premium",
            label: isPremium ? tr("removePremium") : tr("makePremium"),
            icon: Crown,
            iconClassName: "text-amber-600",
            pending: premiumPendingId === js._id,
            disabled: premiumPendingId === js._id,
            onSelect: () => { void togglePremium(js); },
          },
        ] : []),
        ...(canDelete ? [
          inactive
            ? { key: "reactivate", label: tr("actionReactivateTitle"), icon: RotateCcw, onSelect: () => void handleReactivate(js._id) }
            : { key: "deactivate", label: tr("actionDeactivateTitle"), icon: Ban, destructive: true, onSelect: () => void handleDelete(js._id) },
          { key: "delete", label: tr("actionDeletePermanentlyTitle"), icon: Trash2, destructive: true, onSelect: () => void handlePermanentDelete(js._id) },
        ] : []),
      ],
    };
  };

  return (
    <div className="page-container">
      {ConfirmDialogNode}

      <DashboardPageHeader
        compact
        compactOnMobile
        title={tr("heroTitle")}
        description={tr("heroDescription")}
      />

      {/* ── Filters ───────────────────────────────────────── */}
      <JobSeekersFilterPanel
        search={search}
        onSearchChange={changeSearch}
        filters={filters}
        onFiltersChange={updateFilters}
        aiLoading={aiLoading}
        aiSummary={aiSummary}
        onAiSearch={() => { void handleAiSearch(); }}
        onClear={activeFilterCount > 0 || aiSummary ? clearAllFilters : undefined}
        clearLabel={tr("clearFilters")}
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
        exportExtra={(
          <DropdownMenuItem onClick={() => void handleCvExportMenu()} disabled={exportPreparing}>
            {exportPreparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            {tr("downloadCvsButton")}
          </DropdownMenuItem>
        )}
        chips={filterChips.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
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
        ) : undefined}
      />

      {/* Seekers per industry; a chip filters the list (rollout rows 14/17). */}
      <IndustryChips
        counts={industryCounts}
        selected={filters.industry ?? ""}
        onSelect={(next) => updateFilters({ ...filters, industry: next })}
      />

      {/* ── List ──────────────────────────────────────────── */}
      {/* Phones: the cards sit straight on the page; a box around bordered cards doubled border and padding. */}
      <section className="workspace-panel-surface overflow-hidden rounded-2xl max-sm:!overflow-visible max-sm:!border-0 max-sm:!bg-transparent max-sm:!p-0 max-sm:!shadow-none">
        {loadError ? (
          <div className="p-6">
            <ErrorState onRetry={fetchJobSeekers} />
          </div>
        ) : (
        <>
        <div className="sm:hidden">
          {/* Phones have no header row, so the page's select-all sits above the cards. */}
          {!loading && jobSeekers.length > 0 && (
            <label className="mb-2 flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border/70 bg-card px-3 text-sm font-medium">
              <Checkbox
                checked={pageSelection === "all" ? true : pageSelection === "some" ? "indeterminate" : false}
                onCheckedChange={() => selection.togglePage(jobSeekers)}
                aria-label={tSelect("selectAllOnPage")}
              />
              {tSelect("selectAllOnPage")}
            </label>
          )}
          <JobSeekerMobileList
            seekers={jobSeekers}
            loading={loading}
            selection={{
              isSelected: selection.isSelected,
              onToggle: selection.toggle,
              label: (name) => tSelect("selectRow", { name }),
            }}
            hrefFor={(js) => `/${locale}/admin/job-seekers/${js._id}`}
            availabilityLabels={availabilityLabels}
            empty={(
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
            )}
            renderActions={(js) => {
              // Phones: View CV joins the menu, so the card needs no actions line.
              const { quick, menu } = rowActionsFor(js);
              return <RowActions name={js.fullName || js.userId?.name || js.email || ""} quick={[]} menu={[...quick, ...menu]} />;
            }}
          />
        </div>

        {/* Phones get JobSeekerMobileList above; "scroll" keeps the
            ResponsiveTables card fallback off this hidden table. */}
        <Table data-mobile-table="scroll" className="max-sm:hidden">
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="w-10">
                <Checkbox
                  aria-label={tSelect("selectAllOnPage")}
                  className="tap-target-box"
                  checked={pageSelection === "all" ? true : pageSelection === "some" ? "indeterminate" : false}
                  onCheckedChange={() => selection.togglePage(jobSeekers)}
                />
              </TableHead>
              <TableHead>
                <div className="flex items-center gap-1.5">
                  <span>{tr("tableHeaderName")}</span>
                  <CandidateDataNotice variant="candidateList" compact />
                </div>
              </TableHead>
              <TableHead>{tr("tableHeaderProfession")}</TableHead>
              <TableHead>{tr("tableHeaderNationality")}</TableHead>
              <TableHead>{tr("tableHeaderIndustry")}</TableHead>
              <TableHead>{tr("tableHeaderSkills")}</TableHead>
              {/* Wraps to two lines: nowrap made this the widest column. */}
              <TableHead className="whitespace-normal">
                <SortableTableHeader
                  label={tr("tableHeaderProfilePercent")}
                  active={currentSort.field === "profile"}
                  order={currentSort.order}
                  onClick={() => sortByColumn("profile")}
                />
              </TableHead>
              {/* Gives way below ~1360px so the actions menu stays on screen;
                  the expanded row shows the date instead. */}
              <TableHead className="hidden min-[1360px]:table-cell">
                <SortableTableHeader
                  label={tr("tableHeaderJoined")}
                  active={currentSort.field === "joined"}
                  order={currentSort.order}
                  onClick={() => sortByColumn("joined")}
                />
              </TableHead>
              <TableHead>{tr("tableHeaderReferredBy")}</TableHead>
              <TableHead className="text-right">{tr("tableHeaderActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initialLoading ? (
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
              <Fragment key={js._id}><TableRow className={`cursor-pointer hover:bg-muted/30 ${selection.isSelected(js._id) ? "bg-primary/5" : ""}`} onClick={(e) => { if (isRowToggleClick(e)) router.push(`/${locale}/admin/job-seekers/${js._id}`); }}>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    aria-label={tSelect("selectRow", { name: seekerName(js) || js.email || js.userId?.email || "—" })}
                    className="tap-target-box"
                    checked={selection.isSelected(js._id)}
                    onCheckedChange={() => selection.toggle(js)}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-start gap-2">
                    <UserAvatar name={js.fullName || js.userId?.name} email={js.email ?? js.userId?.email} className="h-9 w-9 shrink-0" colorful />
                    <div className="flex min-w-0 flex-col items-start gap-1">
                      {/* The full profile opens on its own page (was an inline "advanced view"). */}
                      <Link href={`/${locale}/admin/job-seekers/${js._id}`} className="font-medium hover:text-primary hover:underline">{js.fullName || js.userId?.name || "—"}</Link>
                      <span className="max-w-[10rem] truncate text-xs text-muted-foreground">{js.email ?? js.userId?.email ?? "—"}</span>
                      <span className="flex flex-wrap items-center gap-1">
                        <StatusBadge status={js.userId?.isActive === false ? "inactive" : (js.status ?? "active")} />
                        {js.badges?.includes("premium") && (
                          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                            <Crown className="h-3 w-3" aria-hidden="true" />
                            {tr("premiumChip")}
                          </span>
                        )}
                      </span>
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
                <TableCell className="text-xs text-muted-foreground">
                  {js.industry ? (
                    <span className="inline-block rounded-md bg-muted px-2 py-1 text-xs font-medium">{js.industry}</span>
                  ) : "—"}
                </TableCell>
                <TableCell className="max-w-[16rem] text-xs text-muted-foreground">
                  <span className="line-clamp-2">{js.skills?.length ? `${js.skills.slice(0, 2).join(", ")}${js.skills.length > 2 ? ` +${js.skills.length - 2}` : ""}` : "—"}</span>
                  <span className="mt-1 block">{js.totalExperienceYears != null ? `${js.totalExperienceYears}y` : "—"}</span>
                </TableCell>
                <TableCell className="text-xs font-semibold tabular-nums">
                  {js.profileCompleteness != null ? `${js.profileCompleteness}%` : "—"}
                </TableCell>
                <TableCell className="hidden whitespace-nowrap min-[1360px]:table-cell text-xs text-muted-foreground">{formatListDate(new Date(js.createdAt), locale)}</TableCell>
                <TableCell className="text-xs">
                  {js.referralSummary
                    ? <ReferralSourceChip namespace="adminJobSeekers" summary={js.referralSummary} />
                    : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <RowActions name={js.fullName || js.userId?.name || js.email || ""} labelsFrom="wide" {...rowActionsFor(js)} />
                </TableCell>
              </TableRow>

              </Fragment>
            ))}
          </TableBody>
        </Table>
        </>
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
          initialSource={viewCv.source}
          onClose={() => setViewCv(null)}
        />
      )}

      {/* ── CV export: the shared dialog, and the bar that starts it ── */}
      <CvExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        items={exportItems}
        detailsRows={exportDetails}
        onExported={selection.clear}
      />
      <SelectionBar count={selection.count} onClear={selection.clear}>
        <ExportCvsButton count={selection.count} onClick={() => openCvExport(selection.items)} />
      </SelectionBar>

      {/* ── Edit Modal ────────────────────────────────────── */}
      <CrudModal open={!!editItem} onClose={() => setEditItem(null)} title={tr("editModalTitle")} fields={editFields}
        initialValues={editItem ? { name: editItem.fullName || editItem.userId?.name || "", email: editItem.email ?? editItem.userId?.email ?? "", nationality: editItem.nationality ?? "", currentLocation: editItem.currentLocation ?? "", summary: editItem.summary ?? "", industry: editItem.industry ?? "" } : undefined}
        onSubmit={handleEdit} />
    </div>
  );
}
