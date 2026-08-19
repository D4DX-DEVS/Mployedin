"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { useInvoiceAnalytics } from "@/hooks/useInvoiceAnalytics";
import { useCurrencyPreference } from "@/hooks/useCurrencyPreference";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  RotateCcw, ArrowRight,
  BarChart3, FileText, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { InvoiceTable } from "@/components/shared/InvoiceTable";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import type { ExportColumn } from "@/lib/export";

import { InvoiceDetailView } from "@/components/features/invoices/InvoiceDetailView";
import { RevenueKPICards } from "@/components/features/invoices/RevenueKPICards";
import { RevenueAnalyticsPanel } from "@/components/features/invoices/RevenueAnalyticsPanel";
import {
  SuperAgentPageIntro,
} from "@/components/features/super-agent/WorkspacePage";

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
  agentId?: { name?: string; email?: string; _id?: string };
  commissions?: Array<{ role: string; rate: number; amount: number; status: string }>;
  platformRevenue?: number;
  createdAt: string;
}

// Status and category options are built dynamically with translations in the component

export default function SuperAgentInvoicesPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("superAgentInvoices");
  const tc = useTranslations("common");
  const [activeView, setActiveView] = useState<"table" | "analytics">("table");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const { displayCurrency } = useCurrencyPreference();
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [analyticsPeriod, setAnalyticsPeriod] = useState("30d");
  const { data: analyticsData, loading: analyticsLoading, refresh: refreshAnalytics } = useInvoiceAnalytics(analyticsPeriod);

  const [summary, setSummary] = useState({
    draft: 0, pending_approval: 0, issued: 0, paid: 0, partially_paid: 0, overdue: 0,
    totalAmount: 0, totalPaid: 0, totalBalance: 0,
  });

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (statusFilter) params.set("status", statusFilter);
      if (categoryFilter) params.set("category", categoryFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const res = await fetch(`/api/invoices?${params}`);
      if (!res.ok) throw new Error(t("failedToLoad"));
      const data = await res.json();
      setInvoices(data.invoices ?? []);
      updateTotal(data.total ?? 0);
      if (data.summary) setSummary(data.summary);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("failedToLoad");
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, categoryFilter, dateFrom, dateTo, page, limit, updateTotal, t]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);
  useEffect(() => { document.title = t("pageTitle"); }, [t]);

  const hasActiveFilters = Boolean(statusFilter || categoryFilter || dateFrom || dateTo);
  const fmt = (v: number) => `${displayCurrency} ${v.toLocaleString()}`;

  const exportColumns: ExportColumn<Invoice>[] = [
    { header: t("invoiceNumber"), key: "invoiceNumber" },
    { header: t("employer"), key: "employerId" as keyof Invoice, formatter: (_v, r) => (r as unknown as Invoice).employerId?.companyName ?? "—" },
    { header: t("job"), key: "jobId" as keyof Invoice, formatter: (_v, r) => (r as unknown as Invoice).jobId?.title ?? "—" },
    { header: t("agent"), key: "agentId" as keyof Invoice, formatter: (_v, r) => (r as unknown as Invoice).agentId?.name ?? (r as unknown as Invoice).agentId?.email ?? "—" },
    { header: t("category"), key: "category" },
    { header: t("total"), key: "totalAmount", formatter: v => String(v ?? 0) },
    { header: t("paid"), key: "paidAmount", formatter: v => String(v ?? 0) },
    { header: t("balance"), key: "balanceDue", formatter: v => String(v ?? 0) },
    { header: t("commission"), key: "commissions" as keyof Invoice, formatter: (_v, r) => {
      const inv = r as unknown as Invoice;
      const sc = inv.commissions?.find(c => c.role === "super_agent");
      return sc ? `${sc.rate}% = ${sc.amount}` : "—";
    }},
    { header: tc("status"), key: "status" },
    { header: t("dueDate"), key: "dueDate" as keyof Invoice, formatter: v => v ? new Date(String(v)).toLocaleDateString() : "—" },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: invoices as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: t("exportFilename"),
    title: t("exportTitle"),
  });

  // Build status and category options with translations
  const statusOptions = [
    { value: "all", label: tc("all") },
    { value: "draft", label: t("statusDraft") },
    { value: "pending_approval", label: t("statusPendingApproval") },
    { value: "issued", label: t("statusIssued") },
    { value: "sent", label: t("statusSent") },
    { value: "paid", label: t("statusPaid") },
    { value: "partially_paid", label: t("statusPartiallyPaid") },
    { value: "overdue", label: t("statusOverdue") },
    { value: "void", label: t("statusVoid") },
  ];

  const categoryOptions = [
    { value: "all", label: tc("all") },
    { value: "recruitment", label: t("categoryRecruitment") },
    { value: "subscription", label: t("categorySubscription") },
    { value: "premium_posting", label: t("categoryPremiumPosting") },
    { value: "exhibition", label: t("categoryExhibition") },
    { value: "bulk_hiring", label: t("categoryBulkHiring") },
    { value: "consulting", label: t("categoryConsulting") },
  ];

  return (
    <div className="page-container">
      {/* ── Hero Section ── */}
      <SuperAgentPageIntro
        title={t("heroTitle")}
        description={t("heroDescription")}
        eyebrow={tc("superAgentWorkspace")}
        summaryTitle={t("summaryTitle")}
        summaryDescription={t("summaryDescription", { total: total.toLocaleString(), paid: fmt(summary.totalPaid) })}
      >
        <div className="flex items-center gap-2">
          <Button onClick={() => router.push(`/${locale}/super-agent/invoices/new`)} className="h-10 gap-1.5 rounded-xl text-xs font-semibold">
            <FileText className="h-3.5 w-3.5" /> {t("createInvoice")}
          </Button>
          <div className="inline-flex rounded-lg border border-border/70 bg-card">
            <button onClick={() => setActiveView("table")} className={`rounded-l-lg px-3 py-1.5 text-xs font-medium transition-colors ${activeView === "table" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <FileText className="mr-1 inline-block h-3.5 w-3.5" /> {t("viewInvoices")}
            </button>
            <button onClick={() => setActiveView("analytics")} className={`rounded-r-lg px-3 py-1.5 text-xs font-medium transition-colors ${activeView === "analytics" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <BarChart3 className="mr-1 inline-block h-3.5 w-3.5" /> {t("viewAnalytics")}
            </button>
          </div>
        </div>
      </SuperAgentPageIntro>

      {/* ── Filters ── */}
      <TableToolbar
        search="" onSearchChange={() => {}} searchPlaceholder={t("searchPlaceholder")}
        filterContent={
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SearchableSelect id="sa-inv-status" className="h-11 w-full rounded-xl border-border bg-card" options={statusOptions} value={statusFilter || "all"} onValueChange={v => { setStatusFilter(v === "all" ? "" : v); resetPage(); }} placeholder={t("allStatuses")} />
              <SearchableSelect id="sa-inv-cat" className="h-11 w-full rounded-xl border-border bg-card" options={categoryOptions} value={categoryFilter || "all"} onValueChange={v => { setCategoryFilter(v === "all" ? "" : v); resetPage(); }} placeholder={t("allCategories")} />
              <div className="flex items-center gap-2 xl:col-span-2">
                <DateTimePicker mode="date" value={dateFrom} onChange={v => { setDateFrom(v); resetPage(); }} />
                <span className="text-xs text-muted-foreground">{t("dateSeparator")}</span>
                <DateTimePicker mode="date" value={dateTo} onChange={v => { setDateTo(v); resetPage(); }} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={() => { setStatusFilter(""); setCategoryFilter(""); setDateFrom(""); setDateTo(""); resetPage(); }} disabled={!hasActiveFilters} className="h-11 rounded-xl">
                <RotateCcw className="mr-2 h-4 w-4" /> {tc("cancel")}
              </Button>
            </div>
          </div>
        }
        hasActiveFilters={hasActiveFilters}
      />

      {/* KPI Cards */}
      {analyticsData && <RevenueKPICards kpi={analyticsData.kpi} currency={displayCurrency} variant="super_agent" />}

      {/* Analytics View */}
      {activeView === "analytics" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {(["7d", "30d", "90d", "1y"] as const).map(p => (
                <button key={p} onClick={() => setAnalyticsPeriod(p)} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${analyticsPeriod === p ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{p === "1y" ? t("periodOneYear") : p}</button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={refreshAnalytics} className="h-8 gap-1.5 rounded-lg text-xs"><RefreshCw className="h-3.5 w-3.5" /> {t("refresh")}</Button>
          </div>
          {analyticsData && <RevenueAnalyticsPanel data={analyticsData} currency={displayCurrency} />}
          {analyticsLoading && <div className="py-12 text-center text-sm text-muted-foreground">{tc("loading")}</div>}
        </div>
      )}

      {/* Table View */}
      {activeView === "table" && (
        <>
          {errorMessage && <div className="rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">{errorMessage}</div>}

          <section className="workspace-panel-surface overflow-hidden rounded-2xl sm:rounded-[24px]">
            <div className="flex flex-col gap-2 border-b border-border/80 px-4 py-4 sm:px-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("ledgerLabel")}</p>
              <h3 className="text-lg font-semibold text-foreground">{t("tableTitle")}</h3>
            </div>
            <InvoiceTable
              invoices={invoices}
              loading={loading}
              role="super_agent"
              onSelect={setSelectedInvoiceId}
            />
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
        onRefresh={fetchInvoices}
        role="super_agent"
      />

    </div>
  );
}
