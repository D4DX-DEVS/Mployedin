"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { useInvoiceAnalytics } from "@/hooks/useInvoiceAnalytics";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Plus, Sparkles, RotateCcw, CalendarDays, ArrowRight, Inbox,
  Eye, BarChart3, FileText, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import type { ExportColumn } from "@/lib/export";

import { InvoiceBuilder } from "@/components/features/invoices/InvoiceBuilder";
import { InvoiceDetailView } from "@/components/features/invoices/InvoiceDetailView";
import { RevenueKPICards } from "@/components/features/invoices/RevenueKPICards";
import { RevenueAnalyticsPanel } from "@/components/features/invoices/RevenueAnalyticsPanel";

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

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "pending_approval", label: "Pending Approval" },
  { value: "issued", label: "Issued" },
  { value: "paid", label: "Paid" },
  { value: "partially_paid", label: "Partially Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "void", label: "Void" },
];

export default function AgentInvoicesPage() {
  const [activeView, setActiveView] = useState<"table" | "analytics">("table");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [displayCurrency, setDisplayCurrency] = useState("AED");
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [showBuilder, setShowBuilder] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [analyticsPeriod, setAnalyticsPeriod] = useState("30d");
  const { data: analyticsData, loading: analyticsLoading, refresh: refreshAnalytics } = useInvoiceAnalytics(analyticsPeriod);

  const [summary, setSummary] = useState({
    draft: 0, pending_approval: 0, issued: 0, paid: 0, partially_paid: 0,
    totalAmount: 0, totalPaid: 0, totalBalance: 0,
  });

  useEffect(() => {
    fetch("/api/settings/public").then(r => r.json()).then(d => setDisplayCurrency(d.settings?.defaultCurrency ?? "AED")).catch(() => {});
  }, []);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (statusFilter) params.set("status", statusFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const res = await fetch(`/api/invoices?${params}`);
      if (!res.ok) throw new Error("Failed to load invoices");
      const data = await res.json();
      setInvoices(data.invoices ?? []);
      updateTotal(data.total ?? 0);
      if (data.summary) setSummary(data.summary);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load invoices";
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, dateFrom, dateTo, page, limit, updateTotal]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);
  useEffect(() => { document.title = "My Invoices · MPLOYEDIN"; }, []);

  const hasActiveFilters = Boolean(statusFilter || dateFrom || dateTo);

  const exportColumns: ExportColumn<Invoice>[] = [
    { header: "Invoice #", key: "invoiceNumber" },
    { header: "Employer", key: "employerId" as keyof Invoice, formatter: (_v, r) => (r as unknown as Invoice).employerId?.companyName ?? "—" },
    { header: "Job", key: "jobId" as keyof Invoice, formatter: (_v, r) => (r as unknown as Invoice).jobId?.title ?? "—" },
    { header: "Category", key: "category" },
    { header: "Total", key: "totalAmount", formatter: v => String(v ?? 0) },
    { header: "Paid", key: "paidAmount", formatter: v => String(v ?? 0) },
    { header: "Balance", key: "balanceDue", formatter: v => String(v ?? 0) },
    { header: "My Commission", key: "commissions" as keyof Invoice, formatter: (_v, r) => {
      const inv = r as unknown as Invoice;
      const ac = inv.commissions?.find(c => c.role === "agent");
      return ac ? `${ac.rate}% = ${ac.amount}` : "—";
    }},
    { header: "Status", key: "status" },
    { header: "Due", key: "dueDate" as keyof Invoice, formatter: v => v ? new Date(String(v)).toLocaleDateString() : "—" },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: invoices as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "my-invoices",
    title: "My Invoice Report",
  });

  return (
    <div className="page-container space-y-6">
      <TableToolbar
        title="My Invoices & Commissions"
        description="View and create recruitment invoices for your assigned jobs. Track your commission earnings and payment status."
        search="" onSearchChange={() => {}} searchPlaceholder="Search invoices…"
        left={
          <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Agent workspace
          </div>
        }
        right={
          <div className="flex items-center gap-2">
            <div className="workspace-muted-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium">
              <ArrowRight className="h-3.5 w-3.5 text-primary" /> {total.toLocaleString()} invoices
            </div>
            <div className="inline-flex rounded-lg border border-border/70 bg-card">
              <button onClick={() => setActiveView("table")} className={`rounded-l-lg px-3 py-1.5 text-xs font-medium transition-colors ${activeView === "table" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                <FileText className="mr-1 inline-block h-3.5 w-3.5" /> Invoices
              </button>
              <button onClick={() => setActiveView("analytics")} className={`rounded-r-lg px-3 py-1.5 text-xs font-medium transition-colors ${activeView === "analytics" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                <BarChart3 className="mr-1 inline-block h-3.5 w-3.5" /> Analytics
              </button>
            </div>
          </div>
        }
        actions={
          <Button onClick={() => setShowBuilder(true)} className="h-9 gap-2 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700">
            <Plus className="h-4 w-4" /> Create Invoice
          </Button>
        }
        onExportCsv={handleExportCsv} onExportExcel={handleExportExcel} onExportPdf={handleExportPdf}
        filterContent={
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <SearchableSelect id="ag-inv-status" className="h-11 w-full rounded-xl border-border bg-card" options={STATUS_OPTIONS} value={statusFilter || "all"} onValueChange={v => { setStatusFilter(v === "all" ? "" : v); resetPage(); }} placeholder="All Statuses" />
              <div className="flex items-center gap-2 xl:col-span-2">
                <div className="relative flex-1"><CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input type="date" className="h-11 rounded-xl border-border bg-card pl-9 text-sm" value={dateFrom} onChange={e => { setDateFrom(e.target.value); resetPage(); }} /></div>
                <span className="text-xs text-muted-foreground">to</span>
                <div className="relative flex-1"><Input type="date" className="h-11 rounded-xl border-border bg-card text-sm" value={dateTo} onChange={e => { setDateTo(e.target.value); resetPage(); }} /></div>
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={() => { setStatusFilter(""); setDateFrom(""); setDateTo(""); resetPage(); }} disabled={!hasActiveFilters} className="h-11 rounded-xl">
                <RotateCcw className="mr-2 h-4 w-4" /> Clear
              </Button>
            </div>
          </div>
        }
        hasActiveFilters={hasActiveFilters}
      />

      {/* KPI Cards */}
      {analyticsData && <RevenueKPICards kpi={analyticsData.kpi} currency={displayCurrency} variant="agent" />}

      {/* Analytics View */}
      {activeView === "analytics" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {(["7d", "30d", "90d", "1y"] as const).map(p => (
                <button key={p} onClick={() => setAnalyticsPeriod(p)} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${analyticsPeriod === p ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{p === "1y" ? "1 Year" : p}</button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={refreshAnalytics} className="h-8 gap-1.5 rounded-lg text-xs"><RefreshCw className="h-3.5 w-3.5" /> Refresh</Button>
          </div>
          {analyticsData && <RevenueAnalyticsPanel data={analyticsData} currency={displayCurrency} />}
          {analyticsLoading && <div className="py-12 text-center text-sm text-muted-foreground">Loading analytics...</div>}
        </div>
      )}

      {/* Table View */}
      {activeView === "table" && (
        <>
          {errorMessage && <div className="rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">{errorMessage}</div>}

          <section className="workspace-panel-surface overflow-hidden rounded-[24px]">
            <div className="flex flex-col gap-2 border-b border-border/80 px-4 py-4 sm:px-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">My Invoice Ledger</p>
              <h3 className="text-lg font-semibold text-foreground">Your Invoices</h3>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/80 bg-secondary/72 hover:bg-secondary/72">
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Employer</TableHead>
                    <TableHead>Job</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>My Commission</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="border-border/70 hover:bg-transparent">
                      {Array.from({ length: 11 }).map((_, j) => <TableCell key={j}><div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" /></TableCell>)}
                    </TableRow>
                  )) : invoices.length === 0 ? (
                    <TableRow className="border-border/70 hover:bg-transparent">
                      <TableCell colSpan={11} className="px-6 py-14 text-center">
                        <div className="flex flex-col items-center gap-3"><div className="workspace-muted-pill rounded-[20px] p-3"><Inbox className="h-6 w-6" /></div><div><p className="text-sm font-semibold">No invoices yet</p><p className="mt-1 text-sm text-muted-foreground">Create your first invoice to start tracking commissions.</p></div></div>
                      </TableCell>
                    </TableRow>
                  ) : invoices.map((inv) => {
                    const myComm = inv.commissions?.find(c => c.role === "agent");
                    return (
                      <TableRow key={inv._id} className="border-border/70 cursor-pointer hover:bg-secondary/30" onClick={() => setSelectedInvoiceId(inv._id)}>
                        <TableCell><p className="font-mono text-sm font-medium">{inv.invoiceNumber}</p></TableCell>
                        <TableCell><p className="max-w-[130px] truncate font-medium">{inv.employerId?.companyName ?? "—"}</p></TableCell>
                        <TableCell><p className="max-w-[120px] truncate text-sm text-muted-foreground">{inv.jobId?.title ?? "—"}</p></TableCell>
                        <TableCell><span className="text-[10px] capitalize text-muted-foreground">{inv.category?.replace(/_/g, " ")}</span></TableCell>
                        <TableCell className="text-right font-semibold">{inv.currency} {(inv.totalAmount ?? 0).toLocaleString()}</TableCell>
                        <TableCell className="text-right text-sm text-emerald-600 dark:text-emerald-400">{inv.currency} {(inv.paidAmount ?? 0).toLocaleString()}</TableCell>
                        <TableCell className="text-right text-sm text-amber-600 dark:text-amber-400">{inv.currency} {(inv.balanceDue ?? 0).toLocaleString()}</TableCell>
                        <TableCell>
                          {myComm ? (
                            <div className="text-xs">
                              <p className="font-medium text-sky-600 dark:text-sky-400">{myComm.rate}% = {inv.currency} {myComm.amount.toLocaleString()}</p>
                              <StatusBadge status={myComm.status} />
                            </div>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell><StatusBadge status={inv.status} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "—"}</TableCell>
                        <TableCell>
                          <div className="flex justify-end" onClick={e => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" onClick={() => setSelectedInvoiceId(inv._id)} className="h-7 w-7 p-0"><Eye className="h-3.5 w-3.5" /></Button>
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
