"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowRight, CalendarDays, Clock, DollarSign, Inbox, RotateCcw, Search, SlidersHorizontal, Sparkles, TrendingUp, X } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import type { ExportColumn } from "@/lib/export";

interface Commission {
  _id: string;
  amount: number;
  currency: string;
  status: string;
  type: string;
  placementId?: { jobTitle?: string; candidateName?: string };
  disputeReason?: string;
  clawbackAmount?: number;
  clawbackReason?: string;
  createdAt: string;
  paidAt?: string;
}

interface Summary {
  pending: number;
  approved: number;
  paid: number;
  disputed: number;
  clawed_back: number;
  currency: string;
}

export default function AgentCommissionsPage() {
  const t = useTranslations("agentCommissions");
  const { can } = usePermissions();
  const pagination = usePagination();
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [currencyFilter, setCurrencyFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [currencyCode, setCurrencyCode] = useState("AED");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const TYPE_OPTIONS = [
    { value: "all", label: t("typeFilterAll") },
    { value: "placement", label: t("typeFilterPlacement") },
    { value: "override", label: t("typeFilterOverride") },
    { value: "bonus", label: t("typeFilterBonus") },
  ];

  const CURRENCY_OPTIONS = [
    { value: "all", label: t("currencyFilterAll") },
    { value: "AED", label: "AED" },
    { value: "SAR", label: "SAR" },
    { value: "QAR", label: "QAR" },
    { value: "KWD", label: "KWD" },
    { value: "BHD", label: "BHD" },
    { value: "OMR", label: "OMR" },
    { value: "INR", label: "INR" },
    { value: "USD", label: "USD" },
    { value: "GBP", label: "GBP" },
    { value: "EUR", label: "EUR" },
  ];

  const hasActiveFilters = search.trim() !== "" || typeFilter !== "all" || currencyFilter !== "all" || dateFrom !== "" || dateTo !== "";

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: t("tableHeaderPlacement"), key: "placementId", formatter: (_v, row) => (row.placementId as { jobTitle?: string })?.jobTitle ?? "" },
    { header: t("exportHeaderCandidate"), key: "placementId", formatter: (_v, row) => (row.placementId as { candidateName?: string })?.candidateName ?? "" },
    { header: t("tableHeaderType"), key: "type" },
    { header: t("tableHeaderAmount"), key: "amount" },
    { header: t("exportHeaderCurrency"), key: "currency" },
    { header: t("tableHeaderStatus"), key: "status" },
    { header: t("tableHeaderDate"), key: "createdAt", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : "" },
  ];

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: commissions as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "agent-commissions",
    title: t("exportTitle"),
  });

  useEffect(() => {
    fetch("/api/agent/settings")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.settings?.currencyCode) setCurrencyCode(data.settings.currencyCode);
      })
      .catch(() => {});
  }, []);

  const loadCommissions = useCallback(async () => {
    setLoading(true);
    try {
      const params = pagination.paginationParams();
      if (filter !== "all") params.set("status", filter);
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (currencyFilter !== "all") params.set("currency", currencyFilter);
      if (search.trim()) params.set("search", search.trim());
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const res = await fetch(`/api/commissions?${params}`);
      if (res.ok) {
        const data = await res.json();
        setCommissions(data.commissions ?? []);
        setSummary(data.summary ?? null);
        pagination.updateTotal(data.total ?? data.pagination?.total ?? data.commissions?.length ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [filter, typeFilter, currencyFilter, search, dateFrom, dateTo, pagination.page, pagination.limit]);

  useEffect(() => { loadCommissions(); }, [loadCommissions]);

  useEffect(() => { pagination.resetPage(); }, [filter, typeFilter, currencyFilter, search, dateFrom, dateTo]);

  const handleSearchChange = (value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(value), 400);
  };

  const clearFilters = () => {
    setFilter("all");
    setTypeFilter("all");
    setCurrencyFilter("all");
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setShowAdvanced(false);
  };

  const statusColor = (status: string) => {
    if (status === "paid") return "text-[hsl(var(--status-selected))]";
    if (status === "approved") return "text-[hsl(var(--status-applied))]";
    if (status === "disputed") return "text-red-600";
    return "text-[hsl(var(--status-shortlisted))]";
  };

  return (
    <div className="page-container agent-legacy-surface space-y-6">
      {/* ── Hero ── */}
      <section className="workspace-hero-surface agent-legacy-hero overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary"><Sparkles className="h-3.5 w-3.5" />{t("agentWorkspace")}</div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">{t("pageTitle")}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{t("pageDescription")}</p>
          </div>
          <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left sm:min-w-[260px]"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("ledgerLabel")}</p><p className="mt-1 text-lg font-semibold text-foreground">{pagination.total} {t("commissionRecords")}</p><p className="text-xs text-muted-foreground">{t("ledgerDescription")}</p></div>
        </div>
        {summary && (
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { key: "pending", value: summary.pending, color: "text-amber-600", tone: "workspace-tone-amber", icon: Clock },
              { key: "approved", value: summary.approved, color: "text-blue-600", tone: "workspace-tone-sky", icon: TrendingUp },
              { key: "paid", value: summary.paid, color: "text-green-600", tone: "workspace-tone-emerald", icon: DollarSign },
              { key: "disputed", value: summary.disputed ?? 0, color: "text-red-600", tone: "workspace-tone-rose", icon: X },
            ].map(({ key, value, color, tone, icon: Icon }) => (
              <div key={key} className="workspace-glass-panel rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t(`summaryCard${key.charAt(0).toUpperCase() + key.slice(1)}Label`)}</p><p className={`mt-3 text-2xl font-semibold tracking-tight ${color}`}>{formatCurrency(value, currencyCode)}</p><p className="mt-1 text-xs text-muted-foreground">{t(`summaryCard${key.charAt(0).toUpperCase() + key.slice(1)}Value`)}</p></div><div className={`rounded-2xl p-2.5 ${tone}`}><Icon className="h-5 w-5" /></div></div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Search & Filters ── */}
      <section className="workspace-panel-surface rounded-[28px] p-4 sm:p-5 space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("filterLedgerLabel")}</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{t("filterLedgerHeading")}</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAdvanced((v) => !v)}
              className={`workspace-muted-pill h-9 rounded-xl px-3 text-xs hover:bg-card ${showAdvanced ? "workspace-tone-sky border-transparent" : ""}`}
            >
              <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
              {t("advancedButton")}
            </Button>
            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearFilters}
                className="workspace-muted-pill h-9 rounded-xl px-3 text-xs hover:bg-card"
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                {t("clearFiltersButton")}
              </Button>
            )}
          </div>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("searchPlaceholder")}
            defaultValue={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="h-11 rounded-xl border-border bg-secondary/65 pl-10 pr-10"
          />
          {search && (
            <button onClick={() => { setSearch(""); const el = document.querySelector<HTMLInputElement>(`[placeholder="${t("searchPlaceholder")}"]`); if (el) el.value = ""; }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Status pills */}
        <div className="flex flex-wrap gap-2">
          {["all", "pending", "approved", "paid", "disputed"].map((status) => {
            const isSelected = filter === status;
            return (
              <Button
                key={status}
                onClick={() => setFilter(status)}
                size="sm"
                aria-pressed={isSelected}
                variant="outline"
                className={isSelected
                  ? "workspace-tone-sky h-10 rounded-xl border-transparent px-4 capitalize hover:opacity-90"
                  : "workspace-muted-pill h-10 rounded-xl px-4 capitalize hover:bg-card"
                }
              >
                {t(`statusLabel${status.charAt(0).toUpperCase() + status.slice(1)}`)}
              </Button>
            );
          })}
        </div>

        {/* Advanced filters */}
        {showAdvanced && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 rounded-2xl workspace-subtle-surface p-4">
            <div>
              <label htmlFor="agent-commissions-type" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("typeFilterLabel")}</label>
              <SearchableSelect
                id="agent-commissions-type"
                className="h-11 w-full rounded-xl border-border bg-secondary/65"
                options={TYPE_OPTIONS}
                value={typeFilter}
                onValueChange={(v) => setTypeFilter(v)}
                placeholder={t("typeFilterAll")}
              />
            </div>
            <div>
              <label htmlFor="agent-commissions-currency" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("currencyFilterLabel")}</label>
              <SearchableSelect
                id="agent-commissions-currency"
                className="h-11 w-full rounded-xl border-border bg-secondary/65"
                options={CURRENCY_OPTIONS}
                value={currencyFilter}
                onValueChange={(v) => setCurrencyFilter(v)}
                placeholder={t("currencyFilterAll")}
              />
            </div>
            <div>
              <label htmlFor="agent-commissions-date-from" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("dateFromLabel")}</label>
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="agent-commissions-date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-11 rounded-xl border-border bg-secondary/65 pl-10"
                />
              </div>
            </div>
            <div>
              <label htmlFor="agent-commissions-date-to" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("dateToLabel")}</label>
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="agent-commissions-date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-11 rounded-xl border-border bg-secondary/65 pl-10"
                />
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── Results table ── */}
      <section className="workspace-panel-surface rounded-[28px] p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("resultsLabel")}</p><h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{t("resultsHeading")}</h2></div><div className="workspace-muted-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium"><ArrowRight className="h-3.5 w-3.5 text-primary" />{t("paginationSummary", { total: pagination.total, pages: pagination.totalPages })}</div></div>
        <TableToolbar
          onExportCsv={handleExportCsv}
          onExportExcel={handleExportExcel}
          onExportPdf={handleExportPdf}
          className="mb-4"
        />
        <div className="workspace-subtle-surface mt-5 overflow-hidden rounded-[24px]">
        <Table>
          <TableHeader>
            <TableRow className="workspace-subtle-surface hover:bg-secondary/70">
              <TableHead>{t("tableHeaderPlacement")}</TableHead>
              <TableHead>{t("tableHeaderType")}</TableHead>
              <TableHead>{t("tableHeaderAmount")}</TableHead>
              <TableHead>{t("tableHeaderStatus")}</TableHead>
              <TableHead>{t("tableHeaderDate")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : commissions.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm">{hasActiveFilters ? t("noCommissionsMatched") : t("noCommissionsYet")}</span>
                    {hasActiveFilters && (
                      <Button variant="outline" size="sm" onClick={clearFilters} className="mt-2 rounded-xl text-xs">
                        <RotateCcw className="mr-1.5 h-3 w-3" />{t("clearFiltersButton")}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : commissions.map((c) => (
              <TableRow key={c._id} className="hover:bg-secondary/50">
                <TableCell>
                  <p className="font-medium text-foreground">{c.placementId?.jobTitle ?? t("placementFallback")}</p>
                  {c.placementId?.candidateName && (
                    <p className="text-xs text-muted-foreground">{c.placementId.candidateName}</p>
                  )}
                </TableCell>
                <TableCell className="capitalize text-muted-foreground">{c.type?.replace("_", " ")}</TableCell>
                <TableCell className={`font-bold ${statusColor(c.status)}`}>
                  {formatCurrency(c.amount, c.currency || currencyCode)}
                </TableCell>
                <TableCell><StatusBadge status={c.status} /></TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(c.paidAt ?? c.createdAt).toLocaleDateString()}
                </TableCell>
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
