"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
  CalendarDays, CheckCircle2, Clock, Inbox, MapPin, Mail,
  ThumbsUp, ThumbsDown, Eye, RotateCcw, XCircle,
} from "lucide-react";
import { SortableTableHeader } from "@/components/shared/TableSortControl";
import { ExhibitionMobileList } from "./_components/ExhibitionMobileList";
import { ExhibitionDetailDialog } from "./_components/ExhibitionDetailDialog";
import { ExhibitionReviewDialog } from "./_components/ExhibitionReviewDialog";
import { EditRequestDialog, MoveBackDialog } from "@/components/features/exhibitions/ReviewerRequestDialogs";
import {
  PRIORITY_COLORS, STATUS_COLORS,
  getCategoryLabels, getPriorityLabels, getStatusLabels,
  hasBudget, locationText, reviewActionsFor,
  type ExhibitionRequest, type ReviewAction,
} from "./_lib/exhibitions";
import { SupportItemChips } from "@/components/features/exhibitions/SupportItemsSummary";
import { exhibitionFiltersAreActive } from "@/components/features/exhibitions/ExhibitionHeroFilters";
import { useTranslations, useLocale } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { usePagination } from "@/hooks/usePagination";
import { useUrlFilters } from "@/hooks/useUrlFilter";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { SuperAgentSection } from "@/components/features/super-agent/WorkspacePage";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { formatCount, formatDate } from "@/lib/ui/intlFormat";

// Helper to create status options with translations
function getStatusOptions(t: ReturnType<typeof useTranslations>, allLabel: string) {
  const statusLabels = getStatusLabels(t);
  return [
    { value: "all", label: allLabel },
    { value: "pending_review", label: t("statusPendingReview") },
    { value: "submitted", label: statusLabels.submitted },
    { value: "under_review", label: statusLabels.under_review },
    { value: "approved_stage", label: t("statusApprovedStage") },
    { value: "approved", label: statusLabels.approved },
    { value: "revision_requested", label: statusLabels.revision_requested },
    { value: "budget_approved", label: statusLabels.budget_approved },
    { value: "resources_assigned", label: statusLabels.resources_assigned },
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

interface QueueSummary {
  total: number;
  pendingReview: number;
  approved: number;
  revisionRequested: number;
  rejected: number;
}

const EMPTY_SUMMARY: QueueSummary = { total: 0, pendingReview: 0, approved: 0, revisionRequested: 0, rejected: 0 };

const ACTION_ICONS: Record<ReviewAction, { icon: typeof Clock; className: string; labelKey: string }> = {
  under_review: { icon: Clock, className: "text-amber-600", labelKey: "actionReview" },
  approved: { icon: ThumbsUp, className: "text-emerald-600", labelKey: "actionApprove" },
  revision_requested: { icon: RotateCcw, className: "text-orange-600", labelKey: "actionRevise" },
  rejected: { icon: ThumbsDown, className: "", labelKey: "actionReject" },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SuperAgentExhibitionsPage() {
  const t = useTranslations("exhibitions");
  const tf = useTranslations("exhibitionHeroFilters");
  const locale = useLocale();
  const statusLabels = getStatusLabels(t);
  const priorityLabels = getPriorityLabels(t);
  const categoryLabels = getCategoryLabels(t);
  const statusOptions = getStatusOptions(t, tf("allStatuses"));
  const priorityOptions = getPriorityOptions(t, tf("allPriorities"));
  const categoryOptions = getCategoryOptions(t, tf("allCategories"));
  const {
    page, limit, total, totalPages,
    setPage, setLimit, updateTotal, resetPage, paginationParams,
  } = usePagination();

  const [items, setItems] = useState<ExhibitionRequest[]>([]);
  // Queue figures come from the API's scope-wide aggregate (the whole team,
  // not the filtered page), so they do not move when a filter is applied.
  const [summary, setSummary] = useState<QueueSummary>(EMPTY_SUMMARY);
  const [countries, setCountries] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const { filters, setFilter, resetFilters } = useUrlFilters(
    // Sort: newest request first by default — this is a review queue, and new
    // submissions are the work. "Exhibition date" ascending puts the soonest
    // events on top (undated ones always last — see the API).
    { status: "all", priority: "all", category: "all", country: "all", search: "", sortBy: "createdAt", sortOrder: "desc" },
    { debounceKeys: ["search"], debounceMs: 400 }
  );
  const toggleSort = (field: "eventStartDate" | "createdAt") => {
    if (filters.sortBy === field) setFilter("sortOrder", filters.sortOrder === "asc" ? "desc" : "asc");
    else {
      setFilter("sortBy", field);
      // Exhibition date opens soonest-first; created opens newest-first.
      setFilter("sortOrder", field === "eventStartDate" ? "asc" : "desc");
    }
    resetPage();
  };

  const [review, setReview] = useState<{ item: ExhibitionRequest; action: ReviewAction } | null>(null);
  const [detailItem, setDetailItem] = useState<ExhibitionRequest | null>(null);
  const [editItem, setEditItem] = useState<ExhibitionRequest | null>(null);
  const [moveBackItem, setMoveBackItem] = useState<ExhibitionRequest | null>(null);
  // Re-reads the open detail after an edit.
  const [detailVersion, setDetailVersion] = useState(0);
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
      if (filters.country !== "all") params.set("country", filters.country);
      if (filters.search.trim()) params.set("search", filters.search.trim());
      params.set("sortBy", filters.sortBy === "eventStartDate" ? "eventStartDate" : "createdAt");
      params.set("sortOrder", filters.sortOrder === "asc" ? "asc" : "desc");
      const res = await fetch(`/api/exhibitions?${params}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items ?? []);
        setSummary({ ...EMPTY_SUMMARY, ...(data.summary ?? {}) });
        setCountries(Array.isArray(data.countries) ? data.countries : []);
        updateTotal(data.total ?? 0);
      } else {
        setLoadError(true);
      }
    } catch { setLoadError(true); } finally { setLoading(false); }
  }, [filters, page, limit, paginationParams, updateTotal]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const openReview = (item: ExhibitionRequest, action: ReviewAction) => setReview({ item, action });
  const afterReview = () => {
    setReview(null);
    setDetailItem(null);
    void fetchItems();
    void queryClient.invalidateQueries({ queryKey: ["super-agent", "action-counts"] });
  };

  const fmtDate = (d: string | undefined | null) => formatDate(d, { day: "2-digit", month: "short", year: "numeric" }, locale);
  const dayCount = (s: string | undefined | null, e: string | undefined | null) => {
    if (!s || !e) return null;
    const start = new Date(s);
    const end = new Date(e);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
  };

  // One primary action plus an overflow menu — the same on the desktop row,
  // the phone card and the detail footer (all read reviewActionsFor).
  const renderRowActions = (item: ExhibitionRequest, labelsFrom: "widest" | "always" = "widest") => {
    const { primary, secondary } = reviewActionsFor(item.status);
    const entry = (action: ReviewAction) => ({
      key: action,
      label: t(ACTION_ICONS[action].labelKey),
      icon: ACTION_ICONS[action].icon,
      iconClassName: ACTION_ICONS[action].className || undefined,
      destructive: action === "rejected" || undefined,
      onSelect: () => openReview(item, action),
    });
    return (
      <RowActions
        name={item.eventName}
        labelsFrom={labelsFrom}
        quick={[
          { key: "view", label: t("viewDetails"), icon: Eye, iconOnly: true, onSelect: () => setDetailItem(item) },
          ...(primary ? [entry(primary)] : []),
        ]}
        menu={secondary.map(entry)}
      />
    );
  };

  const hasActiveFilters =
    exhibitionFiltersAreActive(filters.search, filters.status, filters.priority, filters.category) || filters.country !== "all";
  // A narrower filter on page 3 used to stay on page 3 and show an empty list.
  const applyFilter = (key: "search" | "status" | "priority" | "category" | "country", value: string) => {
    setFilter(key, value);
    resetPage();
  };
  const countryOptions = useMemo(
    () => [{ value: "all", label: tf("allCountries") }, ...countries.map((c) => ({ value: c, label: c }))],
    [countries, tf],
  );

  const exportColumns = useMemo<ExportColumn<ExhibitionRequest>[]>(() => [
    { header: t("tableHeaderEvent"), key: "eventName" },
    { header: t("tableHeaderCategory"), key: "eventCategory", formatter: (_v, row) => categoryLabels[row.eventCategory] ?? row.eventCategory },
    { header: t("tableHeaderLocation"), key: "eventLocation", formatter: (_v, row) => locationText(row) || t("notSpecified") },
    { header: t("tableHeaderAgent"), key: "agentId", formatter: (_v, row) => row.agentId?.name ?? "" },
    { header: t("tableHeaderStatus"), key: "status", formatter: (_v, row) => statusLabels[row.status] ?? row.status },
    { header: t("tableHeaderPriority"), key: "priority", formatter: (_v, row) => priorityLabels[row.priority] ?? row.priority },
    { header: t("tableHeaderExhibitionDate"), key: "eventStartDate", formatter: (_v, row) => row.eventStartDate ? [fmtDate(row.eventStartDate), row.eventEndDate ? fmtDate(row.eventEndDate) : ""].filter(Boolean).join(" – ") : t("tableNoDate") },
    { header: t("requestedSupport"), key: "supportItems", formatter: (_v, row) => (row.supportItems ?? []).map((s) => `${s.item === "other" && s.label ? s.label : s.item} x${s.requestedQty}`).join(", ") },
    { header: t("tableHeaderBudget"), key: "estimatedBudget", formatter: (_v, row) => hasBudget(row.estimatedBudget) ? `${row.budgetCurrency} ${formatCount(row.estimatedBudget)}` : t("notSpecified") },
    { header: t("detailBudgetApproved"), key: "approvedBudget", formatter: (_v, row) => typeof row.approvedBudget === "number" ? `${row.budgetCurrency} ${formatCount(row.approvedBudget)}` : "" },
    { header: t("tableHeaderCreated"), key: "createdAt", formatter: (_v, row) => fmtDate(row.createdAt) },
  ], [t, locale]);
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: items as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "super-agent-exhibitions",
    title: t("exhibitionManagement"),
  });

  // Each figure opens the matching slice of the queue; clicking the active one clears it.
  const metric = (status: string, value: number) => ({
    value: formatCount(value),
    active: filters.status === status,
    onClick: () => applyFilter("status", filters.status === status ? "all" : status),
  });

  return (
    <div className="page-container">
      <DashboardPageHeader
        icon={CalendarDays}
        title={t("exhibitionManagement")}
        description={t("exhibitionManagementDesc")}
        compactMetrics
        metricsClassName="grid-cols-5"
        metrics={[
          { label: t("metricTotal"), shortLabel: t("metricTotalShort"), ...metric("all", summary.total), active: false, icon: Inbox, iconClassName: "text-muted-foreground", iconSurfaceClassName: "bg-muted" },
          { label: t("queueHealthNote"), shortLabel: t("metricAwaitingShort"), ...metric("pending_review", summary.pendingReview), icon: Clock, iconClassName: "text-amber-600", iconSurfaceClassName: "bg-amber-100", className: "sm:bg-amber-50/70 sm:ring-1 sm:ring-inset sm:ring-amber-200" },
          { label: t("metricApproved"), ...metric("approved_stage", summary.approved), icon: CheckCircle2, iconClassName: "text-emerald-600", iconSurfaceClassName: "bg-emerald-100" },
          { label: t("metricRevision"), shortLabel: t("metricRevisionShort"), ...metric("revision_requested", summary.revisionRequested), icon: RotateCcw, iconClassName: "text-orange-600", iconSurfaceClassName: "bg-orange-100" },
          { label: t("metricRejected"), ...metric("rejected", summary.rejected), icon: XCircle, iconClassName: "text-red-600", iconSurfaceClassName: "bg-red-100" },
        ]}
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
          {/* Only once the team works in more than one country — one option is not a filter. */}
          {(countries.length > 1 || filters.country !== "all") && (
            <SearchableSelect
              id="sa-exhibitions-country"
              className={INLINE_FILTER_CONTROL}
              options={countryOptions}
              value={filters.country}
              onValueChange={(v) => applyFilter("country", v)}
              placeholder={tf("allCountries")}
            />
          )}
          {/* Below 1280px the queue is cards with no column headers to click: sort lives here. */}
          <SearchableSelect
            id="sa-exhibitions-sort"
            className={`${INLINE_FILTER_CONTROL} xl:hidden`}
            ariaLabel={t("sortLabel")}
            options={[
              { value: "createdAt:desc", label: t("sortNewestRequest") },
              { value: "createdAt:asc", label: t("sortOldestRequest") },
              { value: "eventStartDate:asc", label: t("sortExhibitionSoonest") },
              { value: "eventStartDate:desc", label: t("sortExhibitionLatest") },
            ]}
            value={`${filters.sortBy}:${filters.sortOrder}`}
            onValueChange={(v) => {
              const [field, order] = v.split(":");
              setFilter("sortBy", field);
              setFilter("sortOrder", order);
              resetPage();
            }}
            placeholder={t("sortNewestRequest")}
          />
        </InlineFilterBar>

        {loadError ? (
          <ErrorState description={t("fetchError")} onRetry={() => void fetchItems()} />
        ) : (
          <>
          <ExhibitionMobileList
            items={items}
            loading={loading}
            statusLabels={statusLabels}
            priorityLabels={priorityLabels}
            categoryLabels={categoryLabels}
            statusColors={STATUS_COLORS}
            priorityColors={PRIORITY_COLORS}
            fmtDate={fmtDate}
            onOpen={setDetailItem}
            renderActions={(item) => renderRowActions(item, "always")}
          />
          <div className="hidden overflow-x-auto xl:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead>{t("tableHeaderEvent")}</TableHead>
                  <TableHead>{t("tableHeaderStatus")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("tableHeaderAgent")}</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    <SortableTableHeader
                      label={t("tableHeaderExhibitionDate")}
                      active={filters.sortBy === "eventStartDate"}
                      order={filters.sortOrder === "asc" ? "asc" : "desc"}
                      onClick={() => toggleSort("eventStartDate")}
                    />
                  </TableHead>
                  <TableHead className="hidden md:table-cell">
                    <SortableTableHeader
                      label={t("tableHeaderCreated")}
                      active={filters.sortBy === "createdAt"}
                      order={filters.sortOrder === "asc" ? "asc" : "desc"}
                      onClick={() => toggleSort("createdAt")}
                    />
                  </TableHead>
                  {/* Budget from 1440px: with both date columns the row did not fit at 1280; the budget stays in the detail and review dialogs. */}
                  <TableHead className="hidden min-[90rem]:table-cell">{t("tableHeaderBudget")}</TableHead>
                  <TableHead className="text-right">{t("tableHeaderActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableBodySkeleton rows={5} cols={7} />
                ) : items.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={7} className="py-12">
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
                            {locationText(item) ? (
                              <span className="inline-flex min-w-0 items-center gap-1">
                                <span aria-hidden="true">·</span>
                                <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                                <span className="truncate">{locationText(item)}</span>
                              </span>
                            ) : null}
                          </p>
                          {/* What the agent asked for, at a glance: requested quantities only. */}
                          {(item.supportItems?.length ?? 0) > 0 && (
                            <div className="mt-1.5">
                              <SupportItemChips items={item.supportItems!} />
                            </div>
                          )}
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
                          <div className="flex min-w-0 max-w-[12rem] items-center gap-2">
                            <UserAvatar name={item.agentId?.name} email={item.agentId?.email} className="h-8 w-8 shrink-0" colorful />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium leading-5" title={item.agentId?.email}>{item.agentId?.name}</p>
                              {/* Email from 1536px only: seven columns did not fit beside it. */}
                              <p className="hidden items-center gap-1 truncate text-xs leading-4 text-muted-foreground 2xl:flex">
                                <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
                                <span className="truncate">{item.agentId?.email}</span>
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden whitespace-nowrap sm:table-cell">
                          {item.eventStartDate ? (
                            <>
                              {/* Start on its own line, the end under it: a one-line
                                  range was the widest cell once Created joined the row. */}
                              <p className="text-xs font-medium">{fmtDate(item.eventStartDate)}</p>
                              {item.eventEndDate && item.eventEndDate.slice(0, 10) !== item.eventStartDate.slice(0, 10) ? (
                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                  {t("tableDateUntil", { date: fmtDate(item.eventEndDate) })}
                                  {days ? ` · ${t("tableDayCount", { count: days })}` : ""}
                                </p>
                              ) : null}
                            </>
                          ) : (
                            <p className="text-xs text-muted-foreground">{t("tableNoDate")}</p>
                          )}
                        </TableCell>
                        <TableCell className="hidden whitespace-nowrap md:table-cell">
                          <p className="text-xs">{fmtDate(item.createdAt)}</p>
                        </TableCell>
                        <TableCell className="hidden min-[90rem]:table-cell">
                          {hasBudget(item.estimatedBudget)
                            ? <p className="whitespace-nowrap text-sm font-medium">{item.budgetCurrency} {formatCount(item.estimatedBudget)}</p>
                            : <p className="whitespace-nowrap text-xs text-muted-foreground">{t("notSpecified")}</p>}
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
                            {renderRowActions(item)}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          </>
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

      <ExhibitionDetailDialog
        item={detailItem}
        version={detailVersion}
        onClose={() => setDetailItem(null)}
        onAction={openReview}
        onEdit={setEditItem}
        onMoveBack={setMoveBackItem}
        onChanged={() => void fetchItems()}
      />
      <EditRequestDialog
        request={editItem}
        onClose={() => setEditItem(null)}
        onSaved={() => { setEditItem(null); setDetailVersion((v) => v + 1); void fetchItems(); }}
      />
      <MoveBackDialog
        request={moveBackItem}
        stageLabel={(status) => statusLabels[status] ?? status}
        onClose={() => setMoveBackItem(null)}
        onDone={afterReview}
      />
      <ExhibitionReviewDialog
        item={review?.item ?? null}
        action={review?.action ?? null}
        onClose={() => setReview(null)}
        onDone={afterReview}
      />
    </div>
  );
}
