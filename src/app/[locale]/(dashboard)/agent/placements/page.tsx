"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { usePermissions } from "@/hooks/usePermissions";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowRight, BriefcaseBusiness, CircleDollarSign, Filter, Inbox, RotateCcw, Search, UserCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import type { ExportColumn } from "@/lib/export";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { formatCount, formatDate } from "@/lib/ui/intlFormat";

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

const selectClass = "h-10 w-full rounded-xl border border-border bg-background/70 px-3 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20";

export default function AgentPlacementsPage() {
  const t = useTranslations("agentPlacements");
  const tc = useTranslations("common");
  const tt = useTranslations("table");

  const { can } = usePermissions();
  const pagination = usePagination();
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

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

  const completedPlacements = placements.filter((placement) => placement.status === "completed" || placement.status === "hired").length;
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
    { header: t("tableHeaderStartDate"), key: "startDate", formatter: (v) => v ? formatDate(new Date(String(v))) : "" },
  ];

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: placements as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "agent-placements",
    title: t("pageTitle"),
  });

  return (
    <div className="page-container">
      <DashboardPageHeader
        icon={UserCheck}
        title={t("pageTitle")}
        description={t("pageDescription")}
        summary={{ label: t("placementBook"), value: `${pagination.total} ${t("records")}` }}
        metrics={[
          { label: t("statCompleted"), value: completedPlacements, icon: UserCheck },
          { label: t("statOfferStage"), value: signedOffers, icon: BriefcaseBusiness },
          { label: t("statStartDates"), value: startedCount, icon: ArrowRight },
          { label: t("statSalaryValue"), value: formatCount(totalCompensation), icon: CircleDollarSign },
        ]}
        compactOnMobile
      />

      {/* One panel: search, status and dates inline on the list header, table
          below. The filter card carried its own label and heading before a
          single select — two headings for one dropdown. */}
      <section className="workspace-panel-surface rounded-3xl panel-body" data-table-toolbar="simple">
        <div className="space-y-3 border-b border-border pb-3 sm:pb-4 sm:flex sm:flex-wrap sm:items-end sm:gap-2">
          <p className="w-full text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:w-auto sm:pb-2.5">
            {t("resultsLabel")}
          </p>

          {/* Search row - full width on mobile */}
          <div className="relative toolbar-search-field w-full sm:ms-auto sm:w-56 sm:flex-none">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="h-11 sm:h-10 w-full rounded-xl border border-border bg-background/70 ps-10 pe-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          </div>

          {/* Status and Export row on mobile */}
          <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:flex sm:gap-2">
            <div className="flex flex-col min-w-0">
              <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
                {tc("status")}
              </label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-11 sm:h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col items-end justify-end">
              <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
                {tc("export")}
              </label>
              <TableToolbar
                onExportCsv={handleExportCsv}
                onExportExcel={handleExportExcel}
                onExportPdf={handleExportPdf}
                className="w-full sm:shrink-0"
              />
            </div>
          </div>

          {/* Date pickers row on mobile */}
          <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:flex sm:gap-2">
            <div className="flex flex-col min-w-0">
              <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
                {t("dateFromLabel")}
              </label>
              <DateTimePicker mode="date" value={dateFrom} onChange={setDateFrom} placeholder={t("dateFromLabel")} />
            </div>
            <div className="flex flex-col min-w-0">
              <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
                {t("dateToLabel")}
              </label>
              <DateTimePicker mode="date" value={dateTo} onChange={setDateTo} placeholder={t("dateToLabel")} />
            </div>
          </div>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearAllFilters} className="h-11 sm:h-10 w-full sm:w-auto shrink-0 gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />{t("clearAll")}
            </Button>
          )}
        </div>

        {hasActiveFilters && (
          <div className="mt-4 flex flex-wrap gap-2">
            {statusFilter !== "all" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                <Filter className="h-3 w-3" />{t("filterTagStatus")}: {STATUS_OPTIONS.find(o => o.value === statusFilter)?.label}
                <button type="button" onClick={() => setStatusFilter("all")} className="ml-0.5 hover:text-primary/70"><X className="h-3 w-3" /></button>
              </span>
            )}
            {(dateFrom || dateTo) && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                <Filter className="h-3 w-3" />{t("filterTagDate")}: {dateFrom || "..."} – {dateTo || "..."}
                <button type="button" onClick={() => { setDateFrom(""); setDateTo(""); }} className="ml-0.5 hover:text-primary/70"><X className="h-3 w-3" /></button>
              </span>
            )}
            {debouncedSearch && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                <Search className="h-3 w-3" />{t("filterTagSearch")}: &quot;{debouncedSearch}&quot;
                <button type="button" onClick={() => setSearch("")} className="ml-0.5 hover:text-primary/70"><X className="h-3 w-3" /></button>
              </span>
            )}
          </div>
        )}

        <div className="workspace-subtle-surface mt-4 overflow-hidden rounded-3xl">
        <Table>
          <TableHeader>
            <TableRow className="workspace-subtle-surface hover:bg-secondary/70">
              <TableHead>{t("tableHeaderCandidate")}</TableHead>
              <TableHead>{t("tableHeaderJob")}</TableHead>
              <TableHead>{t("tableHeaderSalary")}</TableHead>
              <TableHead>{t("tableHeaderStartDate")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : placements.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm">{t("noPlacementsYet")}</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : placements.map((p) => (
              <TableRow key={p._id} className="hover:bg-secondary/50">
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
                <TableCell className="text-muted-foreground">{p.startDate ? formatDate(new Date(p.startDate)) : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </section>

      <PaginationControls
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        limit={pagination.limit}
        onPageChange={pagination.setPage}
        onLimitChange={pagination.setLimit}
      />
    </div>
  );
}
