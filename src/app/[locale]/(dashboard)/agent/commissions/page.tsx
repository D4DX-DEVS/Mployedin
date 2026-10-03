"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Clock, DollarSign, Inbox, TrendingUp, X } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { useTableExport } from "@/hooks/useTableExport";
import { InlineFilterBar, InlineFilterSearch } from "@/components/shared/InlineFilterBar";
import { TableBodySkeleton } from "@/components/ui/loading";
import { EmptyState } from "@/components/shared/EmptyState";
import type { ExportColumn } from "@/lib/export";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { formatListDate } from "@/lib/ui/intlFormat";

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
  const locale = useLocale();
  const pagination = usePagination();
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  // Query-string filters: "unpaid commissions" is a view the dashboard and the
  // ⌘K palette link to, so it needs an address of its own.
  const [filter, setFilter] = useUrlFilter("status", "all");
  const [typeFilter, setTypeFilter] = useUrlFilter("type", "all");
  const [currencyFilter, setCurrencyFilter] = useUrlFilter("currency", "all");
  const [search, setSearch] = useUrlFilter("search", "", { debounceMs: 400 });
  const [dateFrom, setDateFrom] = useUrlFilter("dateFrom", "");
  const [dateTo, setDateTo] = useUrlFilter("dateTo", "");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [currencyCode, setCurrencyCode] = useState("AED");

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
    { header: t("tableHeaderDate"), key: "createdAt", formatter: (v) => v ? formatListDate(String(v), locale) : "" },
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

  // useUrlFilter already debounces the write, and the returned value updates
  // immediately, so the input can be controlled and the local timer is gone.
  const handleSearchChange = (value: string) => setSearch(value);

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
    if (status === "disputed") return "text-status-rejected";
    return "text-[hsl(var(--status-shortlisted))]";
  };

  return (
    <div className="page-container">
      <WorkspaceHeader
        title={t("pageTitle")}
        context={`${pagination.total} ${t("commissionRecords")}`}
        // Each cell filters to the status it totals, so "Pending 4,200" is the
        // way into those commissions rather than a number to read and re-find.
        metrics={summary ? [
          { label: t("summaryCardPendingLabel"), value: formatCurrency(summary.pending, currencyCode), icon: Clock, tone: "warning",
            onClick: () => setFilter(filter === "pending" ? "all" : "pending"), active: filter === "pending" },
          { label: t("summaryCardApprovedLabel"), value: formatCurrency(summary.approved, currencyCode), icon: TrendingUp, tone: "info",
            onClick: () => setFilter(filter === "approved" ? "all" : "approved"), active: filter === "approved" },
          { label: t("summaryCardPaidLabel"), value: formatCurrency(summary.paid, currencyCode), icon: DollarSign, tone: "success",
            onClick: () => setFilter(filter === "paid" ? "all" : "paid"), active: filter === "paid" },
          { label: t("summaryCardDisputedLabel"), value: formatCurrency(summary.disputed ?? 0, currencyCode), icon: X, tone: "primary",
            onClick: () => setFilter(filter === "disputed" ? "all" : "disputed"), active: filter === "disputed" },
        ] : undefined}
      />

      <InlineFilterBar
        className="workspace-panel-surface rounded-2xl border-b-0"
        more={(
          <>
            <SearchableSelect
              id="agent-commissions-type"
              className="h-11 w-32 rounded-lg text-xs sm:h-9 sm:text-sm"
              options={TYPE_OPTIONS}
              value={typeFilter}
              onValueChange={(v) => setTypeFilter(v)}
              placeholder={t("typeFilterAll")}
            />
            <SearchableSelect
              id="agent-commissions-currency"
              className="h-11 w-32 rounded-lg text-xs sm:h-9 sm:text-sm"
              options={CURRENCY_OPTIONS}
              value={currencyFilter}
              onValueChange={(v) => setCurrencyFilter(v)}
              placeholder={t("currencyFilterAll")}
            />
            <DateTimePicker
              mode="date"
              value={dateFrom}
              onChange={setDateFrom}
              className="h-11 rounded-lg text-sm"
              placeholder="From"
            />
            <DateTimePicker
              mode="date"
              value={dateTo}
              onChange={setDateTo}
              className="h-11 rounded-lg text-sm"
              placeholder="To"
            />
          </>
        )}
        moreLabel={t("advancedButton")}
        moreActiveCount={[typeFilter !== "all", currencyFilter !== "all", dateFrom, dateTo].filter(Boolean).length}
        moreOpen={showAdvanced}
        onMoreOpenChange={setShowAdvanced}
        onClear={hasActiveFilters ? clearFilters : undefined}
        clearLabel={t("clearFiltersButton")}
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
      >
        <InlineFilterSearch
          value={search}
          onChange={(value) => { handleSearchChange(value); pagination.resetPage(); }}
          placeholder={t("searchPlaceholder")}
        />
      </InlineFilterBar>

      {/* Status filters as an inline row */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {["all", "pending", "approved", "paid", "disputed", "clawed_back"].map((status) => {
          const isSelected = filter === status;
          return (
            <Button
              key={status}
              onClick={() => { setFilter(status); pagination.resetPage(); }}
              size="sm"
              aria-pressed={isSelected}
              variant={isSelected ? "default" : "outline"}
              className={isSelected
                ? "min-h-10 sm:h-9 rounded-lg capitalize"
                : "min-h-10 sm:h-9 rounded-lg capitalize"
              }
            >
              {t(`statusLabel${status.charAt(0).toUpperCase() + status.slice(1)}`)}
            </Button>
          );
        })}
      </div>

      <section className="workspace-panel-surface overflow-hidden rounded-2xl">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead>{t("tableHeaderPlacement")}</TableHead>
              <TableHead>{t("tableHeaderType")}</TableHead>
              <TableHead>{t("tableHeaderAmount")}</TableHead>
              <TableHead>{t("tableHeaderStatus")}</TableHead>
              <TableHead>{t("tableHeaderDate")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableBodySkeleton rows={5} cols={5} />
            ) : commissions.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="py-12">
                  <EmptyState
                    icon={Inbox}
                    title={hasActiveFilters ? t("noCommissionsMatched") : t("noCommissionsYet")}
                    action={hasActiveFilters ? (
                      <Button variant="outline" onClick={clearFilters} className="min-h-11 rounded-xl px-4 text-sm sm:min-h-9">
                        {t("clearFiltersButton")}
                      </Button>
                    ) : undefined}
                  />
                </TableCell>
              </TableRow>
            ) : commissions.map((c) => (
              <TableRow key={c._id} className="group">
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
                <TableCell className="text-sm text-muted-foreground">
                  {formatListDate(c.paidAt ?? c.createdAt, locale)}
                </TableCell>
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
