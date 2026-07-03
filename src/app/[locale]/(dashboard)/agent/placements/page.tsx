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
import { ArrowRight, BriefcaseBusiness, CircleDollarSign, Filter, Inbox, RotateCcw, Search, Sparkles, UserCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import type { ExportColumn } from "@/lib/export";

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
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Build STATUS_OPTIONS dynamically with translations
  const STATUS_OPTIONS = [
    { value: "", label: t("statusAllStatuses") },
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
    if (statusFilter) params.set("status", statusFilter);
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
    setStatusFilter("");
    setSearch("");
    setDateFrom("");
    setDateTo("");
  };

  const hasActiveFilters = statusFilter || debouncedSearch || dateFrom || dateTo;

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
    { header: t("tableHeaderStartDate"), key: "startDate", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : "" },
  ];

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: placements as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "agent-placements",
    title: t("pageTitle"),
  });

  return (
    <div className="page-container agent-legacy-surface space-y-6">
      <section className="workspace-hero-surface agent-legacy-hero overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary"><Sparkles className="h-3.5 w-3.5" />{t("workspaceLabel")}</div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">{t("pageTitle")}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{t("pageDescription")}</p>
          </div>
          <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left sm:min-w-[260px]"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("placementBook")}</p><p className="mt-1 text-lg font-semibold text-foreground">{pagination.total} {t("records")}</p><p className="text-xs text-muted-foreground">{t("placementBookDescription")}</p></div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="workspace-glass-panel rounded-2xl p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("statCompleted")}</p><p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{completedPlacements}</p><p className="mt-1 text-xs text-muted-foreground">{t("statCompletedDesc")}</p></div><div className="workspace-tone-emerald rounded-2xl p-2.5"><UserCheck className="h-5 w-5" /></div></div></div>
          <div className="workspace-glass-panel rounded-2xl p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("statOfferStage")}</p><p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{signedOffers}</p><p className="mt-1 text-xs text-muted-foreground">{t("statOfferStageDesc")}</p></div><div className="workspace-tone-sky rounded-2xl p-2.5"><BriefcaseBusiness className="h-5 w-5" /></div></div></div>
          <div className="workspace-glass-panel rounded-2xl p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("statStartDates")}</p><p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{startedCount}</p><p className="mt-1 text-xs text-muted-foreground">{t("statStartDatesDesc")}</p></div><div className="workspace-tone-indigo rounded-2xl p-2.5"><ArrowRight className="h-5 w-5" /></div></div></div>
          <div className="workspace-glass-panel rounded-2xl p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("statSalaryValue")}</p><p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{totalCompensation.toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">{t("statSalaryValueDesc")}</p></div><div className="workspace-tone-amber rounded-2xl p-2.5"><CircleDollarSign className="h-5 w-5" /></div></div></div>
        </div>
      </section>

      <section className="workspace-panel-surface rounded-[28px] p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("filterLabel")}</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{t("filterSubtitle")}</h2>
          </div>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearAllFilters} className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />{t("clearAll")}
            </Button>
          )}
        </div>

        <div className="relative mt-5 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-10 w-full rounded-xl border border-border bg-background/70 pl-10 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{tc("status")}</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectClass}>
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:max-w-md">
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t("dateFromLabel")}</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={selectClass} />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t("dateToLabel")}</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={selectClass} />
          </div>
        </div>

        {hasActiveFilters && (
          <div className="mt-4 flex flex-wrap gap-2">
            {statusFilter && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                <Filter className="h-3 w-3" />{t("filterTagStatus")}: {STATUS_OPTIONS.find(o => o.value === statusFilter)?.label}
                <button type="button" onClick={() => setStatusFilter("")} className="ml-0.5 hover:text-primary/70"><X className="h-3 w-3" /></button>
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
      </section>

      <section className="workspace-panel-surface rounded-[28px] p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("resultsLabel")}</p><h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{t("resultsSubtitle")}</h2></div><div className="workspace-muted-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium"><ArrowRight className="h-3.5 w-3.5 text-primary" />{t("resultsPagination", { total: pagination.total, pages: pagination.totalPages, plural: pagination.totalPages === 1 ? "" : "s" })}</div></div>
        <TableToolbar
          onExportCsv={handleExportCsv}
          onExportExcel={handleExportExcel}
          onExportPdf={handleExportPdf}
          className="mt-4"
        />
        <div className="workspace-subtle-surface mt-5 overflow-hidden rounded-[24px]">
        <Table>
          <TableHeader>
            <TableRow className="workspace-subtle-surface hover:bg-secondary/70">
              <TableHead>{t("tableHeaderCandidate")}</TableHead>
              <TableHead>{t("tableHeaderJob")}</TableHead>
              <TableHead>{t("tableHeaderEmployer")}</TableHead>
              <TableHead>{t("tableHeaderSalary")}</TableHead>
              <TableHead>{tc("status")}</TableHead>
              <TableHead>{t("tableHeaderStartDate")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : placements.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm">{t("noPlacementsYet")}</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : placements.map((p) => (
              <TableRow key={p._id} className="hover:bg-secondary/50">
                <TableCell className="font-medium text-foreground">{p.jobSeekerId?.fullName ?? "—"}</TableCell>
                <TableCell className="text-foreground/80">{p.jobId?.title ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{p.employerId?.companyName ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {p.salary ? `${p.currency ?? "USD"} ${p.salary.toLocaleString()}` : "—"}
                </TableCell>
                <TableCell><StatusBadge status={p.status} /></TableCell>
                <TableCell className="text-muted-foreground">{p.startDate ? new Date(p.startDate).toLocaleDateString() : "—"}</TableCell>
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
