"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  BarChart2,
  CalendarDays,
  CheckCheck,
  CircleDollarSign,
  ClipboardCheck,
  Clock,
  Loader2,
  ShieldAlert,
  Trash2,
  Wallet,
  XCircle,
} from "lucide-react";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { RowActions, type RowAction } from "@/components/shared/RowActions";
import { isRowToggleClick } from "@/components/shared/RowExpandToggle";
import { SortableTableHeader, TableSortControl } from "@/components/shared/TableSortControl";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TableBodySkeleton } from "@/components/ui/loading";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useConfirm } from "@/hooks/useConfirm";
import { useDebounce } from "@/hooks/useDebounce";
import { useTableExport } from "@/hooks/useTableExport";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { adminCanMove } from "@/lib/exhibitions/transitions";
import type { ExportColumn } from "@/lib/export";
import { csrfFetch } from "@/lib/security/csrf-client";
import { readQuery, writeQuery } from "@/lib/ui/urlQuery";
import { cn } from "@/lib/utils";
import { ExhibitionActionDialog } from "./_components/ExhibitionActionDialog";
import { ExhibitionDetailDrawer } from "./_components/ExhibitionDetailDrawer";
import {
  CATEGORY_LABEL_KEYS,
  EXHIBITION_STATUS_FILTER_VALUES,
  PRIORITY_BADGES,
  PRIORITY_LABEL_KEYS,
  RESOURCE_TYPE_TO_CATEGORY,
  SORT_FIELDS,
  STATUS_BADGES,
  STATUS_LABEL_KEYS,
  formatDate,
  formatMoney,
  getSla,
  getStage,
  type ExhibitionRequest,
  type MatchedResource,
} from "./_lib/exhibitions";
import { adminWorkflowActions } from "./_lib/workflowActions";

const HEAD = "px-3 py-3 sm:px-3 text-xs font-semibold uppercase tracking-[0.12em]";

interface BudgetTotalRow {
  currency: string;
  requested: number;
  approved: number;
  utilized: number;
}

/** A budget figure across currencies, largest first: "USD 42,000 · AED 8,000". */
function budgetTotal(rows: BudgetTotalRow[], field: "requested" | "approved" | "utilized"): string {
  const parts = rows.filter((row) => row[field] > 0).map((row) => formatMoney(row[field], row.currency));
  return parts.length > 0 ? parts.join(" · ") : formatMoney(0, rows[0]?.currency ?? "USD");
}

function BudgetFigure({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </span>
  );
}

const EMPTY_SUMMARY = {
  total: 0,
  open: 0,
  pendingReview: 0,
  financeReview: 0,
  awaitingApproval: 0,
  approved: 0,
  rejected: 0,
  budgetRequested: 0,
  budgetApproved: 0,
  budgetUtilized: 0,
};

/**
 * Admin → Exhibitions: the exhibition request queue. Same shape as the other
 * admin lists — header, one filter bar with sort, the table, pagination — and
 * each row offers the one workflow step the server will accept next.
 */
export default function AdminExhibitionsPage() {
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("adminExhibitions");
  const tc = useTranslations("common");
  const ta = useTranslations("a11y");
  const { confirm, ConfirmDialogNode } = useConfirm();

  const [items, setItems] = useState<ExhibitionRequest[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [countryOptions, setCountryOptions] = useState<string[]>([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [budgets, setBudgets] = useState<BudgetTotalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Status and sort live in the URL so the dashboard's exhibition rows land on
  // the right status and a shared link reproduces the view.
  const [statusFilter, setStatusFilter] = useUrlFilter("status", "all", { allow: EXHIBITION_STATUS_FILTER_VALUES });
  const [sortBy, setSortBy] = useUrlFilter("sortBy", "createdAt", { allow: SORT_FIELDS });
  const [sortOrder, setSortOrder] = useUrlFilter("sortOrder", "desc", { allow: ["asc", "desc"] });
  const order = sortOrder === "asc" ? "asc" : "desc";
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [dateRange, setDateRange] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [budgetRange, setBudgetRange] = useState("all");
  const [reviewerFilter, setReviewerFilter] = useState("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search.trim(), 300);
  const [page, setPageState] = useState(() => Number(searchParams.get("page")) || 1);

  const setPage = useCallback((next: number) => {
    setPageState(next);
    // readQuery, not window.location: a status change writes the URL in the
    // same tick and router.replace has not applied it yet.
    const params = readQuery();
    if (next > 1) params.set("page", String(next)); else params.delete("page");
    writeQuery(params, (href) => router.replace(href, { scroll: false }));
  }, [router]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const [action, setAction] = useState<{ item: ExhibitionRequest; status: string } | null>(null);
  const [detailItem, setDetailItem] = useState<ExhibitionRequest | null>(null);
  const [matchedResources, setMatchedResources] = useState<MatchedResource[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(false);

  const fetchMatchedResources = useCallback(async (requiredResources: string[]) => {
    if (!requiredResources?.length) {
      setMatchedResources([]);
      return;
    }
    setResourcesLoading(true);
    try {
      const categories = [...new Set(requiredResources.map((resource) => RESOURCE_TYPE_TO_CATEGORY[resource]).filter(Boolean))];
      const results = await Promise.all(
        categories.map((category) =>
          fetch(`/api/resources?category=${category}&limit=10`).then((response) => (response.ok ? response.json() : { items: [] })),
        ),
      );
      const seen = new Set<string>();
      setMatchedResources(
        results.flatMap((result) => result.items ?? []).filter((resource: MatchedResource) => {
          if (seen.has(resource._id)) return false;
          seen.add(resource._id);
          return true;
        }),
      );
    } catch {
      setMatchedResources([]);
    } finally {
      setResourcesLoading(false);
    }
  }, []);

  const openDetail = useCallback((item: ExhibitionRequest) => {
    setDetailItem(item);
    void fetchMatchedResources(item.requiredResources);
  }, [fetchMatchedResources]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize), sortBy, sortOrder: order });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (priorityFilter !== "all") params.set("priority", priorityFilter);
      if (stageFilter !== "all") params.set("stage", stageFilter);
      if (dateRange !== "all") params.set("dateRange", dateRange);
      if (countryFilter !== "all") params.set("country", countryFilter);
      if (budgetRange !== "all") params.set("budgetRange", budgetRange);
      if (reviewerFilter !== "all") params.set("reviewer", reviewerFilter);
      if (debouncedSearch) params.set("search", debouncedSearch);
      const response = await fetch(`/api/exhibitions?${params}`);
      if (!response.ok) throw new Error(String(response.status));
      const data = await response.json();
      const nextItems: ExhibitionRequest[] = data.items ?? [];
      setItems(nextItems);
      setTotalItems(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
      setSummary({ ...EMPTY_SUMMARY, ...(data.summary ?? {}) });
      setBudgets(data.budgets ?? []);
      setCountryOptions(data.countries ?? []);
      // Keep an open inspector in step with what the server now says.
      setDetailItem((current) => (current ? nextItems.find((entry) => entry._id === current._id) ?? current : null));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [budgetRange, countryFilter, dateRange, debouncedSearch, order, page, pageSize, priorityFilter, reviewerFilter, sortBy, stageFilter, statusFilter]);

  useEffect(() => { void fetchItems(); }, [fetchItems]);

  const skipFilterResetRef = useRef(true);
  useEffect(() => {
    if (skipFilterResetRef.current) { skipFilterResetRef.current = false; return; }
    setPage(1);
    setSelectedIds(new Set());
     
  }, [statusFilter, priorityFilter, stageFilter, dateRange, countryFilter, budgetRange, reviewerFilter, debouncedSearch, sortBy, sortOrder]);

  const selectedItems = items.filter((item) => selectedIds.has(item._id));
  const allSelected = items.length > 0 && items.every((item) => selectedIds.has(item._id));
  const someSelected = items.some((item) => selectedIds.has(item._id)) && !allSelected;
  const detailIndex = detailItem ? items.findIndex((item) => item._id === detailItem._id) : -1;
  const previousDetailItem = detailIndex > 0 ? items[detailIndex - 1] : null;
  const nextDetailItem = detailIndex >= 0 && detailIndex < items.length - 1 ? items[detailIndex + 1] : null;

  const openAction = useCallback((item: ExhibitionRequest, status: string) => setAction({ item, status }), []);

  const handleDelete = async (item: ExhibitionRequest) => {
    const ok = await confirm({
      message: t("requestDeletedConfirm", { eventName: item.eventName }),
      confirmLabel: ta("delete"),
      variant: "destructive",
    });
    if (!ok) return;
    try {
      const response = await csrfFetch(`/api/exhibitions/${item._id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(String(response.status));
      toast.success(t("requestDeleted"));
      if (detailItem?._id === item._id) setDetailItem(null);
      void fetchItems();
    } catch {
      toast.error(t("failedToDeleteRequest"));
    }
  };

  /**
   * Applies one move to every selected request the server allows it for, and
   * says what happened to the rest. It used to fire at all of them, ignore the
   * responses, and report "N request(s) updated" even when every one was
   * refused for being at the wrong stage.
   */
  const handleBulkStatus = async (status: "approved" | "rejected") => {
    const eligible = selectedItems.filter((item) => adminCanMove(item.status, status));
    const skipped = selectedItems.length - eligible.length;
    if (eligible.length === 0) {
      toast.info(t("bulkNothingEligible"));
      return;
    }
    if (status === "rejected") {
      const ok = await confirm({
        message: t("rejectSelectedRequests", { count: eligible.length }),
        confirmLabel: t("bulkReject"),
        variant: "destructive",
      });
      if (!ok) return;
    }
    setBulkRunning(true);
    const note = status === "rejected" ? t("bulkRejectedFromAdminQueue") : t("bulkApprovedFromAdminQueue");
    const results = await Promise.allSettled(
      eligible.map((item) =>
        csrfFetch(`/api/exhibitions/${item._id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, reviewNote: note, statusReason: note }),
        }).then((response) => {
          if (!response.ok) throw new Error(String(response.status));
        }),
      ),
    );
    setBulkRunning(false);
    const failed = results.filter((result) => result.status === "rejected").length;
    const done = eligible.length - failed;
    if (done > 0) toast.success(t("bulkActionsCompleted", { count: done }));
    if (skipped > 0) toast.info(t("bulkSkippedNotAtStage", { count: skipped }));
    if (failed > 0) toast.error(t("bulkActionFailedCount", { count: failed }));
    setSelectedIds(new Set());
    void fetchItems();
  };

  const exportColumns = useMemo<ExportColumn<ExhibitionRequest>[]>(() => [
    { header: t("requestIdHeader"), key: "_id" },
    { header: t("eventHeader"), key: "eventName" },
    { header: t("agentHeader"), key: "agentId", formatter: (_v, row) => row.agentId?.name ?? "" },
    { header: t("locationHeader"), key: "eventLocation", formatter: (_v, row) => [row.eventLocation, row.country].filter(Boolean).join(", ") },
    { header: t("datesHeader"), key: "eventStartDate", formatter: (_v, row) => `${formatDate(row.eventStartDate, locale)} - ${formatDate(row.eventEndDate, locale)}` },
    { header: t("stageHeader"), key: "status", formatter: (_v, row) => t(getStage(row).labelKey) },
    { header: t("budgetRequestedHeader"), key: "estimatedBudget", formatter: (_v, row) => formatMoney(row.estimatedBudget, row.budgetCurrency) },
    { header: t("budgetApprovedHeader"), key: "approvedBudget", formatter: (_v, row) => formatMoney(row.approvedBudget, row.budgetCurrency) },
    { header: t("priorityHeader"), key: "priority", formatter: (_v, row) => t(PRIORITY_LABEL_KEYS[row.priority] ?? "medium") },
    { header: t("submittedHeader"), key: "createdAt", formatter: (_v, row) => formatDate(row.createdAt, locale) },
    { header: t("slaHeader"), key: "createdAt", formatter: (_v, row) => { const sla = getSla(row); return t(sla.labelKey, { days: sla.days }); } },
  ], [locale, t]);
  // Selected rows when there is a selection, otherwise the page on screen.
  const exportRows = selectedItems.length > 0 ? selectedItems : items;
  // BUG-004: with no selection, export the full filtered result set, not just
  // the visible page. An explicit selection still exports exactly that selection.
  const fetchAllExhibitions = useCallback(async () => {
    if (selectedItems.length > 0) return exportRows as unknown as Record<string, unknown>[];
    const base = new URLSearchParams();
    if (statusFilter !== "all") base.set("status", statusFilter);
    if (priorityFilter !== "all") base.set("priority", priorityFilter);
    if (stageFilter !== "all") base.set("stage", stageFilter);
    if (dateRange !== "all") base.set("dateRange", dateRange);
    if (countryFilter !== "all") base.set("country", countryFilter);
    if (budgetRange !== "all") base.set("budgetRange", budgetRange);
    if (reviewerFilter !== "all") base.set("reviewer", reviewerFilter);
    if (debouncedSearch) base.set("search", debouncedSearch);
    return fetchAllPaginated<Record<string, unknown>>(
      (page, limit) => `/api/exhibitions?${new URLSearchParams({ ...Object.fromEntries(base), page: String(page), limit: String(limit) })}`,
      (json) => ({
        rows: ((json.items ?? []) as Record<string, unknown>[]),
        total: Number(json.total ?? 0),
      }),
    );
  }, [selectedItems, exportRows, statusFilter, priorityFilter, stageFilter, dateRange, countryFilter, budgetRange, reviewerFilter, debouncedSearch]);
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: exportRows as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "exhibition-requests",
    title: t("exhibitionOperationsCenter"),
    fetchAll: fetchAllExhibitions,
  });

  const advancedFilterCount = [dateRange, countryFilter, budgetRange, reviewerFilter].filter((value) => value !== "all").length;
  const activeFilterCount =
    advancedFilterCount + [statusFilter, priorityFilter, stageFilter].filter((value) => value !== "all").length + (search.trim() ? 1 : 0);

  const resetFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setPriorityFilter("all");
    setStageFilter("all");
    setDateRange("all");
    setCountryFilter("all");
    setBudgetRange("all");
    setReviewerFilter("all");
  };

  const sortOn = (field: (typeof SORT_FIELDS)[number]) => {
    setSortBy(field);
    setSortOrder(sortBy === field && order === "asc" ? "desc" : "asc");
  };

  // Inspector shortcuts: Esc, ←/→, A (the next step), R (reject, where allowed).
  useEffect(() => {
    if (!detailItem || action) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const { next } = adminWorkflowActions(detailItem.status);
      if (event.key === "Escape") {
        event.preventDefault();
        setDetailItem(null);
      } else if (event.key === "ArrowLeft" && previousDetailItem) {
        event.preventDefault();
        openDetail(previousDetailItem);
      } else if (event.key === "ArrowRight" && nextDetailItem) {
        event.preventDefault();
        openDetail(nextDetailItem);
      } else if (event.key.toLowerCase() === "a" && next) {
        event.preventDefault();
        openAction(detailItem, next.status);
      } else if (event.key.toLowerCase() === "r" && adminCanMove(detailItem.status, "rejected")) {
        event.preventDefault();
        openAction(detailItem, "rejected");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [action, detailItem, nextDetailItem, openAction, openDetail, previousDetailItem]);

  const rowActionsFor = (item: ExhibitionRequest): { quick: RowAction[]; menu: RowAction[] } => {
    const { next, others } = adminWorkflowActions(item.status);
    return {
      quick: next ? [{ key: next.key, label: t(next.labelKey), icon: next.icon, onSelect: () => openAction(item, next.status) }] : [],
      menu: [
        ...others.map((entry) => ({
          key: entry.key,
          label: t(entry.labelKey),
          icon: entry.icon,
          destructive: entry.destructive,
          onSelect: () => openAction(item, entry.status),
        })),
        { key: "delete", label: ta("delete"), icon: Trash2, iconOnly: true, destructive: true, onSelect: () => void handleDelete(item) },
      ],
    };
  };

  const toggleAll = (checked: boolean | "indeterminate") => {
    const next = new Set(selectedIds);
    items.forEach((item) => (checked ? next.add(item._id) : next.delete(item._id)));
    setSelectedIds(next);
  };

  return (
    <div className="page-container pb-20 lg:pb-16">
      {ConfirmDialogNode}

      <DashboardPageHeader
        compact
        compactOnMobile
        icon={CalendarDays}
        eyebrow={t("adminOperations")}
        title={t("exhibitionOperationsCenter")}
        description={t("manageExhibitionRequests")}
        // A count, said as one: "Queue health" read like a score.
        summary={{ label: t("openRequests"), value: summary.open }}
        actions={(
          <Button asChild variant="outline" className="rounded-xl border-border/70 bg-background/90">
            <a href="exhibitions/analytics">
              <BarChart2 className="h-4 w-4" />
              {t("analytics")}
            </a>
          </Button>
        )}
        // The queue, not its outcomes: where work is waiting. Approved and
        // Rejected are one Status filter away. Pending Review is what an admin
        // acts on first, Finance Review next, so those two carry a tint.
        metrics={[
          { label: t("totalRequests"), value: summary.total, icon: ClipboardCheck, iconClassName: "text-muted-foreground", iconSurfaceClassName: "bg-muted" },
          { label: t("pendingReview"), value: summary.pendingReview, icon: Clock, iconClassName: "text-orange-600", iconSurfaceClassName: "bg-orange-100", className: "sm:bg-orange-50/70 sm:ring-1 sm:ring-inset sm:ring-orange-200" },
          { label: t("financeReview"), value: summary.financeReview, icon: CircleDollarSign, iconClassName: "text-purple-600", iconSurfaceClassName: "bg-purple-100", className: "sm:bg-purple-50/50 sm:ring-1 sm:ring-inset sm:ring-purple-200/70" },
          { label: t("kpiAwaitingLaunch"), value: summary.awaitingApproval, icon: ShieldAlert, iconClassName: "text-blue-600", iconSurfaceClassName: "bg-blue-50" },
        ]}
        footer={
          // One strip of context, not three more cards competing with the queue.
          <div className="flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border/60 bg-card/85 px-3 py-2 text-sm">
            <span className="flex items-center gap-1.5 font-semibold text-foreground">
              <Wallet className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              {t("budget")}
            </span>
            <BudgetFigure label={t("requestedLabel")} value={budgetTotal(budgets, "requested")} />
            <span className="hidden text-muted-foreground/50 sm:inline" aria-hidden="true">•</span>
            <BudgetFigure label={t("approvedLabel")} value={budgetTotal(budgets, "approved")} />
            {budgets.some((row) => row.utilized > 0) && (
              <>
                <span className="hidden text-muted-foreground/50 sm:inline" aria-hidden="true">•</span>
                <BudgetFigure label={t("utilized")} value={budgetTotal(budgets, "utilized")} />
              </>
            )}
          </div>
        }
      />

      <InlineFilterBar
        className="workspace-panel-surface rounded-2xl border-b-0"
        onClear={activeFilterCount > 0 ? resetFilters : undefined}
        clearLabel={t("resetFilters")}
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
        moreLabel={t("moreFilters")}
        moreActiveCount={advancedFilterCount}
        more={(
          <>
            <SearchableSelect
              id="admin-exhibitions-date"
              className={INLINE_FILTER_CONTROL}
              options={[
                { value: "all", label: t("anyDate") },
                { value: "7", label: t("last7Days") },
                { value: "30", label: t("last30Days") },
                { value: "90", label: t("last90Days") },
              ]}
              value={dateRange}
              onValueChange={setDateRange}
              placeholder={t("dateRange")}
            />
            <SearchableSelect
              id="admin-exhibitions-country"
              className={INLINE_FILTER_CONTROL}
              options={[{ value: "all", label: t("allCountries") }, ...countryOptions.map((country) => ({ value: country, label: country }))]}
              value={countryFilter}
              onValueChange={setCountryFilter}
              placeholder={t("country")}
            />
            <SearchableSelect
              id="admin-exhibitions-budget"
              className={INLINE_FILTER_CONTROL}
              options={[
                { value: "all", label: t("anyBudget") },
                { value: "0-10000", label: t("under10k") },
                { value: "10000-50000", label: t("from10kTo50k") },
                { value: "50000-999999999", label: t("from50kPlus") },
              ]}
              value={budgetRange}
              onValueChange={setBudgetRange}
              placeholder={t("budgetRange")}
            />
            <SearchableSelect
              id="admin-exhibitions-reviewer"
              className={INLINE_FILTER_CONTROL}
              options={[
                { value: "all", label: t("anyReviewer") },
                { value: "unassigned", label: t("unassigned") },
                { value: "assigned", label: t("assignedStatus") },
              ]}
              value={reviewerFilter}
              onValueChange={setReviewerFilter}
              placeholder={t("assignedReviewer")}
            />
          </>
        )}
      >
        <InlineFilterSearch value={search} onChange={setSearch} placeholder={t("searchRequestsAgentsEvents")} />
        <SearchableSelect
          id="admin-exhibitions-status"
          className={INLINE_FILTER_CONTROL}
          options={[
            { value: "all", label: t("allStatus") },
            { value: "submitted", label: t("submitted") },
            { value: "under_review", label: t("underReview") },
            { value: "approved", label: t("financeReviewStatus") },
            { value: "revision_requested", label: t("needsRevision") },
            { value: "budget_approved", label: t("statusBudgetApproved") },
            { value: "resources_assigned", label: t("statusResourcesAssigned") },
            { value: "active", label: t("statusActive") },
            { value: "completed", label: t("completedStatus") },
            { value: "rejected", label: t("rejected") },
            { value: "archived", label: t("statusArchived") },
          ]}
          value={statusFilter}
          onValueChange={setStatusFilter}
          placeholder={t("allStatus")}
        />
        <SearchableSelect
          id="admin-exhibitions-priority"
          className={INLINE_FILTER_CONTROL}
          options={[
            { value: "all", label: t("allPriority") },
            { value: "low", label: t("low") },
            { value: "medium", label: t("medium") },
            { value: "high", label: t("high") },
            { value: "critical", label: t("critical") },
          ]}
          value={priorityFilter}
          onValueChange={setPriorityFilter}
          placeholder={t("allPriority")}
        />
        <SearchableSelect
          id="admin-exhibitions-stage"
          className={INLINE_FILTER_CONTROL}
          options={[
            { value: "all", label: t("allStages") },
            { value: "team_leader", label: t("teamLeaderReview") },
            { value: "finance", label: t("financeReviewStage") },
            { value: "super_agent", label: t("stageResourcing") },
            { value: "admin", label: t("stageDelivery") },
            { value: "completed", label: t("completedStage") },
          ]}
          value={stageFilter}
          onValueChange={setStageFilter}
          placeholder={t("allStages")}
        />
        <TableSortControl
          value={sortBy}
          onValueChange={setSortBy}
          options={[
            { value: "createdAt", label: t("sortSubmitted") },
            { value: "eventStartDate", label: t("sortEventDate") },
            { value: "estimatedBudget", label: t("sortBudget") },
            { value: "eventName", label: t("sortEventName") },
          ]}
          order={order}
          onOrderChange={setSortOrder}
          compact
        />
      </InlineFilterBar>

      {selectedItems.length > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl border border-primary/15 bg-primary/5 chip-pad sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-foreground">{selectedItems.length} {t("selected")}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="dense" className="rounded-lg" disabled={bulkRunning} onClick={() => void handleBulkStatus("approved")}>
              {bulkRunning ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCheck className="h-4 w-4" aria-hidden="true" />}
              {t("bulkApprove")}
            </Button>
            <Button size="dense" variant="outline" className="rounded-lg border-red-200 text-red-700 hover:bg-red-50" disabled={bulkRunning} onClick={() => void handleBulkStatus("rejected")}>
              <XCircle className="h-4 w-4" aria-hidden="true" />
              {t("bulkReject")}
            </Button>
            <Button size="dense" variant="ghost" className="rounded-lg" disabled={bulkRunning} onClick={() => setSelectedIds(new Set())}>
              {t("clearSelection")}
            </Button>
          </div>
        </div>
      )}

      <section className="workspace-panel-surface overflow-hidden rounded-2xl border-t-0 rounded-t-none">
        {loadError ? (
          <div className="p-6">
            <ErrorState description={t("couldNotLoadExhibitionRequests")} onRetry={() => void fetchItems()} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="w-11 px-3 py-3 sm:px-3">
                    <Checkbox
                      checked={someSelected ? "indeterminate" : allSelected}
                      onCheckedChange={toggleAll}
                      aria-label={t("selectVisibleRows")}
                    />
                  </TableHead>
                  <TableHead className={`min-w-[200px] ${HEAD}`}>
                    <SortableTableHeader label={t("event")} active={sortBy === "eventName"} order={order} onClick={() => sortOn("eventName")} />
                  </TableHead>
                  <TableHead className={`min-w-[168px] ${HEAD}`}>{t("agent")}</TableHead>
                  <TableHead className={`min-w-[170px] ${HEAD}`}>{t("currentStage")}</TableHead>
                  <TableHead className={`min-w-[120px] ${HEAD}`}>
                    <SortableTableHeader label={t("budget")} active={sortBy === "estimatedBudget"} order={order} onClick={() => sortOn("estimatedBudget")} />
                  </TableHead>
                  <TableHead className={`w-[130px] ${HEAD}`}>
                    <SortableTableHeader label={t("sla")} active={sortBy === "createdAt"} order={order} onClick={() => sortOn("createdAt")} />
                  </TableHead>
                  <TableHead className={`w-[112px] text-right ${HEAD}`}>{tc("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableBodySkeleton rows={pageSize} cols={7} />
                ) : items.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={7}>
                      <EmptyState
                        title={t("noExhibitionRequestsFound")}
                        description={t("adjustFiltersOrResetTheQueue")}
                        action={activeFilterCount > 0 ? (
                          <Button variant="outline" size="sm" onClick={resetFilters}>{t("resetFilters")}</Button>
                        ) : undefined}
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => {
                    const stage = getStage(item);
                    const sla = getSla(item);
                    const isOpen = detailItem?._id === item._id;
                    return (
                      <TableRow
                        key={item._id}
                        onClick={(event) => {
                          // On phones the row is the card's own expand control; the event name opens the inspector there.
                          if (event.currentTarget.hasAttribute("data-mobile-collapsible") && window.matchMedia("(max-width: 639px)").matches) return;
                          if (isRowToggleClick(event)) openDetail(item);
                        }}
                        className={cn("cursor-pointer", isOpen && "bg-primary/[0.06] shadow-[inset_3px_0_0_hsl(var(--primary))]")}
                      >
                        <TableCell className="px-3 py-3 sm:px-3">
                          <Checkbox
                            checked={selectedIds.has(item._id)}
                            onCheckedChange={(checked) => {
                              const next = new Set(selectedIds);
                              if (checked) next.add(item._id); else next.delete(item._id);
                              setSelectedIds(next);
                            }}
                            aria-label={t("selectRequest", { name: item.eventName })}
                          />
                        </TableCell>
                        <TableCell className="px-3 py-3 sm:px-3">
                          <button type="button" className="block min-w-0 max-w-[14rem] text-start" onClick={() => openDetail(item)}>
                            <span className="block truncate font-semibold text-foreground hover:text-primary">{item.eventName}</span>
                          </button>
                          {/* Priority rides with the event: a column of its own held one small badge. */}
                          <span className="mt-1 flex min-w-0 max-w-[14rem] items-center gap-1.5 text-xs text-muted-foreground">
                            <Badge className={`${PRIORITY_BADGES[item.priority] ?? PRIORITY_BADGES.medium} shrink-0 rounded-md px-1.5 py-0 text-[11px] font-semibold`}>
                              {t(PRIORITY_LABEL_KEYS[item.priority] ?? "medium")}
                            </Badge>
                            <span className="truncate">
                              {[t(CATEGORY_LABEL_KEYS[item.eventCategory] ?? "otherCategory"), item.eventStartDate ? formatDate(item.eventStartDate, locale) : null].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="px-3 py-3 sm:px-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <UserAvatar name={item.agentId?.name} email={item.agentId?.email} className="h-8 w-8" colorful />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">{item.agentId?.name ?? "-"}</p>
                              <p className="max-w-[9rem] truncate text-xs text-muted-foreground">{item.agentId?.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="px-3 py-3 sm:px-3">
                          <Badge className={`${STATUS_BADGES[item.status] ?? ""} whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold`} dot>
                            {t(stage.labelKey)}
                          </Badge>
                          {/* The status, only where it says more than the stage ("Finance Review" twice did not). */}
                          {STATUS_LABEL_KEYS[item.status] && t(STATUS_LABEL_KEYS[item.status]) !== t(stage.labelKey) && (
                            <p className="mt-1 text-xs text-muted-foreground">{t(STATUS_LABEL_KEYS[item.status])}</p>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-3 py-3 sm:px-3">
                          <p className="font-semibold text-foreground">{formatMoney(item.estimatedBudget, item.budgetCurrency)}</p>
                          {item.approvedBudget != null && (
                            <p className="mt-0.5 text-xs font-medium text-emerald-600">
                              {t("approved")}: {formatMoney(item.approvedBudget, item.budgetCurrency)}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-3 py-3 sm:px-3">
                          <span className="flex items-center gap-2">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${sla.tone}`} aria-hidden="true" />
                            <span className={`text-xs font-semibold ${sla.className}`}>{t(sla.labelKey, { days: sla.days })}</span>
                          </span>
                        </TableCell>
                        <TableCell className="px-3 py-3 sm:px-3 text-right">
                          <RowActions name={item.eventName} labelsFrom="wide" {...rowActionsFor(item)} />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <PaginationControls
        page={page}
        totalPages={totalPages}
        total={totalItems}
        limit={pageSize}
        onPageChange={setPage}
        onLimitChange={(next) => { setPageSize(next); setPage(1); }}
      />

      <ExhibitionDetailDrawer
        item={detailItem}
        matchedResources={matchedResources}
        resourcesLoading={resourcesLoading}
        onClose={() => setDetailItem(null)}
        onAction={openAction}
        previousItem={previousDetailItem}
        nextItem={nextDetailItem}
        onPrevious={() => previousDetailItem && openDetail(previousDetailItem)}
        onNext={() => nextDetailItem && openDetail(nextDetailItem)}
      />

      <ExhibitionActionDialog
        item={action?.item ?? null}
        status={action?.status ?? ""}
        onClose={() => setAction(null)}
        onDone={() => { setAction(null); void fetchItems(); }}
      />
    </div>
  );
}
