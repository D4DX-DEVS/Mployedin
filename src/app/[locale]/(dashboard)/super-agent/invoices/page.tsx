"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { useInvoiceAnalytics } from "@/hooks/useInvoiceAnalytics";
import { useCurrencyPreference } from "@/hooks/useCurrencyPreference";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  ArrowRight,
  BarChart3, FileText, RefreshCw,
  DollarSign, CheckCircle2, Clock, Percent,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTableExport } from "@/hooks/useTableExport";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { ErrorState } from "@/components/shared/ErrorState";
import { InvoiceTable } from "@/components/shared/InvoiceTable";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import type { ExportColumn } from "@/lib/export";
import { formatCount } from "@/lib/ui/intlFormat";

import { InvoiceDetailView } from "@/components/features/invoices/InvoiceDetailView";
import { RevenueAnalyticsPanel } from "@/components/features/invoices/RevenueAnalyticsPanel";
import {
  SuperAgentPageIntro,
} from "@/components/features/super-agent/WorkspacePage";
import { formatDate } from "@/lib/ui/intlFormat";

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
  const tKpi = useTranslations("revenueKPICards");
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
  // Nothing converts between currencies, so these figures are scoped to one
  // currency at a time and labelled with THAT currency — not with the viewer's
  // display preference, which used to print "INR 25,322" over a table of AED
  // invoices. `undefined` lets the API pick the team's largest currency.
  const [analyticsCurrency, setAnalyticsCurrency] = useState<string | undefined>(undefined);
  const { data: analyticsData, loading: analyticsLoading, refresh: refreshAnalytics } = useInvoiceAnalytics(analyticsPeriod, analyticsCurrency);
  const metricCurrency = analyticsData?.currency ?? displayCurrency;

  const [search, setSearchState] = useUrlFilter("search", "", { debounceMs: 400 });

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (statusFilter) params.set("status", statusFilter);
      if (categoryFilter) params.set("category", categoryFilter);
      if (search) params.set("search", search);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const res = await fetch(`/api/invoices?${params}`);
      if (!res.ok) throw new Error(t("failedToLoad"));
      const data = await res.json();
      setInvoices(data.invoices ?? []);
      updateTotal(data.total ?? 0);
    } catch (err) {
      const msg = t("failedToLoad");
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, categoryFilter, search, dateFrom, dateTo, page, limit, updateTotal, t]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);
  useEffect(() => { document.title = t("pageTitle"); }, [t]);

  const hasActiveFilters = Boolean(statusFilter || categoryFilter || dateFrom || dateTo);

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
    { header: t("dueDate"), key: "dueDate" as keyof Invoice, formatter: v => v ? formatDate(new Date(String(v)), { day: "2-digit", month: "short", year: "numeric" }) : "—" },
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

  const fmt = (v: number) => `${metricCurrency} ${formatCount(v, { maximumFractionDigits: 0 })}`;


  return (
    <div className="page-container">
      {/* ── Hero Section ── */}
      <SuperAgentPageIntro
        title={t("heroTitle")}
        description={t("heroDescription")}
        metrics={analyticsData ? [
          { label: tKpi("teamRevenue"), value: fmt(analyticsData.kpi.totalRevenue), icon: DollarSign },
          { label: tKpi("teamPaid"), value: fmt(analyticsData.kpi.paidRevenue), icon: CheckCircle2 },
          { label: tKpi("teamPending"), value: fmt(analyticsData.kpi.pendingRevenue), icon: Clock },
          { label: tKpi("commissionDue"), value: fmt(analyticsData.kpi.agentCommissionPayable), icon: Percent },
        ] : undefined}
        compactMetrics
      >
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={() => router.push(`/${locale}/super-agent/invoices/new`)} className="h-10 gap-1.5 rounded-xl text-xs font-semibold max-sm:min-h-11">
            <FileText className="h-3.5 w-3.5" /> {t("createInvoice")}
          </Button>
          {/* h-10 matches the Create Invoice button; flex-1 only on phones so a longer label never wraps on desktop. */}
          <div className="inline-flex h-10 rounded-lg border border-border/70 bg-card max-sm:h-11 max-sm:w-full">
            <button type="button" onClick={() => setActiveView("table")} aria-pressed={activeView === "table"} className={`inline-flex h-full items-center justify-center gap-1 whitespace-nowrap rounded-l-lg px-3 text-xs font-medium transition-colors max-sm:flex-1 ${activeView === "table" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <FileText className="h-3.5 w-3.5" /> {t("viewInvoices")}
            </button>
            <button type="button" onClick={() => setActiveView("analytics")} aria-pressed={activeView === "analytics"} className={`inline-flex h-full items-center justify-center gap-1 whitespace-nowrap rounded-r-lg px-3 text-xs font-medium transition-colors max-sm:flex-1 ${activeView === "analytics" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <BarChart3 className="h-3.5 w-3.5" /> {t("viewAnalytics")}
            </button>
          </div>
        </div>
      </SuperAgentPageIntro>

      {/* ── Filters (export was built but never passed to the old toolbar) ── */}
      <InlineFilterBar
        className="workspace-panel-surface rounded-2xl border-b-0"
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
        onClear={hasActiveFilters || search ? () => { setStatusFilter(""); setCategoryFilter(""); setDateFrom(""); setDateTo(""); setSearchState(""); resetPage(); } : undefined}
        more={(
          <div className="flex min-w-0 flex-[1_1_100%] flex-wrap items-center gap-2">
            <div className="flex min-w-0 flex-[1_1_100%] items-center gap-2">
              <div className="min-w-0 flex-1">
                <DateTimePicker mode="date" value={dateFrom} onChange={v => { setDateFrom(v); resetPage(); }} />
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{t("dateSeparator")}</span>
              <div className="min-w-0 flex-1">
                <DateTimePicker mode="date" value={dateTo} onChange={v => { setDateTo(v); resetPage(); }} />
              </div>
            </div>
          </div>
        )}
        moreActiveCount={[dateFrom, dateTo].filter(Boolean).length}
      >
        <InlineFilterSearch
          value={search}
          onChange={(v) => { setSearchState(v); resetPage(); }}
          placeholder={t("searchPlaceholder")}
        />
        <SearchableSelect
          id="sa-inv-status"
          className={INLINE_FILTER_CONTROL}
          options={statusOptions}
          value={statusFilter || "all"}
          onValueChange={v => { setStatusFilter(v === "all" ? "" : v); resetPage(); }}
          placeholder={t("allStatuses")}
        />
        <SearchableSelect
          id="sa-inv-cat"
          className={INLINE_FILTER_CONTROL}
          options={categoryOptions}
          value={categoryFilter || "all"}
          onValueChange={v => { setCategoryFilter(v === "all" ? "" : v); resetPage(); }}
          placeholder={t("allCategories")}
        />
      </InlineFilterBar>

      {/* Analytics View */}
      {activeView === "analytics" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {(["7d", "30d", "90d", "1y"] as const).map(p => (
                <button key={p} onClick={() => setAnalyticsPeriod(p)} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${analyticsPeriod === p ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{p === "1y" ? t("periodOneYear") : p}</button>
              ))}
              {/* Only worth showing when the team actually bills in more than
                  one currency — the figures cannot be added together. */}
              {(analyticsData?.currencies?.length ?? 0) > 1 && (
                <div className="ml-2 inline-flex items-center gap-1 border-l border-border/70 pl-2">
                  {analyticsData?.currencies.map(code => (
                    <button
                      key={code}
                      onClick={() => setAnalyticsCurrency(code)}
                      aria-pressed={metricCurrency === code}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${metricCurrency === code ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
                    >
                      {code}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button variant="outline" size="iconDense" onClick={refreshAnalytics} aria-label={t("refresh")} title={t("refresh")}><RefreshCw className="h-3.5 w-3.5" /></Button>
          </div>
          {analyticsData && <RevenueAnalyticsPanel data={analyticsData} currency={analyticsData.currency} />}
          {analyticsLoading && <div className="py-12 text-center text-sm text-muted-foreground">{tc("loading")}</div>}
        </div>
      )}

      {/* Table View */}
      {activeView === "table" && (
        <>
          {errorMessage && <ErrorState onRetry={() => fetchInvoices()} />}

          <section className="workspace-panel-surface overflow-hidden rounded-2xl sm:rounded-3xl">
            <InvoiceTable
              invoices={invoices}
              loading={loading}
              role="super_agent"
              onSelect={setSelectedInvoiceId}
            />
          </section>
          <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
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
