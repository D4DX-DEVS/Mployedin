"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePermissions } from "@/hooks/usePermissions";
import { usePagination } from "@/hooks/usePagination";
import { useInvoiceAnalytics } from "@/hooks/useInvoiceAnalytics";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  Plus, Sparkles, RotateCcw, CalendarDays, ArrowRight, Inbox,
  Eye, BarChart3, FileText, ReceiptText, RefreshCw, ClipboardList, Download,
} from "lucide-react";
import { useConfirm } from "@/hooks/useConfirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { csrfFetch } from "@/lib/security/csrf-client";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import type { ExportColumn } from "@/lib/export";

import { InvoiceDetailView } from "@/components/features/invoices/InvoiceDetailView";
import { RevenueKPICards } from "@/components/features/invoices/RevenueKPICards";
import { RevenueAnalyticsPanel } from "@/components/features/invoices/RevenueAnalyticsPanel";
import { UninvoicedPlacementsQueue } from "@/components/features/invoices/UninvoicedPlacementsQueue";

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
  const [activeView, setActiveView] = useState<"queue" | "table" | "analytics">("queue");

  const STATUS_OPTIONS = [
    { value: "all", label: t("statusAllStatuses") },
    { value: "draft", label: t("statusDraft") },
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
  const [statusFilter, setStatusFilter] = useState("");
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

  // Invoice Builder & Detail View
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

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
      if (categoryFilter) params.set("category", categoryFilter);
      if (typeFilter) params.set("type", typeFilter);
      if (searchTerm.trim()) params.set("search", searchTerm.trim());
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const res = await fetch(`/api/invoices?${params}`);
      if (!res.ok) throw new Error(t("failedToLoadInvoices"));
      const data = await res.json();
      setInvoices(data.invoices ?? []);
      updateTotal(data.total ?? 0);
      if (data.summary) setSummary(data.summary);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("failedToLoadInvoices");
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, categoryFilter, typeFilter, searchTerm, dateFrom, dateTo, page, limit, updateTotal]);

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
      toast.error(err instanceof Error ? err.message : t("failed"));
    }
  };

  const hasActiveFilters = Boolean(statusFilter || categoryFilter || typeFilter || searchTerm || dateFrom || dateTo);
  const fmt = (v: number) => `${displayCurrency} ${v.toLocaleString()}`;

  // Export columns
  const exportColumns: ExportColumn<Invoice>[] = [
    { header: "Invoice #", key: "invoiceNumber" },
    { header: "Employer", key: "employerId" as keyof Invoice, formatter: (_v, r) => (r as unknown as Invoice).employerId?.companyName ?? "—" },
    { header: "Job", key: "jobId" as keyof Invoice, formatter: (_v, r) => (r as unknown as Invoice).jobId?.title ?? "—" },
    { header: "Category", key: "category" },
    { header: "Type", key: "type" },
    { header: "Subtotal", key: "subtotal", formatter: v => String(v ?? 0) },
    { header: "Tax", key: "taxAmount", formatter: v => String(v ?? 0) },
    { header: "Total", key: "totalAmount", formatter: v => String(v ?? 0) },
    { header: "Paid", key: "paidAmount", formatter: v => String(v ?? 0) },
    { header: "Balance", key: "balanceDue", formatter: v => String(v ?? 0) },
    { header: "Agent Commission", key: "commissions" as keyof Invoice, formatter: (_v, r) => {
      const inv = r as unknown as Invoice;
      const ac = inv.commissions?.find(c => c.role === "agent");
      return ac ? `${ac.rate}% = ${ac.amount}` : "—";
    }},
    { header: "SA Commission", key: "platformRevenue" as keyof Invoice, formatter: (_v, r) => {
      const inv = r as unknown as Invoice;
      const sc = inv.commissions?.find(c => c.role === "super_agent");
      return sc ? `${sc.rate}% = ${sc.amount}` : "—";
    }},
    { header: "Company Revenue", key: "platformRevenue" as keyof Invoice, formatter: v => String(v ?? 0) },
    { header: "Currency", key: "currency" },
    { header: "Status", key: "status" },
    { header: "Due Date", key: "dueDate" as keyof Invoice, formatter: v => v ? new Date(String(v)).toLocaleDateString() : "—" },
    { header: "Issued", key: "issuedAt", formatter: v => v ? new Date(String(v)).toLocaleDateString() : "—" },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: invoices as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "invoices-finance",
    title: "Invoice & Finance Report",
  });

  return (
    <div className="page-container">
      {ConfirmDialogNode}

      {/* Header Toolbar */}
      <TableToolbar
        title={t("title")}
        description={t("description")}
        search={searchTerm}
        onSearchChange={(v) => { setSearchTerm(v); resetPage(); }}
        searchPlaceholder={t("searchPlaceholder")}
        left={
          <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            {t("workspaceLabel")}
          </div>
        }
        right={
          <div className="flex items-center gap-2">
            <div className="workspace-muted-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium">
              <ArrowRight className="h-3.5 w-3.5 text-primary" />
              {t("invoiceCount", { count: total.toLocaleString() })}
            </div>
            {/* View Toggle */}
            <div className="inline-flex rounded-lg border border-border/70 bg-card">
              <button onClick={() => setActiveView("queue")} className={`rounded-l-lg px-3 py-1.5 text-xs font-medium transition-colors ${activeView === "queue" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                <ClipboardList className="mr-1 inline-block h-3.5 w-3.5" /> {t("queueTab")}
              </button>
              <button onClick={() => setActiveView("table")} className={`px-3 py-1.5 text-xs font-medium transition-colors ${activeView === "table" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                <FileText className="mr-1 inline-block h-3.5 w-3.5" /> {t("invoicesTab")}
              </button>
              <button onClick={() => setActiveView("analytics")} className={`rounded-r-lg px-3 py-1.5 text-xs font-medium transition-colors ${activeView === "analytics" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                <BarChart3 className="mr-1 inline-block h-3.5 w-3.5" /> {t("analyticsTab")}
              </button>
            </div>
          </div>
        }
        actions={can("subscriptions", "create") ? (
          <Button onClick={() => router.push(`/${locale}/admin/invoices/new`)} size="sm" className="h-9 gap-2 rounded-lg px-4">
            <Plus className="h-4 w-4" /> {t("createInvoice")}
          </Button>
        ) : undefined}
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
        filterContent={
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <SearchableSelect id="adm-inv-status" className="h-11 w-full rounded-xl border-border bg-card" options={STATUS_OPTIONS} value={statusFilter || "all"} onValueChange={v => { setStatusFilter(v === "all" ? "" : v); resetPage(); }} placeholder="All Statuses" />
              <SearchableSelect id="adm-inv-cat" className="h-11 w-full rounded-xl border-border bg-card" options={CATEGORY_OPTIONS} value={categoryFilter || "all"} onValueChange={v => { setCategoryFilter(v === "all" ? "" : v); resetPage(); }} placeholder="All Categories" />
              <SearchableSelect id="adm-inv-type" className="h-11 w-full rounded-xl border-border bg-card" options={TYPE_OPTIONS} value={typeFilter || "all"} onValueChange={v => { setTypeFilter(v === "all" ? "" : v); resetPage(); }} placeholder="All Types" />
              <div className="flex items-center gap-2 xl:col-span-2">
                <DateTimePicker mode="date" value={dateFrom} onChange={v => { setDateFrom(v); resetPage(); }} placeholder={t("dateRangeSeparator")} className="h-11 rounded-xl border-border bg-card text-sm flex-1" />
                <span className="text-xs text-muted-foreground">{t("dateRangeSeparator")}</span>
                <DateTimePicker mode="date" value={dateTo} onChange={v => { setDateTo(v); resetPage(); }} placeholder={t("dateRangeSeparator")} className="h-11 rounded-xl border-border bg-card text-sm flex-1" />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={() => { setStatusFilter(""); setCategoryFilter(""); setTypeFilter(""); setSearchTerm(""); setDateFrom(""); setDateTo(""); resetPage(); }} disabled={!hasActiveFilters} className="h-11 rounded-xl">
                <RotateCcw className="mr-2 h-4 w-4" /> {t("clearFilters")}
              </Button>
            </div>
          </div>
        }
        hasActiveFilters={hasActiveFilters}
      />

      {/* KPI Cards */}
      {analyticsData && (
        <RevenueKPICards kpi={analyticsData.kpi} currency={displayCurrency} variant="admin" />
      )}

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
            <Button variant="outline" size="sm" onClick={refreshAnalytics} className="h-8 gap-1.5 rounded-lg text-xs">
              <RefreshCw className="h-3.5 w-3.5" /> {t("refreshAnalytics")}
            </Button>
          </div>
          {analyticsData && <RevenueAnalyticsPanel data={analyticsData} currency={displayCurrency} />}
          {analyticsLoading && <div className="py-12 text-center text-sm text-muted-foreground">{t("loadingAnalytics")}</div>}
        </div>
      )}

      {/* Table View */}
      {activeView === "table" && (
        <>
          {errorMessage && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">{errorMessage}</div>
          )}

          <section className="workspace-panel-surface overflow-hidden rounded-2xl sm:rounded-[24px]">
            <div className="flex flex-col gap-2 border-b border-border/80 panel-head">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("invoiceLedger")}</p>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-lg font-semibold text-foreground">{t("allInvoices")}</h3>
                <p className="text-sm text-muted-foreground">{t("recordsCount", { shown: invoices.length, total: total.toLocaleString() })}</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/80 bg-secondary/72 hover:bg-secondary/72">
                    <TableHead className="md:min-w-[120px]">{t("tableHeaderInvoiceNumber")}</TableHead>
                    <TableHead className="md:min-w-[140px]">{t("tableHeaderEmployer")}</TableHead>
                    <TableHead className="md:min-w-[130px]">{t("tableHeaderJob")}</TableHead>
                    <TableHead>{t("tableHeaderCategory")}</TableHead>
                    <TableHead className="text-right">{t("tableHeaderTotal")}</TableHead>
                    <TableHead className="text-right">{t("tableHeaderPaid")}</TableHead>
                    <TableHead className="text-right">{t("tableHeaderBalance")}</TableHead>
                    <TableHead className="text-right">{t("tableHeaderTax")}</TableHead>
                    <TableHead>{t("tableHeaderCommission")}</TableHead>
                    <TableHead>{t("tableHeaderStatus")}</TableHead>
                    <TableHead>{t("tableHeaderDueDate")}</TableHead>
                    <TableHead className="text-right">{t("tableHeaderActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i} className="border-border/70 hover:bg-transparent">
                        {Array.from({ length: 12 }).map((_, j) => (
                          <TableCell key={j}><div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : invoices.length === 0 ? (
                    <TableRow className="border-border/70 hover:bg-transparent">
                      <TableCell colSpan={12} className="px-6 py-14 text-center">
                        <div className="flex flex-col items-center gap-3"><div className="workspace-muted-pill rounded-[20px] p-3"><Inbox className="h-6 w-6" /></div><div><p className="text-sm font-semibold">{t("noInvoicesFound")}</p><p className="mt-1 text-sm text-muted-foreground">{t("noInvoicesDescription")}</p></div></div>
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
                        <TableCell><span className="inline-flex rounded-full border border-border/70 bg-secondary/70 px-2 py-0.5 text-[10px] font-medium capitalize">{inv.category?.replace(/_/g, " ")}</span></TableCell>
                        <TableCell className="text-right font-semibold">{inv.currency} {(inv.totalAmount ?? 0).toLocaleString()}</TableCell>
                        <TableCell className="text-right text-sm text-emerald-600 dark:text-emerald-400">{inv.currency} {(inv.paidAmount ?? 0).toLocaleString()}</TableCell>
                        <TableCell className="text-right text-sm text-amber-600 dark:text-amber-400">{inv.currency} {(inv.balanceDue ?? 0).toLocaleString()}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">{inv.taxAmount > 0 ? `${inv.currency} ${inv.taxAmount.toLocaleString()}` : "—"}</TableCell>
                        <TableCell>
                          {totalComm > 0 ? (
                            <div className="text-xs">
                              {agentComm && <p className="text-sky-600">{t("agentCommissionLabel")}: {agentComm.rate}%</p>}
                              {saComm && <p className="text-indigo-600">{t("superAgentCommissionLabel")}: {saComm.rate}%</p>}
                            </div>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell><StatusBadge status={inv.status} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "—"}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" onClick={() => setSelectedInvoiceId(inv._id)} className="h-7 w-7 p-0" title={t("viewDetails")}><Eye className="h-3.5 w-3.5" /></Button>
                            {["issued", "sent", "paid", "partially_paid", "overdue"].includes(inv.status) && (
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title={t("downloadPdf")} onClick={async () => {
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
                              }}><Download className="h-3.5 w-3.5" /></Button>
                            )}
                            {can("subscriptions", "update") && inv.status === "draft" && (
                              <Button variant="ghost" size="sm" onClick={() => updateStatus(inv._id, "issued")} className="h-7 px-2 text-[10px] text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/30">{t("issue")}</Button>
                            )}
                            {can("subscriptions", "update") && ["issued", "sent"].includes(inv.status) && (
                              <Button variant="ghost" size="sm" onClick={() => updateStatus(inv._id, "paid")} className="h-7 px-2 text-[10px] text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30">{t("markAsPaid")}</Button>
                            )}
                            {can("subscriptions", "update") && !["void", "cancelled", "refunded", "paid", "credit_note"].includes(inv.status) && (
                              <Button variant="ghost" size="sm" onClick={async () => {
                                const ok = await confirmDialog(t("confirmVoidMessage"));
                                if (ok) updateStatus(inv._id, "void");
                              }} className="h-7 px-2 text-[10px] text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30">{t("void")}</Button>
                            )}
                          </div>
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
        onClose={() => setSelectedInvoiceId(null)}
        onRefresh={() => { fetchInvoices(); refreshAnalytics(); }}
        role="admin"
      />
    </div>
  );
}
