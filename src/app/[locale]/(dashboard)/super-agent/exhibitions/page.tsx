"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { RowActions } from "@/components/shared/RowActions";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { TableBodySkeleton } from "@/components/ui/loading";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useTableExport } from "@/hooks/useTableExport";
import type { ExportColumn } from "@/lib/export";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  CalendarDays, Clock, Inbox, MapPin, Mail,
  ThumbsUp, ThumbsDown, Eye,
  RotateCcw,
} from "lucide-react";
import { exhibitionFiltersAreActive } from "@/components/features/exhibitions/ExhibitionHeroFilters";
import { csrfFetch } from "@/lib/security/csrf-client";
import { useTranslations, useLocale } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { usePagination } from "@/hooks/usePagination";
import { useUrlFilters } from "@/hooks/useUrlFilter";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { ApprovalTimeline } from "@/components/features/exhibitions/ApprovalTimeline";
import { SuperAgentSection } from "@/components/features/super-agent/WorkspacePage";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { formatCount, formatDate } from "@/lib/ui/intlFormat";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ExhibitionRequest {
  _id: string;
  agentId: { _id: string; name: string; email: string };
  eventName: string;
  eventCategory: string;
  eventLocation: string;
  venue?: string;
  country?: string;
  eventStartDate: string;
  eventEndDate: string;
  organizerName?: string;
  participationTypes: string[];
  participationDetails?: string;
  objectives: string[];
  estimatedBudget: number;
  /** Advisory figure from this role's operational approval; admin sets the binding one. */
  recommendedBudget?: number;
  approvedBudget?: number;
  budgetBreakdown?: { travel: number; accommodation: number; marketingMaterial: number; stallCost: number; miscellaneous: number };
  budgetCurrency: string;
  description?: string;
  executionPlan?: string;
  expectedOutcome?: string;
  expectedLeads?: number;
  requiredResources: string[];
  priority: string;
  status: string;
  reviewedBy?: { _id: string; name: string };
  reviewedAt?: string;
  reviewNote?: string;
  statusHistory?: { status: string; changedAt: string; changedBy?: { _id: string; name: string }; note?: string; approverRole?: string; statusReason?: string }[];
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-100 text-blue-800",
  under_review: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  revision_requested: "bg-orange-100 text-orange-800",
  budget_approved: "bg-teal-100 text-teal-800",
  resources_assigned: "bg-indigo-100 text-indigo-800",
  active: "bg-purple-100 text-purple-800",
  completed: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  archived: "bg-slate-100 text-slate-600",
};

const STATUS_LABEL_KEYS: Record<string, string> = {
  draft: "statusDraft", submitted: "statusSubmitted", under_review: "statusUnderReview",
  approved: "statusApproved", revision_requested: "statusRevisionRequested",
  budget_approved: "statusBudgetApproved", resources_assigned: "statusResourcesAssigned",
  active: "statusActive", completed: "statusCompleted", rejected: "statusRejected", archived: "statusArchived",
};

// Helper to resolve status labels with translations
function getStatusLabels(t: ReturnType<typeof useTranslations>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(STATUS_LABEL_KEYS).map(([key, labelKey]) => [key, t(labelKey)])
  );
}

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-600",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const PRIORITY_LABEL_KEYS: Record<string, string> = {
  low: "priorityLow", medium: "priorityMedium",
  high: "priorityHigh", critical: "priorityCritical",
};

// Helper to resolve priority labels with translations
function getPriorityLabels(t: ReturnType<typeof useTranslations>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(PRIORITY_LABEL_KEYS).map(([key, labelKey]) => [key, t(labelKey)])
  );
}

const CATEGORY_LABEL_KEYS: Record<string, string> = {
  career_fair: "categoryCareerFair", recruitment_expo: "categoryRecruitmentExpo",
  employer_branding: "categoryEmployerBranding", hiring_drive: "categoryHiringDrive",
  university_event: "categoryUniversityEvent", gcc_recruitment: "categoryGccRecruitment",
  job_fair: "categoryJobFair", other: "categoryOther",
};

// Helper to resolve category labels with translations
function getCategoryLabels(t: ReturnType<typeof useTranslations>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(CATEGORY_LABEL_KEYS).map(([key, labelKey]) => [key, t(labelKey)])
  );
}

const OBJECTIVE_LABEL_KEYS: Record<string, string> = {
  employer_acquisition: "objectiveEmployerAcquisition", candidate_sourcing: "objectiveCandidateSourcing",
  brand_awareness: "objectiveBrandAwareness", lead_generation: "objectiveLeadGeneration",
  direct_hiring: "objectiveDirectHiring", market_expansion: "objectiveMarketExpansion",
};

// Helper to resolve objective labels with translations
function getObjectiveLabels(t: ReturnType<typeof useTranslations>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(OBJECTIVE_LABEL_KEYS).map(([key, labelKey]) => [key, t(labelKey)])
  );
}

const RESOURCE_LABEL_KEYS: Record<string, string> = {
  brochures: "resourceBrochures", standee: "resourceStandee", flyers: "resourceFlyers",
  presentation_deck: "resourcePresentationDeck", employer_catalog: "resourceEmployerCatalog",
  candidate_forms: "resourceCandidateForms", branding_banners: "resourceBrandingBanners",
  video_assets: "resourceVideoAssets", business_cards: "resourceBusinessCards", booth_design: "resourceBoothDesign",
};

// Helper to resolve resource labels with translations
function getResourceLabels(t: ReturnType<typeof useTranslations>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(RESOURCE_LABEL_KEYS).map(([key, labelKey]) => [key, t(labelKey)])
  );
}

const PARTICIPATION_LABEL_KEYS: Record<string, string> = {
  standee: "participationStandee", stall: "participationStall", booth: "participationBooth", sponsorship: "participationSponsorship",
  flyers: "participationFlyers", recruitment_desk: "participationRecruitmentDesk", branding_package: "participationBrandingPackage", other: "participationOther",
};

// Helper to resolve participation labels with translations
function getParticipationLabels(t: ReturnType<typeof useTranslations>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(PARTICIPATION_LABEL_KEYS).map(([key, labelKey]) => [key, t(labelKey)])
  );
}

// Helper to create status options with translations
function getStatusOptions(t: ReturnType<typeof useTranslations>, allLabel: string) {
  const statusLabels = getStatusLabels(t);
  return [
    { value: "all", label: allLabel },
    { value: "pending_review", label: t("statusPendingReview") },
    { value: "submitted", label: statusLabels.submitted },
    { value: "under_review", label: statusLabels.under_review },
    { value: "approved", label: statusLabels.approved },
    { value: "revision_requested", label: statusLabels.revision_requested },
    { value: "budget_approved", label: statusLabels.budget_approved },
    { value: "active", label: statusLabels.active },
    { value: "completed", label: statusLabels.completed },
    { value: "rejected", label: statusLabels.rejected },
  ];
}

// Helper to create priority options with translations
function getPriorityOptions(t: ReturnType<typeof useTranslations>, allLabel: string) {
  const priorityLabels = getPriorityLabels(t);
  return [
    { value: "all", label: allLabel },
    { value: "low", label: priorityLabels.low },
    { value: "medium", label: priorityLabels.medium },
    { value: "high", label: priorityLabels.high },
    { value: "critical", label: priorityLabels.critical },
  ];
}

// Helper to create category options with translations
function getCategoryOptions(t: ReturnType<typeof useTranslations>, allLabel: string) {
  const categoryLabels = getCategoryLabels(t);
  return [
    { value: "all", label: allLabel },
    ...Object.entries(categoryLabels).map(([value, label]) => ({ value, label })),
  ];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SuperAgentExhibitionsPage() {
  const t = useTranslations("exhibitions");
  const tc = useTranslations("common");
  const tf = useTranslations("exhibitionHeroFilters");
  const locale = useLocale();
  const statusLabels = getStatusLabels(t);
  const priorityLabels = getPriorityLabels(t);
  const categoryLabels = getCategoryLabels(t);
  const objectiveLabels = getObjectiveLabels(t);
  const resourceLabels = getResourceLabels(t);
  const participationLabels = getParticipationLabels(t);
  const statusOptions = getStatusOptions(t, tf("allStatuses"));
  const priorityOptions = getPriorityOptions(t, tf("allPriorities"));
  const categoryOptions = getCategoryOptions(t, tf("allCategories"));
  const {
    page, limit, total, totalPages,
    setPage, setLimit, updateTotal, resetPage, paginationParams,
  } = usePagination();

  const [items, setItems] = useState<ExhibitionRequest[]>([]);
  // Queue depth comes from the API's scope-wide aggregate. Counting `items`
  // only ever saw the current page, so the header under-reported past page 1.
  const [pendingReview, setPendingReview] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const { filters, setFilter, resetFilters } = useUrlFilters(
    { status: "all", priority: "all", category: "all", search: "" },
    { debounceKeys: ["search"], debounceMs: 400 }
  );

  // Review dialog
  const [reviewItem, setReviewItem] = useState<ExhibitionRequest | null>(null);
  const [reviewAction, setReviewAction] = useState<string>("");
  const [reviewNote, setReviewNote] = useState("");
  const [approvedBudget, setApprovedBudget] = useState("");
  const [budgetError, setBudgetError] = useState("");

  // Detail dialog
  const [detailItem, setDetailItem] = useState<ExhibitionRequest | null>(null);
  // BUG-09: sidebar badge reads /api/super-agent/action-counts (60s stale).
  // Invalidate it on approve/reject/revise so the badge drops with the queue.
  const queryClient = useQueryClient();

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const params = paginationParams();
      if (filters.status !== "all") params.set("status", filters.status);
      if (filters.priority !== "all") params.set("priority", filters.priority);
      if (filters.category !== "all") params.set("category", filters.category);
      if (filters.search.trim()) params.set("search", filters.search.trim());
      const res = await fetch(`/api/exhibitions?${params}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items ?? []);
        setPendingReview(data.summary?.pendingReview ?? 0);
        updateTotal(data.total ?? 0);
      } else {
        setLoadError(true);
      }
    } catch { setLoadError(true); } finally { setLoading(false); }
  }, [filters, t, page, limit, paginationParams, updateTotal]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleReview = async () => {
    if (!reviewItem || !reviewAction) return;
    try {
      const trimmedNote = reviewNote.trim() || undefined;
      const payload: Record<string, unknown> = { status: reviewAction, reviewNote: trimmedNote, statusReason: trimmedNote };
      if (approvedBudget) {
        // The server rejects these too; catching them here means the dialog
        // stays open on the offending field instead of closing on a failure.
        const parsed = Number(approvedBudget);
        if (!Number.isFinite(parsed) || parsed < 0) {
          setBudgetError(t("reviewBudgetInvalid"));
          return;
        }
        payload.approvedBudget = parsed;
      }
      const res = await csrfFetch(`/api/exhibitions/${reviewItem._id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (res.ok) {
        const actionMap: Record<string, string> = {
          rejected: "toastExhibitionRejected",
          revision_requested: "toastExhibitionRevisionRequested",
          approved: "toastExhibitionApproved",
        };
        toast.success(t(actionMap[reviewAction] || "toastExhibitionApproved"));
        setReviewItem(null); setReviewNote(""); setApprovedBudget(""); setBudgetError(""); fetchItems();
        void queryClient.invalidateQueries({ queryKey: ["super-agent", "action-counts"] });
      } else { const err = await res.json(); toast.error(err.error ?? t("errorUpdatingExhibition")); }
    } catch { toast.error(t("errorUpdatingExhibition")); }
  };

  const openReview = (item: ExhibitionRequest, action: string) => {
    setReviewItem(item); setReviewAction(action); setReviewNote(""); setBudgetError("");
    // Prefill this role's own previous recommendation, not the admin's binding
    // figure — the dialog writes a recommendation and must not look like it is
    // about to overwrite an approved budget.
    setApprovedBudget(item.recommendedBudget?.toString() ?? item.estimatedBudget?.toString() ?? "");
  };

  const fmtDate = (d: string | undefined | null) => formatDate(d, { day: "2-digit", month: "short", year: "numeric" }, locale);
  const dayCount = (s: string | undefined | null, e: string | undefined | null) => {
    if (!s || !e) return null;
    const start = new Date(s);
    const end = new Date(e);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
  };

  const hasActiveFilters = exhibitionFiltersAreActive(filters.search, filters.status, filters.priority, filters.category);
  // A narrower filter on page 3 used to stay on page 3 and show an empty list.
  const applyFilter = (key: "search" | "status" | "priority" | "category", value: string) => {
    setFilter(key, value);
    resetPage();
  };

  const exportColumns = useMemo<ExportColumn<ExhibitionRequest>[]>(() => [
    { header: t("tableHeaderEvent"), key: "eventName" },
    { header: t("tableHeaderCategory"), key: "eventCategory", formatter: (_v, row) => categoryLabels[row.eventCategory] ?? row.eventCategory },
    { header: t("tableHeaderLocation"), key: "eventLocation", formatter: (_v, row) => [row.eventLocation, row.country].filter(Boolean).join(", ") },
    { header: t("tableHeaderAgent"), key: "agentId", formatter: (_v, row) => row.agentId?.name ?? "" },
    { header: t("tableHeaderStatus"), key: "status", formatter: (_v, row) => statusLabels[row.status] ?? row.status },
    { header: t("tableHeaderPriority"), key: "priority", formatter: (_v, row) => priorityLabels[row.priority] ?? row.priority },
    { header: t("tableHeaderDates"), key: "eventStartDate", formatter: (_v, row) => `${fmtDate(row.eventStartDate)} – ${fmtDate(row.eventEndDate)}` },
    { header: t("tableHeaderBudget"), key: "estimatedBudget", formatter: (_v, row) => `${row.budgetCurrency} ${formatCount(row.estimatedBudget)}` },
    { header: t("detailBudgetApproved"), key: "approvedBudget", formatter: (_v, row) => typeof row.approvedBudget === "number" ? `${row.budgetCurrency} ${formatCount(row.approvedBudget)}` : "" },
    { header: t("detailSubmitted"), key: "createdAt", formatter: (_v, row) => fmtDate(row.createdAt) },
  ], [t, locale]);
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: items as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "super-agent-exhibitions",
    title: t("exhibitionManagement"),
  });

  return (
    <div className="page-container">
      <DashboardPageHeader
        icon={CalendarDays}
        title={t("exhibitionManagement")}
        description={t("exhibitionManagementDesc")}
        summary={{ label: t("queueHealth"), value: formatCount(pendingReview), note: t("queueHealthNote") }}
      />

      {/* Filters sat in the page header behind a Show/Hide toggle, so the
          search was one click away and the page had no export. Same standalone
          row as every other list in the role. */}
      <SuperAgentSection>
        <InlineFilterBar
          className="mb-4"
          onClear={hasActiveFilters ? () => { resetFilters(); resetPage(); } : undefined}
          onExportCsv={handleExportCsv}
          onExportExcel={handleExportExcel}
          onExportPdf={handleExportPdf}
        >
          <InlineFilterSearch value={filters.search} onChange={(v) => applyFilter("search", v)} placeholder={t("searchPlaceholder")} />
          <SearchableSelect
            id="sa-exhibitions-status"
            className={INLINE_FILTER_CONTROL}
            options={statusOptions}
            value={filters.status}
            onValueChange={(v) => applyFilter("status", v)}
            placeholder={tf("allStatuses")}
          />
          <SearchableSelect
            id="sa-exhibitions-priority"
            className={INLINE_FILTER_CONTROL}
            options={priorityOptions}
            value={filters.priority}
            onValueChange={(v) => applyFilter("priority", v)}
            placeholder={tf("allPriorities")}
          />
          <SearchableSelect
            id="sa-exhibitions-category"
            className={INLINE_FILTER_CONTROL}
            options={categoryOptions}
            value={filters.category}
            onValueChange={(v) => applyFilter("category", v)}
            placeholder={tf("allCategories")}
          />
        </InlineFilterBar>

        {loadError ? (
          <ErrorState description={t("fetchError")} onRetry={() => void fetchItems()} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead>{t("tableHeaderEvent")}</TableHead>
                  <TableHead>{t("tableHeaderStatus")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("tableHeaderAgent")}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t("tableHeaderDates")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("tableHeaderBudget")}</TableHead>
                  <TableHead className="text-right">{t("tableHeaderActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableBodySkeleton rows={5} cols={6} />
                ) : items.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6} className="py-12">
                      <EmptyState title={t("noExhibitionRequestsFound")} description={t("tryAdjustingFiltersExhibitions")} icon={Inbox} />
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item, idx) => {
                    const days = dayCount(item.eventStartDate, item.eventEndDate);
                    return (
                      <TableRow
                        key={item._id}
                        onClick={(event) => {
                          // Below 640px the shared table enhancer turns each row
                          // into a collapsible card and the row's own tap toggles
                          // it. Opening the dialog there would fire both, so the
                          // eye button stays the phone entry point.
                          const cardMode =
                            event.currentTarget.hasAttribute("data-mobile-collapsible") &&
                            (typeof window.matchMedia !== "function" || window.matchMedia("(max-width: 639px)").matches);
                          if (cardMode) return;
                          setDetailItem(item);
                        }}
                        className={`group transition-colors hover:bg-muted/30 ${idx % 2 === 0 ? "bg-background" : "bg-muted/15"}`}
                      >
                        <TableCell>
                          {/* The name is user-entered and often long. Capped at two
                              lines so one verbose title cannot set the height of
                              every row in the queue. */}
                          <button type="button" onClick={(e) => { e.stopPropagation(); setDetailItem(item); }} className="line-clamp-2 text-start text-sm font-semibold leading-5 text-foreground hover:text-primary hover:underline">{item.eventName}</button>
                          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                            <span className="truncate">{categoryLabels[item.eventCategory] ?? item.eventCategory}</span>
                            {item.eventLocation ? (
                              <span className="inline-flex min-w-0 items-center gap-1">
                                <span aria-hidden="true">·</span>
                                <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                                <span className="truncate">{item.eventLocation}</span>
                              </span>
                            ) : null}
                          </p>
                        </TableCell>
                        <TableCell>
                          {/* `whitespace-nowrap`: in a narrow column "Under Review"
                              broke onto two lines and the reviewer's name onto two
                              more, which made the status the tallest cell in the row. */}
                          <div className="flex flex-wrap items-center gap-1">
                            <Badge className={`${STATUS_COLORS[item.status]} whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold`}>{statusLabels[item.status] ?? item.status}</Badge>
                            <Badge className={`${PRIORITY_COLORS[item.priority] ?? PRIORITY_COLORS.medium} whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold`}>{priorityLabels[item.priority] ?? item.priority}</Badge>
                          </div>
                          {item.reviewedBy && <p className="mt-0.5 truncate text-[11px] leading-4 text-muted-foreground">{item.reviewedBy.name}</p>}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex min-w-0 items-center gap-2">
                            <UserAvatar name={item.agentId?.name} email={item.agentId?.email} className="h-8 w-8 shrink-0" colorful />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium leading-5">{item.agentId?.name}</p>
                              <p className="flex items-center gap-1 truncate text-xs leading-4 text-muted-foreground">
                                <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
                                <span className="truncate">{item.agentId?.email}</span>
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden whitespace-nowrap sm:table-cell">
                          <p className="text-xs font-medium">{fmtDate(item.eventStartDate)} – {fmtDate(item.eventEndDate)}</p>
                          {days ? <p className="mt-0.5 text-[11px] text-muted-foreground">{t("tableDayCount", { count: days })}</p> : null}
                        </TableCell>
                        <TableCell className="hidden whitespace-nowrap lg:table-cell">
                          <p className="text-sm font-medium">{item.budgetCurrency} {formatCount(item.estimatedBudget)}</p>
                          {item.approvedBudget ? (
                            <p className="mt-0.5 text-[11px] font-medium text-emerald-600">{t("tableBudgetApprovedShort")} {item.budgetCurrency} {formatCount(item.approvedBudget)}</p>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right">
                          {/* One primary action plus an overflow menu, on a single
                              nowrap line. Approve/Revise/Reject as three side-by-side
                              buttons could not fit this column, so they wrapped into a
                              three-high stack that set the height of the whole row —
                              the single biggest cost in the queue. Revise and Reject
                              are the rarer choices, so they move behind the menu. */}
                          <div className="flex flex-nowrap items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                            <RowActions
                              name={item.eventName}
                              quick={[
                                { key: "view", label: t("viewDetails"), icon: Eye, iconOnly: true, onSelect: () => setDetailItem(item) },
                                ...(item.status === "submitted" ? [{ key: "review", label: t("actionReview"), icon: Clock, iconClassName: "text-amber-600", onSelect: () => openReview(item, "under_review") }] : []),
                                ...(item.status === "under_review" ? [{ key: "approve", label: t("actionApprove"), icon: ThumbsUp, iconClassName: "text-emerald-600", onSelect: () => openReview(item, "approved") }] : []),
                              ]}
                              menu={[
                                ...(item.status === "under_review" ? [
                                  { key: "revise", label: t("actionRevise"), icon: RotateCcw, iconClassName: "text-orange-600", onSelect: () => openReview(item, "revision_requested") },
                                  { key: "reject", label: t("actionReject"), icon: ThumbsDown, destructive: true, onSelect: () => openReview(item, "rejected") },
                                ] : []),
                              ]}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </SuperAgentSection>
      <PaginationControls
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={setLimit}
      />

      {/* Detail Modal */}
      <Dialog open={!!detailItem} onOpenChange={() => setDetailItem(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {detailItem && (<>
            <DialogHeader className="pe-10">
              <DialogTitle className="flex flex-wrap items-center gap-2">{detailItem.eventName}<Badge className={STATUS_COLORS[detailItem.status]}>{statusLabels[detailItem.status]}</Badge><Badge className={PRIORITY_COLORS[detailItem.priority] ?? PRIORITY_COLORS.medium}>{priorityLabels[detailItem.priority] ?? detailItem.priority}</Badge></DialogTitle>
              <DialogDescription>{categoryLabels[detailItem.eventCategory]} · {detailItem.eventLocation} {detailItem.country ? `· ${detailItem.country}` : ""}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              {/* Everything the queue row no longer shows lives here: the
                  table was 12 columns wide and scrolled sideways, so it now
                  carries only what a reviewer scans, and this panel carries
                  the full request. */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div><span className="text-muted-foreground">{t("detailAgent")}:</span> <strong>{detailItem.agentId?.name}</strong>{detailItem.agentId?.email ? <span className="block text-xs text-muted-foreground">{detailItem.agentId.email}</span> : null}</div>
                <div><span className="text-muted-foreground">{t("tableHeaderLocation")}:</span> {[detailItem.eventLocation, detailItem.country].filter(Boolean).join(` · `) || "—"}</div>
                <div><span className="text-muted-foreground">{t("detailVenue")}:</span> {detailItem.venue ?? "—"}</div>
                <div><span className="text-muted-foreground">{t("detailOrganizer")}:</span> {detailItem.organizerName ?? "—"}</div>
                <div><span className="text-muted-foreground">{t("detailDates")}:</span> {fmtDate(detailItem.eventStartDate)}{detailItem.eventEndDate ? ` – ${fmtDate(detailItem.eventEndDate)}` : ""}{dayCount(detailItem.eventStartDate, detailItem.eventEndDate) ? ` (${dayCount(detailItem.eventStartDate, detailItem.eventEndDate)}d)` : ""}</div>
                <div><span className="text-muted-foreground">{t("detailSubmitted")}:</span> {fmtDate(detailItem.createdAt)}</div>
                <div><span className="text-muted-foreground">{t("detailBudgetRequested")}:</span> {detailItem.budgetCurrency} {formatCount(detailItem.estimatedBudget)}</div>
                <div><span className="text-muted-foreground">{t("detailBudgetRecommended")}:</span> {typeof detailItem.recommendedBudget === "number" ? `${detailItem.budgetCurrency} ${formatCount(detailItem.recommendedBudget)}` : "—"}</div>
                <div><span className="text-muted-foreground">{t("detailBudgetApproved")}:</span> {typeof detailItem.approvedBudget === "number" ? `${detailItem.budgetCurrency} ${formatCount(detailItem.approvedBudget)}` : "—"}</div>
                <div><span className="text-muted-foreground">{t("detailExpectedLeads")}:</span> {detailItem.expectedLeads ?? "—"}</div>
                <div><span className="text-muted-foreground">{t("detailReviewedBy")}:</span> {detailItem.reviewedBy?.name ?? "—"}{detailItem.reviewedAt ? ` · ${fmtDate(detailItem.reviewedAt)}` : ""}</div>
              </div>

              {detailItem.participationTypes?.length > 0 && (<div><p className="text-muted-foreground mb-1">{t("detailParticipation")}:</p><div className="flex flex-wrap gap-1">{detailItem.participationTypes.map((pt) => (<Badge key={pt} variant="outline">{participationLabels[pt] ?? pt}</Badge>))}</div>{detailItem.participationDetails ? <p className="mt-1 whitespace-pre-line text-sm">{detailItem.participationDetails}</p> : null}</div>)}
              {detailItem.objectives?.length > 0 && (<div><p className="text-muted-foreground mb-1">{t("detailObjectives")}:</p><div className="flex flex-wrap gap-1">{detailItem.objectives.map((o) => (<Badge key={o} variant="outline">{objectiveLabels[o] ?? o}</Badge>))}</div></div>)}
              {detailItem.requiredResources?.length > 0 && (<div><p className="text-muted-foreground mb-1">{t("detailRequiredResources")}:</p><div className="flex flex-wrap gap-1">{detailItem.requiredResources.map((r) => (<Badge key={r} variant="outline">{resourceLabels[r] ?? r}</Badge>))}</div></div>)}
              {detailItem.budgetBreakdown && (<div><p className="text-muted-foreground mb-1">{t("detailBudgetBreakdown")}:</p><div className="grid grid-cols-3 gap-2">{Object.entries(detailItem.budgetBreakdown).map(([k, v]) => (<div key={k} className="rounded border p-2 text-center"><p className="text-xs text-muted-foreground capitalize">{k.replace(/([A-Z])/g, " $1")}</p><p className="font-semibold">{detailItem.budgetCurrency} {formatCount(v as number)}</p></div>))}</div></div>)}
              {detailItem.description && <div><p className="text-muted-foreground">{t("detailDescription")}:</p><p className="whitespace-pre-line">{detailItem.description}</p></div>}
              {detailItem.executionPlan && <div><p className="text-muted-foreground">{t("detailExecutionPlan")}:</p><p className="whitespace-pre-line">{detailItem.executionPlan}</p></div>}
              {detailItem.expectedOutcome && <div><p className="text-muted-foreground">{t("detailExpectedOutcome")}:</p><p className="whitespace-pre-line">{detailItem.expectedOutcome}</p></div>}

              {detailItem.reviewNote && <div><p className="text-muted-foreground">{t("detailReviewNote")}:</p><p className="whitespace-pre-line">{detailItem.reviewNote}</p></div>}

              {/* Approval History */}
              {detailItem.statusHistory && detailItem.statusHistory.length > 0 && (
                <div>
                  <p className="text-muted-foreground mb-2 font-medium">{t("detailApprovalHistory")}:</p>
                  <ApprovalTimeline entries={detailItem.statusHistory} />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDetailItem(null)}>{tc("close")}</Button>
            </DialogFooter>
          </>)}
        </DialogContent>
      </Dialog>

      {/* Review Modal */}
      <Dialog open={!!reviewItem} onOpenChange={() => { setReviewItem(null); setReviewNote(""); setApprovedBudget(""); setBudgetError(""); }}>
        <DialogContent className="max-w-md">
          {reviewItem && (<>
            <DialogHeader>
              <DialogTitle>
                {reviewAction === "under_review" ? t("reviewStartReview") : reviewAction === "approved" ? t("reviewApproveExhibition") : reviewAction === "revision_requested" ? t("reviewRequestRevision") : t("reviewRejectExhibition")}
              </DialogTitle>
              <DialogDescription>
                {reviewItem.eventName} — {reviewItem.agentId?.name}
                {reviewAction === "approved" && (
                  <span className="mt-1 block text-[11px] text-amber-600">
                    {t("reviewOperationalApprovalOnly")}
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {reviewAction === "approved" && (
                <div>
                  <Label>{t("reviewRecommendedBudget")} ({reviewItem.budgetCurrency})</Label>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={approvedBudget}
                    onChange={(e) => { setApprovedBudget(e.target.value); setBudgetError(""); }}
                    aria-invalid={budgetError ? true : undefined}
                    placeholder={t("reviewRecommendedBudget")}
                  />
                  {budgetError
                    ? <p className="mt-1 text-xs font-medium text-destructive" role="alert">{budgetError}</p>
                    : <p className="text-xs text-muted-foreground mt-1">{t("reviewRequested")}: {reviewItem.budgetCurrency} {formatCount(reviewItem.estimatedBudget)}</p>}
                </div>
              )}
              <div>
                <Label>{reviewAction === "revision_requested" ? t("reviewRevisionNotes") : t("reviewNotes")}</Label>
                <Textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder={reviewAction === "revision_requested" ? t("reviewRevisionNotesPlaceholder") : t("reviewNotesPlaceholder")} rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => { setReviewItem(null); setReviewNote(""); setBudgetError(""); }}>{tc("cancel")}</Button>
              <Button onClick={handleReview}
                variant={reviewAction === "rejected" ? "destructive" : "default"}
                className={!["rejected"].includes(reviewAction) ? (reviewAction === "revision_requested" ? "bg-orange-600 hover:bg-orange-700" : "bg-emerald-600 hover:bg-emerald-700") : ""}
                disabled={reviewAction === "revision_requested" && !reviewNote.trim()}>
                {reviewAction === "rejected" ? t("actionReject") : reviewAction === "revision_requested" ? t("reviewRequestRevision") : tc("confirm")}
              </Button>
            </DialogFooter>
          </>)}
        </DialogContent>
      </Dialog>
    </div>
  );
}
