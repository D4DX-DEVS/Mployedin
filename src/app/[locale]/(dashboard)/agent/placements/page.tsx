"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowRight, BriefcaseBusiness, CircleDollarSign, Inbox, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTableExport } from "@/hooks/useTableExport";
import { InlineFilterBar, InlineFilterSearch } from "@/components/shared/InlineFilterBar";
import { FilterField, PhoneFilterSheet, PhoneFiltersButton, SHEET_CONTROL } from "@/components/shared/PhoneFilterSheet";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { TableBodySkeleton } from "@/components/ui/loading";
import { EmptyState } from "@/components/shared/EmptyState";
import { PhoneRecordList } from "@/components/shared/PhoneRecordList";
import type { ExportColumn } from "@/lib/export";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { formatCount, formatListDate } from "@/lib/ui/intlFormat";

interface Placement {
  _id: string;
  jobSeekerId?: { fullName?: string };
  jobId?: { title?: string };
  employerId?: { companyName?: string };
  status: string;
  salary?: number;
  currency?: string;
  startDate?: string;
  createdAt: string;
}

// Status options are built dynamically in component with translations

export default function AgentPlacementsPage() {
  const t = useTranslations("agentPlacements");
  const tc = useTranslations("common");
  const locale = useLocale();

  const pagination = usePagination();
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [loading, setLoading] = useState(true);
  // Filters live in the query string so a filtered view of this list is an
  // address the dashboard, a badge or the palette can link to.
  const [search, setSearch] = useUrlFilter("search", "", { debounceMs: 400 });
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useUrlFilter("status", "all");
  const [dateFrom, setDateFrom] = useUrlFilter("dateFrom", "");
  const [dateTo, setDateTo] = useUrlFilter("dateTo", "");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const phoneFilterCount = [statusFilter !== "all", dateFrom, dateTo].filter(Boolean).length;

  // Build STATUS_OPTIONS dynamically with translations
  const STATUS_OPTIONS = [
    { value: "all", label: t("statusAllStatuses") },
    { value: "pending", label: t("statusPending") },
    { value: "offer", label: t("statusOffer") },
    { value: "completed", label: t("statusCompleted") },
    { value: "hired", label: t("statusHired") },
    { value: "rejected", label: t("statusRejected") },
  ];

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchPlacements = useCallback(async () => {
    setLoading(true);
    const params = pagination.paginationParams();
    if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    const res = await fetch(`/api/placements?${params}`);
    if (res.ok) {
      const data = await res.json();
      setPlacements(data.items ?? data.placements ?? []);
      pagination.updateTotal(data.total ?? 0);
    }
    setLoading(false);
  }, [pagination.page, pagination.limit, statusFilter, debouncedSearch, dateFrom, dateTo]);

  useEffect(() => { fetchPlacements(); }, [fetchPlacements]);
  useEffect(() => { pagination.resetPage(); }, [statusFilter, debouncedSearch, dateFrom, dateTo]);

  const clearAllFilters = () => {
    setStatusFilter("all");
    setSearch("");
    setDateFrom("");
    setDateTo("");
  };

  const hasActiveFilters = (statusFilter !== "all") || debouncedSearch || dateFrom || dateTo;

  // BUG-05: model status enum is active/completed/terminated — legacy "hired" /
  // "offer" / "signed" strings never occur, so count the real placed states.
  const completedPlacements = placements.filter((placement) => placement.status === "completed" || placement.status === "active").length;
  const signedOffers = placements.filter((placement) => placement.status === "offer" || placement.status === "signed").length;
  const startedCount = placements.filter((placement) => Boolean(placement.startDate)).length;
  const totalCompensation = placements.reduce((sum, placement) => sum + (placement.salary ?? 0), 0);

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: t("tableHeaderCandidate"), key: "jobSeekerId", formatter: (_v, row) => (row.jobSeekerId as { fullName?: string })?.fullName ?? "" },
    { header: t("tableHeaderJob"), key: "jobId", formatter: (_v, row) => (row.jobId as { title?: string })?.title ?? "" },
    { header: t("tableHeaderEmployer"), key: "employerId", formatter: (_v, row) => (row.employerId as { companyName?: string })?.companyName ?? "" },
    { header: t("tableHeaderSalary"), key: "salary" },
    { header: t("tableHeaderCurrency"), key: "currency" },
    { header: tc("status"), key: "status" },
    { header: t("tableHeaderStartDate"), key: "startDate", formatter: (v) => v ? formatListDate(String(v), locale) : "" },
  ];

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: placements as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "agent-placements",
    title: t("pageTitle"),
  });

  const emptyState = (
    <EmptyState
      icon={Inbox}
      title={t("noPlacementsYet")}
      description={t("noPlacementsDescription")}
      action={hasActiveFilters ? (
        <Button variant="outline" onClick={clearAllFilters} className="min-h-11 rounded-xl px-4 text-sm sm:min-h-9">
          Clear filters
        </Button>
      ) : (
        <Button variant="outline" asChild className="min-h-11 rounded-xl px-4 text-sm sm:min-h-9">
          <Link href="../offers">{t("viewOffers")}</Link>
        </Button>
      )}
    />
  );

  return (
    <div className="page-container">
      <WorkspaceHeader
        title={t("pageTitle")}
        context={`${pagination.total} ${t("records")}`}
        metrics={[
          { label: t("statCompleted"), value: completedPlacements, icon: UserCheck, tone: "success" },
          { label: t("statOfferStage"), value: signedOffers, icon: BriefcaseBusiness, tone: "primary" },
          { label: t("statStartDates"), value: startedCount, icon: ArrowRight, tone: "info" },
          { label: t("statSalaryValue"), value: formatCount(totalCompensation), icon: CircleDollarSign, tone: "warning" },
        ]}
      />

      <InlineFilterBar
        className="workspace-panel-surface rounded-2xl border-b-0 max-sm:!border-0 max-sm:!bg-transparent max-sm:!p-0 max-sm:!shadow-none"
        moreToggleClassName="max-sm:hidden"
        moreClassName="max-sm:hidden"
        more={(
          <>
            <SearchableSelect
              id="agent-placements-status"
              className="h-11 w-32 rounded-lg text-xs sm:h-9 sm:text-sm"
              options={STATUS_OPTIONS}
              value={statusFilter}
              onValueChange={(v) => { setStatusFilter(v); pagination.resetPage(); }}
              placeholder={t("statusAllStatuses")}
            />
            <DateTimePicker
              mode="date"
              value={dateFrom}
              onChange={(v) => { setDateFrom(v); pagination.resetPage(); }}
              className="h-11 rounded-lg text-sm"
              placeholder={t("dateFromLabel")}
            />
            <DateTimePicker
              mode="date"
              value={dateTo}
              onChange={(v) => { setDateTo(v); pagination.resetPage(); }}
              className="h-11 rounded-lg text-sm"
              placeholder={t("dateToLabel")}
            />
          </>
        )}
        moreLabel="Filter"
        moreActiveCount={[statusFilter !== "all", dateFrom, dateTo].filter(Boolean).length}
        moreOpen={false}
        onClear={hasActiveFilters ? clearAllFilters : undefined}
        clearLabel={tc("status")}
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
      >
        <InlineFilterSearch
          value={search}
          onChange={(value) => { setSearch(value); pagination.resetPage(); }}
          placeholder={t("searchPlaceholder")}
        />
        <PhoneFiltersButton activeCount={phoneFilterCount} onClick={() => setFilterSheetOpen(true)} />
      </InlineFilterBar>

      <PhoneFilterSheet
        open={filterSheetOpen}
        onOpenChange={setFilterSheetOpen}
        activeCount={phoneFilterCount}
        onClear={() => { setStatusFilter("all"); setDateFrom(""); setDateTo(""); pagination.resetPage(); }}
      >
        <FilterField label={t("filterTagStatus")} htmlFor="agent-placements-sheet-status">
          <SearchableSelect
            id="agent-placements-sheet-status"
            className={SHEET_CONTROL}
            options={STATUS_OPTIONS}
            value={statusFilter}
            onValueChange={(v) => { setStatusFilter(v); pagination.resetPage(); }}
            placeholder={t("statusAllStatuses")}
          />
        </FilterField>
        <FilterField label={t("dateFromLabel")} htmlFor="agent-placements-sheet-from">
          <DateTimePicker
            id="agent-placements-sheet-from"
            mode="date"
            value={dateFrom}
            onChange={(v) => { setDateFrom(v); pagination.resetPage(); }}
            className={SHEET_CONTROL}
            placeholder={t("dateFromLabel")}
          />
        </FilterField>
        <FilterField label={t("dateToLabel")} htmlFor="agent-placements-sheet-to">
          <DateTimePicker
            id="agent-placements-sheet-to"
            mode="date"
            value={dateTo}
            onChange={(v) => { setDateTo(v); pagination.resetPage(); }}
            className={SHEET_CONTROL}
            placeholder={t("dateToLabel")}
          />
        </FilterField>
      </PhoneFilterSheet>

      <PhoneRecordList
        className="sm:hidden"
        label={t("pageTitle")}
        loading={loading}
        empty={emptyState}
        items={placements.map((p) => ({
          key: p._id,
          title: p.jobSeekerId?.fullName ?? "—",
          subtitle: `${p.jobId?.title ?? "—"} · ${p.employerId?.companyName ?? "—"}`,
          trailing: <StatusBadge status={p.status} />,
          facts: [
            p.salary ? `${p.currency ?? "USD"} ${formatCount(p.salary)}` : "—",
            p.startDate ? formatListDate(p.startDate, locale) : "—",
          ],
        }))}
      />

      <section className="workspace-panel-surface overflow-hidden rounded-2xl max-sm:hidden">
        <Table data-mobile-table="scroll">
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead>{t("tableHeaderCandidate")}</TableHead>
              <TableHead>{t("tableHeaderJob")}</TableHead>
              <TableHead>{t("tableHeaderSalary")}</TableHead>
              <TableHead>{t("tableHeaderStartDate")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableBodySkeleton rows={5} cols={4} />
            ) : placements.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="py-12">
                  {emptyState}
                </TableCell>
              </TableRow>
            ) : placements.map((p) => (
              <TableRow key={p._id} className="group">
                <TableCell>
                  <span className="block font-medium text-foreground">{p.jobSeekerId?.fullName ?? "—"}</span>
                  <StatusBadge status={p.status} />
                </TableCell>
                <TableCell className="text-foreground/80">
                  <span className="block">{p.jobId?.title ?? "—"}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{p.employerId?.companyName ?? "—"}</span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {p.salary ? `${p.currency ?? "USD"} ${formatCount(p.salary)}` : "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{p.startDate ? formatListDate(p.startDate, locale) : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      {pagination.total > 0 && (
        <PaginationControls
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          limit={pagination.limit}
          onPageChange={pagination.setPage}
          onLimitChange={pagination.setLimit}
        />
      )}
    </div>
  );
}
