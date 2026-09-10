"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { useInvoiceAnalytics } from "@/hooks/useInvoiceAnalytics";
import { useCurrencyPreference } from "@/hooks/useCurrencyPreference";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Plus, RotateCcw,
  BarChart3, FileText, RefreshCw, CircleDollarSign, CheckCircle2, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { InvoiceTable } from "@/components/shared/InvoiceTable";
import type { ExportColumn } from "@/lib/export";

import { InvoiceBuilder } from "@/components/features/invoices/InvoiceBuilder";
import { InvoiceDetailView } from "@/components/features/invoices/InvoiceDetailView";
import { RevenueAnalyticsPanel } from "@/components/features/invoices/RevenueAnalyticsPanel";
import { formatCount, formatDate } from "@/lib/ui/intlFormat";

// ── Types ────────────────────────────────────────────────────────────────────
interface Invoice {
  _id: string;
  invoiceNumber: string;
  category: string;
  type: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  amount: number;
  currency: string;
  status: string;
  dueDate?: string;
  issuedAt: string;
  jobId?: { title?: string; _id?: string };
  employerId?: { companyName?: string; _id?: string };
  commissions?: Array<{ role: string; rate: number; amount: number; status: string }>;
  platformRevenue?: number;
  createdAt: string;
}

export default function AgentInvoicesPage() {
  const t = useTranslations("agentInvoices");
  const tc = useTranslations("common");
  const tconf = useTranslations("confirm");

  const STATUS_OPTIONS = [
    { value: "all", label: t("statusAll") },
    { value: "draft", label: t("statusDraft") },
    { value: "pending_approval", label: t("statusPendingApproval") },
    { value: "issued", label: t("statusIssued") },
    { value: "paid", label: t("statusPaid") },
    { value: "partially_paid", label: t("statusPartiallyPaid") },
    { value: "overdue", label: t("statusOverdue") },
    { value: "void", label: t("statusVoid") },
  ];
  const [activeView, setActiveView] = useState<"table" | "analytics">("table");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Filters live in the query string so a filtered view of this list is an
  // address the dashboard, a badge or the palette can link to.
  // Free text goes through the same URL-backed filter as the rest, debounced
  // so a `router.replace` does not fire on every keystroke. It was previously
  // hard-wired to "" with a no-op setter, which made the input impossible to
  // type into: a controlled field whose value never changed.
  const [search, setSearch] = useUrlFilter("search", "", { debounceMs: 400 });
  const [statusFilter, setStatusFilter] = useUrlFilter("status", "");
  const [dateFrom, setDateFrom] = useUrlFilter("dateFrom", "");
  const [dateTo, setDateTo] = useUrlFilter("dateTo", "");
  const { displayCurrency } = useCurrencyPreference();
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [showBuilder, setShowBuilder] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [analyticsPeriod, setAnalyticsPeriod] = useState("30d");
  const { data: analyticsData, loading: analyticsLoading, refresh: refreshAnalytics } = useInvoiceAnalytics(analyticsPeriod);

  interface CurrencyTotals { currency: string; totalAmount: number; totalPaid: number; totalBalance: number; count: number }
  const [summary, setSummary] = useState<{
    draft: number; pending_approval: number; issued: number; paid: number; partially_paid: number;
    totalAmount: number; totalPaid: number; totalBalance: number; byCurrency?: CurrencyTotals[];
  }>({
    draft: 0, pending_approval: 0, issued: 0, paid: 0, partially_paid: 0,
    totalAmount: 0, totalPaid: 0, totalBalance: 0,
  });
  // Invoices are stored in the currency they were raised in and nothing
  // converts between currencies, so the strip labels each total with the
  // currency it is actually in — one figure per currency, largest first.
  // Before this it printed the raw cross-currency sum under the viewer's
  // display currency (INR over a table of AED rows).
  const currencyTotals: CurrencyTotals[] = summary.byCurrency?.length
    ? summary.byCurrency
    : [{ currency: displayCurrency, totalAmount: summary.totalAmount, totalPaid: summary.totalPaid, totalBalance: summary.totalBalance, count: 0 }];
  const moneyStrip = (pick: (row: CurrencyTotals) => number) =>
    currencyTotals.map((row) => `${row.currency} ${formatCount(pick(row), { maximumFractionDigits: 0 })}`).join(" · ");

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const res = await fetch(`/api/invoices?${params}`);
      if (!res.ok) throw new Error(t("errorFailedToLoad"));
      const data = await res.json();
      setInvoices(data.invoices ?? []);
      updateTotal(data.total ?? 0);
      if (data.summary) setSummary(data.summary);
    } catch (err) {
      const msg = t("errorFailedToLoad");
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, dateFrom, dateTo, page, limit, updateTotal]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);
  useEffect(() => { document.title = `${t("pageTitle")} · MPLOYEDIN`; }, [t]);

  const hasActiveFilters = Boolean(statusFilter || dateFrom || dateTo);

  const exportColumns: ExportColumn<Invoice>[] = [
    { header: t("exportHeaderInvoiceNumber"), key: "invoiceNumber" },
    { header: t("exportHeaderEmployer"), key: "employerId" as keyof Invoice, formatter: (_v, r) => (r as unknown as Invoice).employerId?.companyName ?? "—" },
    { header: t("exportHeaderJob"), key: "jobId" as keyof Invoice, formatter: (_v, r) => (r as unknown as Invoice).jobId?.title ?? "—" },
    { header: t("exportHeaderCategory"), key: "category" },
    { header: t("exportHeaderTotal"), key: "totalAmount", formatter: v => String(v ?? 0) },
    { header: t("exportHeaderPaid"), key: "paidAmount", formatter: v => String(v ?? 0) },
    { header: t("exportHeaderBalance"), key: "balanceDue", formatter: v => String(v ?? 0) },
    { header: t("exportHeaderMyCommission"), key: "commissions" as keyof Invoice, formatter: (_v, r) => {
      const inv = r as unknown as Invoice;
      const ac = inv.commissions?.find(c => c.role === "agent");
      return ac ? `${ac.rate}% = ${ac.amount}` : "—";
    }},
    { header: tc("status"), key: "status" },
    { header: t("exportHeaderDue"), key: "dueDate" as keyof Invoice, formatter: v => v ? formatDate(new Date(String(v))) : "—" },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: invoices as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "my-invoices",
    title: t("exportTitle"),
  });

  return (
    <div className="page-container">
      {/* One header for the page: title, scope line and the four money totals
          that used to sit in a separate card grid below the toolbar. */}
      <WorkspaceHeader
        title={t("title")}
        context={t("description")}
        actions={
          <Button onClick={() => setShowBuilder(true)} aria-label={t("createInvoiceButton")} className="gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 sm:px-4">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{t("createInvoiceButton")}</span>
          </Button>
        }
        metrics={[
          { label: t("metricRevenue"), shortLabel: t("metricRevenueShort"), value: moneyStrip((row) => row.totalAmount), icon: CircleDollarSign, tone: "primary" },
          { label: t("metricPaid"), value: moneyStrip((row) => row.totalPaid), icon: CheckCircle2, tone: "success" },
          { label: t("metricPending"), value: moneyStrip((row) => row.totalBalance), icon: Clock, tone: "warning" },
          { label: t("metricTotalInvoices"), shortLabel: t("tabButtonInvoices"), value: formatCount(total), icon: FileText, tone: "info" },
        ]}
      />

      <TableToolbar
        search={search} onSearchChange={(v) => { setSearch(v); resetPage(); }} searchPlaceholder={t("searchPlaceholder")}
        right={
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-border/70 bg-card">
              <button onClick={() => setActiveView("table")} className={`rounded-l-lg px-3 py-2.5 min-h-10 text-xs font-medium transition-colors ${activeView === "table" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                <FileText className="mr-1 inline-block h-3.5 w-3.5" /> {t("tabButtonInvoices")}
              </button>
              <button onClick={() => setActiveView("analytics")} className={`rounded-r-lg px-3 py-2.5 min-h-10 text-xs font-medium transition-colors ${activeView === "analytics" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                <BarChart3 className="mr-1 inline-block h-3.5 w-3.5" /> {t("tabButtonAnalytics")}
              </button>
            </div>
          </div>
        }
        onExportCsv={handleExportCsv} onExportExcel={handleExportExcel} onExportPdf={handleExportPdf}
        filterContent={
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <SearchableSelect id="ag-inv-status" className="h-11 w-full rounded-xl border-border bg-card" options={STATUS_OPTIONS} value={statusFilter || "all"} onValueChange={v => { setStatusFilter(v === "all" ? "" : v); resetPage(); }} placeholder={t("statusAll")} />
              <div className="flex items-center gap-2 xl:col-span-2">
                <DateTimePicker mode="date" className="h-11 rounded-xl border-border bg-card text-sm" value={dateFrom} onChange={v => { setDateFrom(v); resetPage(); }} />
                <span className="text-xs text-muted-foreground">{t("filterDateTo")}</span>
                <DateTimePicker mode="date" className="h-11 rounded-xl border-border bg-card text-sm" value={dateTo} onChange={v => { setDateTo(v); resetPage(); }} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={() => { setStatusFilter(""); setDateFrom(""); setDateTo(""); resetPage(); }} disabled={!hasActiveFilters} className="h-11 rounded-xl">
                <RotateCcw className="mr-2 h-4 w-4" /> {tc("filter")}
              </Button>
            </div>
          </div>
        }
        hasActiveFilters={hasActiveFilters}
      />

      {/* Analytics View */}
      {activeView === "analytics" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {(["7d", "30d", "90d", "1y"] as const).map(p => (
                <button key={p} onClick={() => setAnalyticsPeriod(p)} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${analyticsPeriod === p ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{p === "1y" ? t("periodOneYear") : p}</button>
              ))}
            </div>
            <Button variant="outline" size="dense" onClick={refreshAnalytics} className="gap-1.5 rounded-lg text-xs"><RefreshCw className="h-3.5 w-3.5" /> {t("refreshButton")}</Button>
          </div>
          {analyticsData && <RevenueAnalyticsPanel data={analyticsData} currency={analyticsData.currency} />}
          {analyticsLoading && <div className="py-12 text-center text-sm text-muted-foreground">{tc("loading")}</div>}
        </div>
      )}

      {/* Table View */}
      {activeView === "table" && (
        <>
          {errorMessage && <div className="rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-700">{errorMessage}</div>}

          <section className="workspace-panel-surface overflow-hidden rounded-2xl sm:rounded-3xl">
            <InvoiceTable
              invoices={invoices}
              loading={loading}
              role="agent"
              onSelect={setSelectedInvoiceId}
            />
            <div className="border-t border-border/80 px-4 py-3 sm:px-5">
              <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
            </div>
          </section>
        </>
      )}

      {/* Invoice Builder */}
      <InvoiceBuilder
        open={showBuilder}
        onClose={() => setShowBuilder(false)}
        onSuccess={() => { fetchInvoices(); refreshAnalytics(); }}
        defaultCurrency={displayCurrency}
        role="agent"
      />

      {/* Invoice Detail View */}
      <InvoiceDetailView
        invoiceId={selectedInvoiceId}
        open={!!selectedInvoiceId}
        onClose={() => setSelectedInvoiceId(null)}
        onRefresh={fetchInvoices}
        role="agent"
      />
    </div>
  );
}
