"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  CalendarDays, Clock, Inbox,
  MapPin, ThumbsUp, ThumbsDown, Eye,
  RotateCcw,
} from "lucide-react";
import {
  ExhibitionFilterTrigger,
  ExhibitionFilterClearButton,
  ExhibitionFilterPanel,
  exhibitionFiltersAreActive,
} from "@/components/features/exhibitions/ExhibitionHeroFilters";
import { csrfFetch } from "@/lib/security/csrf-client";
import { useTranslations, useLocale } from "next-intl";
import { usePagination } from "@/hooks/usePagination";
import { useUrlFilters } from "@/hooks/useUrlFilter";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { ApprovalTimeline } from "@/components/features/exhibitions/ApprovalTimeline";
import {
  SuperAgentDataTableShell,
  SuperAgentEmptyState,
  SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";
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
function getStatusOptions(t: ReturnType<typeof useTranslations>) {
  const statusLabels = getStatusLabels(t);
  return [
    { value: "all", label: t("tableHeaderStatus") },
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
function getPriorityOptions(t: ReturnType<typeof useTranslations>) {
  const priorityLabels = getPriorityLabels(t);
  return [
    { value: "all", label: t("tableHeaderPriority") },
    { value: "low", label: priorityLabels.low },
    { value: "medium", label: priorityLabels.medium },
    { value: "high", label: priorityLabels.high },
    { value: "critical", label: priorityLabels.critical },
  ];
}

// Helper to create category options with translations
function getCategoryOptions(t: ReturnType<typeof useTranslations>) {
  const categoryLabels = getCategoryLabels(t);
  return [
    { value: "all", label: t("tableHeaderDates") },
    ...Object.entries(categoryLabels).map(([value, label]) => ({ value, label })),
  ];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SuperAgentExhibitionsPage() {
  const t = useTranslations("exhibitions");
  const tc = useTranslations("common");
  const locale = useLocale();
  const statusLabels = getStatusLabels(t);
  const categoryLabels = getCategoryLabels(t);
  const objectiveLabels = getObjectiveLabels(t);
  const resourceLabels = getResourceLabels(t);
  const participationLabels = getParticipationLabels(t);
  const statusOptions = getStatusOptions(t);
  const priorityOptions = getPriorityOptions(t);
  const categoryOptions = getCategoryOptions(t);
  const {
    page, limit, total, totalPages,
    setPage, setLimit, updateTotal, resetPage, paginationParams,
  } = usePagination();

  const [items, setItems] = useState<ExhibitionRequest[]>([]);
  // Queue depth comes from the API's scope-wide aggregate. Counting `items`
  // only ever saw the current page, so the header under-reported past page 1.
  const [pendingReview, setPendingReview] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  const { filters, setFilter, resetFilters } = useUrlFilters(
    { status: "all", priority: "all", category: "all", search: "" },
    { debounceKeys: ["search"], debounceMs: 400 }
  );

  // Review dialog
  const [reviewItem, setReviewItem] = useState<ExhibitionRequest | null>(null);
  const [reviewAction, setReviewAction] = useState<string>("");
  const [reviewNote, setReviewNote] = useState("");
  const [approvedBudget, setApprovedBudget] = useState("");

  // Detail dialog
  const [detailItem, setDetailItem] = useState<ExhibitionRequest | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = paginationParams();
      if (filters.status !== "all") params.set("status", filters.status);
      if (filters.priority !== "all") params.set("priority", filters.priority);
      if (filters.category !== "all") params.set("category", filters.category);
      if (filters.search) params.set("search", filters.search);
      const res = await fetch(`/api/exhibitions?${params}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items ?? []);
        setPendingReview(data.summary?.pendingReview ?? 0);
        updateTotal(data.total ?? 0);
      }
    } catch { toast.error(t("fetchError")); } finally { setLoading(false); }
  }, [filters, t, page, limit, paginationParams, updateTotal]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleReview = async () => {
    if (!reviewItem || !reviewAction) return;
    try {
      const trimmedNote = reviewNote.trim() || undefined;
      const payload: Record<string, unknown> = { status: reviewAction, reviewNote: trimmedNote, statusReason: trimmedNote };
      if (approvedBudget) payload.approvedBudget = Number(approvedBudget);
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
        setReviewItem(null); setReviewNote(""); setApprovedBudget(""); fetchItems();
      } else { const err = await res.json(); toast.error(err.error ?? t("errorUpdatingExhibition")); }
    } catch { toast.error(t("errorUpdatingExhibition")); }
  };

  const openReview = (item: ExhibitionRequest, action: string) => {
    setReviewItem(item); setReviewAction(action); setReviewNote(""); setApprovedBudget(item.approvedBudget?.toString() ?? item.estimatedBudget?.toString() ?? "");
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
  return (
    <div className="page-container">
      <DashboardPageHeader
        icon={CalendarDays}
        title={t("exhibitionManagement")}
        description={t("exhibitionManagementDesc")}
        summary={{ label: t("queueHealth"), value: formatCount(pendingReview), note: t("queueHealthNote") }}
        actions={
          <div className="flex items-center gap-1">
            <ExhibitionFilterTrigger
              open={showFilters}
              onToggle={() => setShowFilters((value) => !value)}
              hasActiveFilters={hasActiveFilters}
            />
            {hasActiveFilters && <ExhibitionFilterClearButton onClear={resetFilters} />}
          </div>
        }
      >
        <ExhibitionFilterPanel
          open={showFilters}
          search={filters.search}
          onSearchChange={(v) => setFilter("search", v)}
          statusFilter={filters.status}
          onStatusChange={(v) => setFilter("status", v)}
          statusOptions={statusOptions}
          priorityFilter={filters.priority}
          onPriorityChange={(v) => setFilter("priority", v)}
          priorityOptions={priorityOptions}
          categoryFilter={filters.category}
          onCategoryChange={(v) => setFilter("category", v)}
          categoryOptions={categoryOptions}
          searchPlaceholder={t("searchPlaceholder")}
        />
      </DashboardPageHeader>

      <SuperAgentSection>
        {loading ? (
          <SuperAgentDataTableShell>
            <div className="border-b border-border/50 bg-muted/30 px-4 py-3.5"><div className="h-4 w-48 animate-pulse rounded bg-muted" /></div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={`flex items-center gap-4 border-b border-border/40 px-4 py-4 last:border-0 ${i % 2 === 0 ? "bg-background" : "bg-muted/15"}`}>
                <div className="h-4 w-36 animate-pulse rounded bg-muted/60" />
                <div className="hidden h-4 w-28 animate-pulse rounded bg-muted/40 md:block" />
                <div className="h-4 w-24 animate-pulse rounded bg-muted/50" />
                <div className="h-5 w-16 animate-pulse rounded-full bg-muted/40" />
                <div className="ml-auto h-8 w-20 animate-pulse rounded-lg bg-muted/30" />
              </div>
            ))}
          </SuperAgentDataTableShell>
        ) : items.length === 0 ? (
          <SuperAgentEmptyState icon={<Inbox className="h-8 w-8 text-muted-foreground" />} title={t("noExhibitionRequestsFound")} description={t("tryAdjustingFiltersExhibitions")} />
        ) : (
          <SuperAgentDataTableShell>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/25">
                    <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("tableHeaderEvent")}</th>
                    <th className="hidden px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground md:table-cell">{t("tableHeaderAgent")}</th>
                    <th className="hidden px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:table-cell">{t("tableHeaderLocation")}</th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("tableHeaderDates")}</th>
                    <th className="hidden px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:table-cell">{t("tableHeaderParticipation")}</th>
                    <th className="hidden px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground md:table-cell">{t("tableHeaderBudgetReq")}</th>
                    <th className="hidden px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:table-cell">{t("tableHeaderBudgetAppr")}</th>
                    <th className="hidden px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground xl:table-cell">{t("tableHeaderObjective")}</th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("tableHeaderStatus")}</th>
                    <th className="hidden px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground md:table-cell">{t("tableHeaderPriority")}</th>
                    <th className="hidden px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground xl:table-cell">{t("tableHeaderResources")}</th>
                    <th className="px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("tableHeaderActions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {items.map((item, idx) => {
                    const days = dayCount(item.eventStartDate, item.eventEndDate);
                    return (
                      <tr key={item._id} className={`transition-colors hover:bg-primary/[0.03] ${idx % 2 === 0 ? "bg-background" : "bg-muted/15"}`}>
                        <td className="px-4 py-3.5">
                          <button type="button" onClick={() => setDetailItem(item)} className="text-left font-semibold text-foreground hover:text-primary hover:underline">{item.eventName}</button>
                          <p className="mt-0.5 text-xs text-muted-foreground">{categoryLabels[item.eventCategory] ?? item.eventCategory}</p>
                        </td>
                        <td className="hidden px-4 py-3.5 md:table-cell">
                          <p className="text-sm font-medium">{item.agentId?.name}</p>
                          <p className="text-xs text-muted-foreground">{item.agentId?.email}</p>
                        </td>
                        <td className="hidden px-4 py-3.5 lg:table-cell">
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5 text-primary/60" /> {item.eventLocation}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5">
                          <p className="text-xs font-medium">{fmtDate(item.eventStartDate)} – {fmtDate(item.eventEndDate)}</p>
                          {days ? <p className="mt-0.5 text-[11px] text-muted-foreground">{days} days</p> : null}
                        </td>
                        <td className="hidden px-4 py-3.5 sm:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {(item.participationTypes ?? []).slice(0, 2).map((pt) => (<Badge key={pt} variant="outline" className="rounded-md border-primary/20 bg-primary/5 text-[11px] font-medium">{participationLabels[pt] ?? pt}</Badge>))}
                            {(item.participationTypes?.length ?? 0) > 2 && <Badge variant="outline" className="rounded-md text-[11px]">+{item.participationTypes.length - 2}</Badge>}
                          </div>
                        </td>
                        <td className="hidden whitespace-nowrap px-4 py-3.5 font-medium md:table-cell">{item.budgetCurrency} {formatCount(item.estimatedBudget)}</td>
                        <td className="hidden whitespace-nowrap px-4 py-3.5 md:table-cell lg:table-cell">{item.approvedBudget ? <span className="font-medium text-emerald-600">{item.budgetCurrency} {formatCount(item.approvedBudget)}</span> : <span className="text-muted-foreground">—</span>}</td>
                        <td className="hidden px-4 py-3.5 xl:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {(item.objectives ?? []).slice(0, 1).map((o) => (<Badge key={o} variant="outline" className="rounded-md text-[11px]">{objectiveLabels[o] ?? o}</Badge>))}
                            {(item.objectives?.length ?? 0) > 1 && <Badge variant="outline" className="rounded-md text-[11px]">+{item.objectives.length - 1}</Badge>}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <Badge className={`${STATUS_COLORS[item.status]} rounded-md px-2.5 py-0.5 text-[11px] font-semibold`}>{statusLabels[item.status] ?? item.status}</Badge>
                          {item.reviewedBy && <p className="mt-0.5 text-[11px] text-muted-foreground">by {item.reviewedBy.name}</p>}
                        </td>
                        <td className="hidden px-4 py-3.5 md:table-cell"><Badge className={`${PRIORITY_COLORS[item.priority] ?? PRIORITY_COLORS.medium} rounded-md px-2 py-0.5 text-[11px] font-semibold capitalize`}>{item.priority}</Badge></td>
                        <td className="hidden px-4 py-3.5 xl:table-cell"><span className="text-xs text-muted-foreground">{item.requiredResources?.length ?? 0} items</span></td>
                        <td className="px-4 py-3.5 text-right">
                          <div>
                            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end sm:w-auto">
                              <Button
                                variant="ghost"
                                size="iconDense"
                                className="max-sm:min-h-11 rounded-lg text-muted-foreground hover:text-primary"
                                onClick={() => setDetailItem(item)}
                                title={t("viewDetails")}
                                aria-label={t("viewDetails")}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              {item.status === "submitted" && (<Button size="sm" variant="outline" onClick={() => openReview(item, "under_review")} className="max-sm:min-h-11 rounded-lg border-amber-200 text-xs text-amber-700 hover:bg-amber-50"><Clock className="mr-1 h-3.5 w-3.5" /> {t("actionReview")}</Button>)}
                              {item.status === "under_review" && (<>
                                <Button size="sm" onClick={() => openReview(item, "approved")} className="max-sm:min-h-11 rounded-lg bg-emerald-600 text-xs text-white hover:bg-emerald-700"><ThumbsUp className="mr-1 h-3.5 w-3.5" /> {t("actionApprove")}</Button>
                                <Button size="sm" variant="outline" onClick={() => openReview(item, "revision_requested")} className="max-sm:min-h-11 rounded-lg border-orange-200 text-xs text-orange-700 hover:bg-orange-50"><RotateCcw className="mr-1 h-3.5 w-3.5" /> {t("actionRevise")}</Button>
                                <Button size="dense" variant="destructive" className="max-sm:min-h-11 rounded-lg text-xs" onClick={() => openReview(item, "rejected")}><ThumbsDown className="mr-1 h-3.5 w-3.5" /> {t("actionReject")}</Button>
                              </>)}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SuperAgentDataTableShell>
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detailItem && (<>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">{detailItem.eventName}<Badge className={STATUS_COLORS[detailItem.status]}>{statusLabels[detailItem.status]}</Badge><Badge className={PRIORITY_COLORS[detailItem.priority]}>{detailItem.priority}</Badge></DialogTitle>
              <DialogDescription>{categoryLabels[detailItem.eventCategory]} · {detailItem.eventLocation} {detailItem.country ? `· ${detailItem.country}` : ""}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">Agent:</span> <strong>{detailItem.agentId?.name}</strong></div>
                <div><span className="text-muted-foreground">Venue:</span> {detailItem.venue ?? "—"}</div>
              <div><span className="text-muted-foreground">Dates:</span> {fmtDate(detailItem.eventStartDate)}{detailItem.eventEndDate ? ` – ${fmtDate(detailItem.eventEndDate)}` : ""}{dayCount(detailItem.eventStartDate, detailItem.eventEndDate) ? ` (${dayCount(detailItem.eventStartDate, detailItem.eventEndDate)}d)` : ""}</div>
                <div><span className="text-muted-foreground">Organizer:</span> {detailItem.organizerName ?? "—"}</div>
                <div><span className="text-muted-foreground">Budget Requested:</span> {detailItem.budgetCurrency} {formatCount(detailItem.estimatedBudget)}</div>
                <div><span className="text-muted-foreground">Budget Approved:</span> {detailItem.approvedBudget ? `${detailItem.budgetCurrency} ${formatCount(detailItem.approvedBudget)}` : "—"}</div>
                <div><span className="text-muted-foreground">Expected Leads:</span> {detailItem.expectedLeads ?? "—"}</div>
              </div>

              {detailItem.participationTypes?.length > 0 && (<div><p className="text-muted-foreground mb-1">Participation:</p><div className="flex flex-wrap gap-1">{detailItem.participationTypes.map((pt) => (<Badge key={pt} variant="outline">{participationLabels[pt] ?? pt}</Badge>))}</div></div>)}
              {detailItem.objectives?.length > 0 && (<div><p className="text-muted-foreground mb-1">Objectives:</p><div className="flex flex-wrap gap-1">{detailItem.objectives.map((o) => (<Badge key={o} variant="outline">{objectiveLabels[o] ?? o}</Badge>))}</div></div>)}
              {detailItem.requiredResources?.length > 0 && (<div><p className="text-muted-foreground mb-1">Required Resources:</p><div className="flex flex-wrap gap-1">{detailItem.requiredResources.map((r) => (<Badge key={r} variant="outline">{resourceLabels[r] ?? r}</Badge>))}</div></div>)}
              {detailItem.budgetBreakdown && (<div><p className="text-muted-foreground mb-1">Budget Breakdown:</p><div className="grid grid-cols-3 gap-2">{Object.entries(detailItem.budgetBreakdown).map(([k, v]) => (<div key={k} className="rounded border p-2 text-center"><p className="text-xs text-muted-foreground capitalize">{k.replace(/([A-Z])/g, " $1")}</p><p className="font-semibold">{detailItem.budgetCurrency} {formatCount(v as number)}</p></div>))}</div></div>)}
              {detailItem.description && <div><p className="text-muted-foreground">Description:</p><p>{detailItem.description}</p></div>}
              {detailItem.executionPlan && <div><p className="text-muted-foreground">Execution Plan:</p><p>{detailItem.executionPlan}</p></div>}
              {detailItem.expectedOutcome && <div><p className="text-muted-foreground">Expected Outcome:</p><p>{detailItem.expectedOutcome}</p></div>}

              {/* Approval History */}
              {detailItem.statusHistory && detailItem.statusHistory.length > 0 && (
                <div>
                  <p className="text-muted-foreground mb-2 font-medium">Approval History:</p>
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
      <Dialog open={!!reviewItem} onOpenChange={() => { setReviewItem(null); setReviewNote(""); setApprovedBudget(""); }}>
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
                  <Input type="number" value={approvedBudget} onChange={(e) => setApprovedBudget(e.target.value)} placeholder={t("reviewRecommendedBudget")} />
                  <p className="text-xs text-muted-foreground mt-1">{t("reviewRequested")}: {reviewItem.budgetCurrency} {formatCount(reviewItem.estimatedBudget)}</p>
                </div>
              )}
              <div>
                <Label>{reviewAction === "revision_requested" ? t("reviewRevisionNotes") : t("reviewNotes")}</Label>
                <Textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder={reviewAction === "revision_requested" ? t("reviewRevisionNotesPlaceholder") : t("reviewNotesPlaceholder")} rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => { setReviewItem(null); setReviewNote(""); }}>{tc("cancel")}</Button>
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
