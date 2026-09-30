"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { ErrorState } from "@/components/shared/ErrorState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { TableBodySkeleton } from "@/components/ui/loading";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { TableSortControl, SortableTableHeader } from "@/components/shared/TableSortControl";
import { RowActions, type RowAction } from "@/components/shared/RowActions";
import { usePermissions } from "@/hooks/usePermissions";
import { usePagination } from "@/hooks/usePagination";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { INVOICE_STATUSES } from "@/lib/invoices/status";
import { useInvoiceAnalytics } from "@/hooks/useInvoiceAnalytics";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  Plus, Sparkles, RotateCcw, CalendarDays, ArrowRight, Inbox, Eye, BarChart3, FileText, ReceiptText, RefreshCw, ClipboardList, Download, Clock, CheckCircle2, TrendingUp, X, Trash2,
} from "lucide-react";
import { useConfirm } from "@/hooks/useConfirm";
import { Button } from "@/components/ui/button";
import { csrfFetch } from "@/lib/security/csrf-client";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useTableExport } from "@/hooks/useTableExport";
import type { ExportColumn } from "@/lib/export";

import { InvoiceDetailView } from "@/components/features/invoices/InvoiceDetailView";
import { RevenueKPICards } from "@/components/features/invoices/RevenueKPICards";
import { RevenueAnalyticsPanel } from "@/components/features/invoices/RevenueAnalyticsPanel";
import { UninvoicedPlacementsQueue } from "@/components/features/invoices/UninvoicedPlacementsQueue";
import { formatCount, formatDate } from "@/lib/ui/intlFormat";

// ── Types ────────────────────────────────────────────────────────────────────
interface Invoice {
  _id: string;
  invoiceNumber: string;
  category: string;
  type: string;
  description?: string;
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  taxType: string;
  taxPercent: number;
  taxAmount: number;
  serviceCharge: number;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  refundedAmount: number;
  amount: number;
  currency: string;
  status: string;
  paymentTerms: string;
  dueDate?: string;
  issuedAt: string;
  paidAt?: string;
  jobId?: { title?: string; _id?: string };
  employerId?: { companyName?: string; _id?: string };
  agentId?: { _id?: string };
  commissions?: Array<{ role: string; rate: number; amount: number; status: string }>;
  platformRevenue?: number;
  notes?: string;
  createdAt: string;
}

// ── Component ────────────────────────────────────────────────────────────────
export default function AdminInvoicesPage() {
  const t = useTranslations("adminInvoices");
  const { can } = usePermissions();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();
  const searchParams = useSearchParams();
  // A filtered link (the admin dashboard's "4 overdue invoices") is about the
  // ledger, so it opens there instead of on the uninvoiced-placements queue.
  const [activeView, setActiveView] = useState<"queue" | "table" | "analytics">(() =>
    searchParams.get("status") || searchParams.get("attention") ? "table" : "queue",
  );

  const STATUS_OPTIONS = [
    { value: "all", label: t("statusAllStatuses") },
    { value: "draft", label: t("statusDraft") },
    { value: "pending_approval", label: t("statusPendingApproval") },
    { value: "issued", label: t("statusIssued") },
    { value: "sent", label: t("statusSent") },
    { value: "paid", label: t("statusPaid") },
    { value: "partially_paid", label: t("statusPartiallyPaid") },
    { value: "overdue", label: t("statusOverdue") },
    { value: "void", label: t("statusVoid") },
    { value: "cancelled", label: t("statusCancelled") },
    { value: "refunded", label: t("statusRefunded") },
    { value: "credit_note", label: t("statusCreditNote") },
  ];

  const CATEGORY_OPTIONS = [
    { value: "all", label: t("categoryAllCategories") },
    { value: "recruitment", label: t("categoryRecruitment") },
    { value: "subscription", label: t("categorySubscription") },
    { value: "premium_posting", label: t("categoryPremiumPosting") },
    { value: "featured_promotion", label: t("categoryFeaturedPromotion") },
    { value: "exhibition", label: t("categoryExhibition") },
    { value: "bulk_hiring", label: t("categoryBulkHiring") },
    { value: "consulting", label: t("categoryConsulting") },
    { value: "custom_enterprise", label: t("categoryCustomEnterprise") },
  ];

  const TYPE_OPTIONS = [
    { value: "all", label: t("typeAllTypes") },
    { value: "new", label: t("typeNew") },
    { value: "renewal", label: t("typeRenewal") },
    { value: "recruitment", label: t("typeRecruitment") },
    { value: "premium_posting", label: t("typePremiumPosting") },
    { value: "featured_promotion", label: t("typeFeaturedPromotion") },
    { value: "exhibition", label: t("typeExhibition") },
    { value: "bulk_hiring", label: t("typeBulkHiring") },
    { value: "consulting", label: t("typeConsulting") },
    { value: "custom", label: t("typeCustom") },
  ];

  // Table data
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  // In the URL so dashboard rows can deep-link and back/refresh keep the view.
  const [statusFilter, setStatusFilter] = useUrlFilter("status", "", { allow: INVOICE_STATUSES });
  /** Rows needing a person: an unverified payment notice, or an open dispute. */
  const [attentionFilter, setAttentionFilter] = useUrlFilter("attention", "", { allow: ["payment_notice", "dispute"] });
  const [sortBy, setSortBy] = useUrlFilter("sortBy", "createdAt", { allow: ["createdAt", "dueDate", "totalAmount", "invoiceNumber"] });
  const [sortOrderParam, setSortOrder] = useUrlFilter("sortOrder", "desc", { allow: ["asc", "desc"] });
  const sortOrder: "asc" | "desc" = sortOrderParam === "asc" ? "asc" : "desc";
  const [categoryFilter, setCategoryFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Summary
  const [summary, setSummary] = useState({
    draft: 0, issued: 0, paid: 0, partially_paid: 0, overdue: 0, void: 0,
    totalAmount: 0, totalCount: 0, totalTax: 0, totalPaid: 0, totalBalance: 0,
  });

  const [displayCurrency, setDisplayCurrency] = useState("AED");
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const sortByColumn = (field: string) => {
    if (field === sortBy) setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    else { setSortBy(field); setSortOrder(field === "invoiceNumber" ? "asc" : "desc"); }
    resetPage();
  };

  // Invoice Builder & Detail View
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  // ?invoice=<id> opens that invoice on arrival (the Commissions ledger links here).
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(() => searchParams.get("invoice"));

  // Analytics
  const [analyticsPeriod, setAnalyticsPeriod] = useState("30d");
  const { data: analyticsData, loading: analyticsLoading, refresh: refreshAnalytics } = useInvoiceAnalytics(analyticsPeriod);

  // Fetch platform currency
  useEffect(() => {
    fetch("/api/settings/public").then(r => r.json()).then(d => setDisplayCurrency(d.settings?.defaultCurrency ?? "AED")).catch(() => {});
  }, []);

  // Fetch invoices
  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (statusFilter) params.set("status", statusFilter);
      if (attentionFilter) params.set("attention", attentionFilter);
      if (categoryFilter) params.set("category", categoryFilter);
      if (typeFilter) params.set("type", typeFilter);
      if (searchTerm.trim()) params.set("search", searchTerm.trim());
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      params.set("sortBy", sortBy);
      params.set("sortOrder", sortOrder);

      const res = await fetch(`/api/invoices?${params}`);
      if (!res.ok) throw new Error(t("failedToLoadInvoices"));
      const data = await res.json();
      setInvoices(data.invoices ?? []);
      updateTotal(data.total ?? 0);
      if (data.summary) setSummary(data.summary);
    } catch (err) {
      const msg = t("failedToLoadInvoices");
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, attentionFilter, categoryFilter, typeFilter, searchTerm, dateFrom, dateTo, sortBy, sortOrder, page, limit, updateTotal]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);
  useEffect(() => { document.title = "Finance · MPLOYEDIN"; }, []);

  // Status update
  const updateStatus = async (id: string, newStatus: string) => {
    try {
      const res = await csrfFetch(`/api/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) { const e = await res.json().catch(() => null); throw new Error(e?.error ?? "Failed"); }
      toast.success(t("invoiceStatusUpdated", { status: newStatus }));
      await fetchInvoices();
    } catch (err) {
      toast.error(t("failed"));
    }
  };

  const hasActiveFilters = Boolean(statusFilter || attentionFilter || categoryFilter || typeFilter || searchTerm || dateFrom || dateTo);
  // Analytics is scoped to one currency at a time (nothing converts between
  // them), so label these with the currency the figures are actually in — not
  // the platform default, which had no relationship to the numbers.
  // Compact ("AED 247.2K"), as on the other admin report headers: full figures
  // ran into each other in the four-across strip on phones.
  const fmt = (v: number) =>
    `${analyticsData?.currency ?? displayCurrency} ${formatCount(v, { notation: "compact", maximumFractionDigits: 1 })}`;

  const invoiceMetrics = analyticsData?.kpi ? [
    { label: t("totalInvoicedLabel"), value: fmt(analyticsData.kpi.totalRevenue), icon: ReceiptText, iconSurfaceClassName: "bg-indigo-50", iconClassName: "text-indigo-600" },
    { label: t("totalPaidLabel"), value: fmt(analyticsData.kpi.paidRevenue), icon: CheckCircle2, iconSurfaceClassName: "bg-emerald-50", iconClassName: "text-emerald-600" },
    { label: t("outstandingLabel"), value: fmt(analyticsData.kpi.pendingRevenue), icon: Clock, iconSurfaceClassName: "bg-amber-50", iconClassName: "text-amber-600" },
    { label: t("overallCollectionRateLabel"), value: analyticsData.kpi.totalRevenue > 0 ? `${Math.round((analyticsData.kpi.paidRevenue / analyticsData.kpi.totalRevenue) * 100)}%` : "0%", icon: TrendingUp, iconSurfaceClassName: "bg-violet-50", iconClassName: "text-violet-600" },
  ] : [];

  // Export columns
  const exportColumns: ExportColumn<Invoice>[] = [
    { header: t("exportHeaderInvoiceNumber"), key: "invoiceNumber" },
    { header: t("tableHeaderEmployer"), key: "employerId" as keyof Invoice, formatter: (_v, r) => (r as unknown as Invoice).employerId?.companyName ?? "—" },
    { header: t("tableHeaderJob"), key: "jobId" as keyof Invoice, formatter: (_v, r) => (r as unknown as Invoice).jobId?.title ?? "—" },
    { header: t("exportHeaderCategory"), key: "category" },
    { header: t("exportHeaderType"), key: "type" },
    { header: t("exportHeaderSubtotal"), key: "subtotal", formatter: v => String(v ?? 0) },
    { header: t("exportHeaderTax"), key: "taxAmount", formatter: v => String(v ?? 0) },
    { header: t("exportHeaderTotal"), key: "totalAmount", formatter: v => String(v ?? 0) },
    { header: t("exportHeaderPaid"), key: "paidAmount", formatter: v => String(v ?? 0) },
    { header: t("exportHeaderBalance"), key: "balanceDue", formatter: v => String(v ?? 0) },
    { header: t("exportHeaderAgentCommission"), key: "commissions" as keyof Invoice, formatter: (_v, r) => {
      const inv = r as unknown as Invoice;
      const ac = inv.commissions?.find(c => c.role === "agent");
      return ac ? `${ac.rate}% = ${ac.amount}` : "—";
    }},
    { header: t("exportHeaderSuperAgentCommission"), key: "platformRevenue" as keyof Invoice, formatter: (_v, r) => {
      const inv = r as unknown as Invoice;
      const sc = inv.commissions?.find(c => c.role === "super_agent");
      return sc ? `${sc.rate}% = ${sc.amount}` : "—";
    }},
    { header: t("exportHeaderCompanyRevenue"), key: "platformRevenue" as keyof Invoice, formatter: v => String(v ?? 0) },
    { header: t("exportHeaderCurrency"), key: "currency" },
    { header: t("exportHeaderStatus"), key: "status" },
    { header: t("exportHeaderDueDate"), key: "dueDate" as keyof Invoice, formatter: v => v ? formatDate(new Date(String(v))) : "—" },
    { header: t("exportHeaderIssued"), key: "issuedAt", formatter: v => v ? formatDate(new Date(String(v))) : "—" },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: invoices as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "invoices-finance",
    title: t("exportTitle"),
  });

  return (
    <div className="page-container">
      {ConfirmDialogNode}

      {/* Page Header */}
      <DashboardPageHeader
        compact
        title={t("title")}
        description={t("description")}
        compactOnMobile
        actions={
          /* The builder page existed and worked, but nothing linked to it — the
             only role that could not raise an invoice from the UI was the one
             with the widest financial authority. Agent and super-agent both
             have this control on their own invoice lists. */
          <Link href={`/${locale}/admin/invoices/new`}>
            <Button size="sm" className="gap-1.5 max-sm:min-h-11">
              <Plus className="h-4 w-4" /> {t("createInvoice")}
            </Button>
          </Link>
        }
        metrics={invoiceMetrics}
      />

      {/* Ledger / analytics / uninvoiced queue. The switcher was deleted once and
          left the ledger — and approving pending invoices — unreachable. */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          <button
            type="button"
            aria-pressed={activeView === "table"}
            onClick={() => setActiveView("table")}
            className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              activeView === "table"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("viewLedger")}
          </button>
          <button
            type="button"
            aria-pressed={activeView === "analytics"}
            onClick={() => setActiveView("analytics")}
            className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              activeView === "analytics"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("viewAnalytics")}
          </button>
          <button
            type="button"
            aria-pressed={activeView === "queue"}
            onClick={() => setActiveView("queue")}
            className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              activeView === "queue"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("viewQueue")}
          </button>
        </div>
      </div>

      {/* Queue View — Uninvoiced Placements */}
      {activeView === "queue" && (
        <UninvoicedPlacementsQueue
          onInvoicesCreated={() => { fetchInvoices(); refreshAnalytics(); }}
          defaultCurrency={displayCurrency}
        />
      )}

      {/* Analytics View */}
      {activeView === "analytics" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {(["7d", "30d", "90d", "1y"] as const).map(p => (
                <button key={p} onClick={() => setAnalyticsPeriod(p)} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${analyticsPeriod === p ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{p === "1y" ? t("oneYear") : p}</button>
              ))}
            </div>
            <Button variant="outline" size="iconDense" onClick={refreshAnalytics} aria-label={t("refreshAnalytics")} title={t("refreshAnalytics")}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
          {analyticsData && <RevenueAnalyticsPanel data={analyticsData} currency={analyticsData.currency} />}
          {analyticsLoading && <div className="py-12 text-center text-sm text-muted-foreground">{t("loadingAnalytics")}</div>}
        </div>
      )}

      {/* Table View */}
      {activeView === "table" && (
        <>
          {errorMessage && (
            <ErrorState title={t("failedToLoadInvoices")} onRetry={fetchInvoices} />
          )}

          <InlineFilterBar
            className="workspace-panel-surface rounded-2xl border-b-0"
            onExportCsv={invoices.length > 0 ? handleExportCsv : undefined}
          >
            <InlineFilterSearch
              value={searchTerm}
              onChange={(value) => { setSearchTerm(value); resetPage(); }}
              placeholder={t("searchPlaceholder")}
            />
            <SearchableSelect
              id="adm-inv-status"
              className={INLINE_FILTER_CONTROL}
              options={STATUS_OPTIONS}
              value={statusFilter || "all"}
              onValueChange={v => { setStatusFilter(v === "all" ? "" : v); resetPage(); }}
              placeholder={t("statusAllStatuses")}
            />
            <SearchableSelect
              id="adm-inv-cat"
              className={INLINE_FILTER_CONTROL}
              options={CATEGORY_OPTIONS}
              value={categoryFilter || "all"}
              onValueChange={v => { setCategoryFilter(v === "all" ? "" : v); resetPage(); }}
              placeholder={t("categoryAllCategories")}
            />
            <TableSortControl
              value={sortBy}
              onValueChange={(v) => { setSortBy(v); resetPage(); }}
              options={[
                { value: "createdAt", label: t("sortDateAdded") },
                { value: "dueDate", label: t("tableHeaderDueDate") },
                { value: "totalAmount", label: t("tableHeaderTotal") },
                { value: "invoiceNumber", label: t("tableHeaderInvoiceNumber") },
              ]}
              order={sortOrder}
              onOrderChange={(next) => { setSortOrder(next); resetPage(); }}
              compact
            />
          </InlineFilterBar>

          {attentionFilter && (
            <div className="mb-3 flex items-center">
              <button
                type="button"
                onClick={() => { setAttentionFilter(""); resetPage(); }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/10"
                aria-label={t("attentionClearAria")}
              >
                {attentionFilter === "payment_notice" ? t("attentionPaymentNotice") : t("attentionDispute")}
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          )}

          <section className="workspace-panel-surface overflow-hidden rounded-2xl">


            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/80 bg-secondary/72 hover:bg-secondary/72">
                    <TableHead className="md:min-w-[120px]">
                      <SortableTableHeader label={t("tableHeaderInvoiceNumber")} active={sortBy === "invoiceNumber"} order={sortOrder} onClick={() => sortByColumn("invoiceNumber")} />
                    </TableHead>
                    <TableHead className="md:min-w-[140px]">{t("tableHeaderEmployer")}</TableHead>
                    <TableHead className="md:min-w-[130px]">{t("tableHeaderJob")}</TableHead>
                    <TableHead>{t("tableHeaderCategory")}</TableHead>
                    <TableHead className="text-right">
                      <SortableTableHeader label={t("tableHeaderTotal")} active={sortBy === "totalAmount"} order={sortOrder} onClick={() => sortByColumn("totalAmount")} />
                    </TableHead>
                    <TableHead className="text-right">{t("tableHeaderPaid")}</TableHead>
                    <TableHead className="text-right">{t("tableHeaderBalance")}</TableHead>
                    <TableHead className="text-right">{t("tableHeaderTax")}</TableHead>
                    <TableHead>{t("tableHeaderCommission")}</TableHead>
                    <TableHead>{t("tableHeaderStatus")}</TableHead>
                    <TableHead>
                      <SortableTableHeader label={t("tableHeaderDueDate")} active={sortBy === "dueDate"} order={sortOrder} onClick={() => sortByColumn("dueDate")} />
                    </TableHead>
                    <TableHead className="text-right">{t("tableHeaderActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableBodySkeleton rows={5} cols={12} />
                  ) : invoices.length === 0 ? (
                    <TableRow className="border-border/70 hover:bg-transparent">
                      <TableCell colSpan={12} className="px-6 py-14 text-center">
                        <div className="flex flex-col items-center gap-3"><div className="workspace-muted-pill rounded-3xl p-3"><Inbox className="h-6 w-6" /></div><div><p className="text-sm font-semibold">{t("noInvoicesFound")}</p><p className="mt-1 text-sm text-muted-foreground">{t("noInvoicesDescription")}</p></div></div>
                      </TableCell>
                    </TableRow>
                  ) : invoices.map((inv) => {
                    const agentComm = inv.commissions?.find(c => c.role === "agent");
                    const saComm = inv.commissions?.find(c => c.role === "super_agent");
                    const totalComm = (agentComm?.amount ?? 0) + (saComm?.amount ?? 0);

                    return (
                      <TableRow key={inv._id} className="border-border/70 cursor-pointer hover:bg-secondary/30" onClick={() => setSelectedInvoiceId(inv._id)}>
                        <TableCell><p className="font-mono text-sm font-medium text-foreground">{inv.invoiceNumber}</p></TableCell>
                        <TableCell><p className="max-w-[140px] truncate font-medium text-foreground">{inv.employerId?.companyName ?? "—"}</p></TableCell>
                        <TableCell><p className="max-w-[130px] truncate text-sm text-muted-foreground">{inv.jobId?.title ?? "—"}</p></TableCell>
                        <TableCell><span className="inline-flex rounded-full border border-border/70 bg-secondary/70 px-2 py-0.5 text-[11px] font-medium capitalize">{inv.category?.replace(/_/g, " ")}</span></TableCell>
                        <TableCell className="text-right font-semibold">{inv.currency} {formatCount((inv.totalAmount ?? 0))}</TableCell>
                        <TableCell className="text-right text-sm text-emerald-600">{inv.currency} {formatCount((inv.paidAmount ?? 0))}</TableCell>
                        <TableCell className="text-right text-sm text-amber-600">{inv.currency} {formatCount((inv.balanceDue ?? 0))}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">{inv.taxAmount > 0 ? `${inv.currency} ${formatCount(inv.taxAmount)}` : "—"}</TableCell>
                        <TableCell>
                          {totalComm > 0 ? (
                            <div className="text-xs">
                              {agentComm && <p className="text-sky-600">{t("agentCommissionLabel")}: {agentComm.rate}%</p>}
                              {saComm && <p className="text-indigo-600">{t("superAgentCommissionLabel")}: {saComm.rate}%</p>}
                            </div>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell><StatusBadge status={inv.status} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{inv.dueDate ? formatDate(new Date(inv.dueDate), { day: "2-digit", month: "short", year: "numeric" }) : "—"}</TableCell>
                        <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                          <RowActions
                            name={inv.invoiceNumber}
                            quick={[{ key: "view", label: t("viewDetails"), icon: Eye, onSelect: () => setSelectedInvoiceId(inv._id) }]}
                            menu={
                              (() => {
                                const items: RowAction[] = [];
                                if (["issued", "sent", "paid", "partially_paid", "overdue"].includes(inv.status)) {
                                  items.push({
                                    key: "download",
                                    label: t("downloadPdf"),
                                    icon: Download,
                                    onSelect: async () => {
                                      try {
                                        const res = await fetch(`/api/invoices/${inv._id}/pdf`);
                                        if (!res.ok) throw new Error(t("failedToDownloadInvoice"));
                                        const blob = await res.blob();
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement("a");
                                        a.href = url;
                                        a.download = `${inv.invoiceNumber}.pdf`;
                                        a.click();
                                        URL.revokeObjectURL(url);
                                      } catch { toast.error(t("failedToDownloadPdf")); }
                                    }
                                  });
                                }
                                if (can("invoices", "update")) {
                                  if (inv.status === "draft") {
                                    items.push({ key: "issue", label: t("issue"), icon: CheckCircle2, onSelect: () => updateStatus(inv._id, "issued") });
                                  }
                                  if (["issued", "sent"].includes(inv.status)) {
                                    items.push({ key: "paid", label: t("markAsPaid"), icon: CheckCircle2, onSelect: () => updateStatus(inv._id, "paid") });
                                  }
                                  if (!["void", "cancelled", "refunded", "paid", "credit_note"].includes(inv.status)) {
                                    items.push({ key: "void", label: t("void"), icon: Trash2, onSelect: async () => {
                                      const ok = await confirmDialog(t("confirmVoidMessage"));
                                      if (ok) updateStatus(inv._id, "void");
                                    }, destructive: true });
                                  }
                                }
                                return items;
                              })()
                            }
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="border-t border-border/80 px-4 py-3 sm:px-5">
              <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
            </div>
          </section>
        </>
      )}



      {/* Invoice Detail View */}
      <InvoiceDetailView
        invoiceId={selectedInvoiceId}
        open={!!selectedInvoiceId}
        onClose={() => {
          setSelectedInvoiceId(null);
          // Drop the deep link so a refresh does not reopen the dialog.
          if (searchParams.get("invoice")) {
            const rest = new URLSearchParams(searchParams.toString());
            rest.delete("invoice");
            router.replace(`/${locale}/admin/invoices${rest.size ? `?${rest}` : ""}`, { scroll: false });
          }
        }}
        onRefresh={() => { fetchInvoices(); refreshAnalytics(); }}
        role="admin"
      />
    </div>
  );
}
