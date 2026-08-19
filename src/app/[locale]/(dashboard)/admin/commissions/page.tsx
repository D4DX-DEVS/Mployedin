"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { toast } from "sonner";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePermissions } from "@/hooks/usePermissions";
import { usePagination } from "@/hooks/usePagination";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Plus, Pencil, Trash2, Clock3, CheckCircle2, WalletCards, ReceiptText, RotateCcw, CalendarDays, Globe } from "lucide-react";
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
import { Inbox } from "lucide-react";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";

interface Commission {
  _id: string;
  agentId?: { fullName?: string; _id?: string };
  superAgentId?: { fullName?: string; _id?: string };
  agentName?: string | null;
  amount: number;
  currency?: string;
  status: string;
  type?: string;
  rate?: number;
  notes?: string;
  disputeReason?: string;
  disputeResolution?: string;
  clawbackAmount?: number;
  clawbackReason?: string;
  createdAt: string;
}

export default function AdminCommissionsPage() {
  const t = useTranslations("adminCommissions");
  const { can } = usePermissions();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();

  const CURRENCY_FORM_OPTIONS = SUPPORTED_CURRENCIES.map(c => ({ value: c.code, label: `${c.code} — ${c.label}` }));

  const ADD_FIELDS: CrudField[] = [
    { name: "type", label: t("fieldTypeLabel"), type: "select", required: true, options: [
      { value: "placement", label: t("typePlacement") }, { value: "override", label: t("typeOverride") }, { value: "bonus", label: t("typeBonus") }
    ]},
    { name: "amount", label: t("fieldAmountLabel"), type: "number", required: true },
    { name: "currency", label: t("fieldCurrencyLabel"), type: "select", options: CURRENCY_FORM_OPTIONS },
    { name: "rate", label: t("fieldRateLabel"), type: "number" },
    { name: "notes", label: t("fieldNotesLabel"), type: "textarea" },
  ];

  const STATUS_OPTIONS = [
    { value: "all", label: t("allStatuses") },
    { value: "pending", label: t("statusPending") },
    { value: "approved", label: t("statusApproved") },
    { value: "paid", label: t("statusPaid") },
    { value: "disputed", label: t("statusDisputed") },
    { value: "clawed_back", label: t("statusClawedBack") },
  ];

  const TYPE_OPTIONS = [
    { value: "all", label: t("allTypes") },
    { value: "placement", label: t("typePlacement") },
    { value: "override", label: t("typeOverride") },
    { value: "bonus", label: t("typeBonus") },
  ];

  const CURRENCY_OPTIONS = [
    { value: "all", label: t("allCurrencies") },
    ...SUPPORTED_CURRENCIES.map(c => ({ value: c.code, label: `${c.code} — ${c.label}` })),
  ];
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState("");
  const [summary, setSummary] = useState<{ pending: number; approved: number; paid: number; currency: string }>({ pending: 0, approved: 0, paid: 0, currency: "AED" });
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<Commission | null>(null);

  // Fetch platform default currency from settings
  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((data) => {
        const dc = data.settings?.defaultCurrency ?? "AED";
        setSummary((s) => ({ ...s, currency: dc }));
      })
      .catch(() => {});
  }, []);

  const fetchCommissions = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (status) params.set("status", status);
      if (typeFilter) params.set("type", typeFilter);
      if (searchTerm.trim()) params.set("search", searchTerm.trim());
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (currencyFilter) params.set("currency", currencyFilter);

      const res = await fetch(`/api/commissions?${params}`);
      if (!res.ok) {
        throw new Error(t("failedLoadCommissions"));
      }

      const data = await res.json();
      setCommissions(data.items ?? data.commissions ?? []);
      updateTotal(data.total ?? data.totalCount ?? data.pagination?.total ?? ((data.totalPages ?? data.pagination?.pages ?? 1) * limit));
      if (data.summary) setSummary(data.summary);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t("failedLoadCommissions");
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [status, typeFilter, searchTerm, dateFrom, dateTo, currencyFilter, page, limit, updateTotal]);

  useEffect(() => { fetchCommissions(); }, [fetchCommissions]);

  useEffect(() => { document.title = "Commissions · MPLOYEDIN"; }, []);

  const handleCreate = async (values: Record<string, string>) => {
    const res = await csrfFetch("/api/commissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, amount: Number(values.amount), rate: values.rate ? Number(values.rate) : undefined }),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? t("failedLoadCommissions")); }
    await fetchCommissions();
  };

  const handleEdit = async (values: Record<string, string>) => {
    if (!editItem) {
      throw new Error("No commission selected for editing");
    }

    const res = await csrfFetch(`/api/commissions/${editItem._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, amount: Number(values.amount), rate: values.rate ? Number(values.rate) : undefined }),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? t("failedLoadCommissions")); }
    setEditItem(null);
    await fetchCommissions();
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog(t("deleteConfirmation"));
    if (!ok) return;

    try {
      const res = await csrfFetch(`/api/commissions/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.error ?? t("failedDelete"));
      }

      toast.success(t("commissionDeleted"));
      await fetchCommissions();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("failedDelete"));
    }
  };

  const updateStatus = async (id: string, newStatus: string) => {
    const successMessage = newStatus === "approved" ? t("commissionApproved") : t("commissionMarkedPaid");

    try {
      const res = await csrfFetch(`/api/commissions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.error ?? t("failedUpdateStatus"));
      }

      toast.success(successMessage);
      await fetchCommissions();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("failedUpdateStatus"));
    }
  };

  const handleDispute = async (id: string) => {
    const reason = prompt(t("disputeReasonPrompt"));
    if (!reason?.trim()) return;
    try {
      const res = await csrfFetch(`/api/commissions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "disputed", disputeReason: reason.trim() }),
      });
      if (!res.ok) throw new Error(t("failedDispute"));
      toast.success(t("markDisputedSuccess"));
      await fetchCommissions();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("failedDispute"));
    }
  };

  const handleClawback = async (id: string, amount: number) => {
    const reason = prompt(t("disputeReasonPrompt"));
    if (!reason?.trim()) return;
    const amountStr = prompt(t("clawbackAmountPrompt") + ` ${amount}):`, String(amount));
    if (!amountStr) return;
    const clawbackAmount = Number(amountStr);
    if (isNaN(clawbackAmount) || clawbackAmount <= 0 || clawbackAmount > amount) {
      toast.error(t("invalidClawbackAmount"));
      return;
    }
    try {
      const res = await csrfFetch(`/api/commissions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "clawed_back", clawbackReason: reason.trim(), clawbackAmount }),
      });
      if (!res.ok) throw new Error(t("failedClawback"));
      toast.success(t("commissionClawbacked"));
      await fetchCommissions();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("failedClawback"));
    }
  };

  const handleResolveDispute = async (id: string) => {
    const ok = await confirmDialog(t("resolveDisputeConfirmation"));
    if (!ok) return;
    try {
      const res = await csrfFetch(`/api/commissions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disputeResolution: "resolved" }),
      });
      if (!res.ok) throw new Error(t("failedResolveDispute"));
      toast.success(t("disputeResolved"));
      await fetchCommissions();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("failedResolveDispute"));
    }
  };

  const visibleCommissions = commissions.length;
  const pendingAmount = summary.pending;
  const approvedAmount = summary.approved;
  const paidAmount = summary.paid;
  const summaryCurrency = summary.currency;
  const displayCurrency = currencyFilter || summaryCurrency;
  const hasActiveFilters = Boolean(status || typeFilter || searchTerm || dateFrom || dateTo || currencyFilter);

  const exportColumns: ExportColumn<Commission>[] = [
    { header: "Agent", key: "agentId" as keyof Commission, formatter: (_v, r) => { const c = r as unknown as Commission; return c.agentName ?? c.agentId?.fullName ?? "—"; } },
    { header: "Type", key: "type", formatter: (v) => String(v ?? "—") },
    { header: "Amount", key: "amount", formatter: (v) => String(v ?? 0) },
    { header: "Currency", key: "currency", formatter: (v) => String(v ?? "AED") },
    { header: "Rate %", key: "rate", formatter: (v) => v != null ? `${v}%` : "—" },
    { header: "Status", key: "status" },
    { header: "Created", key: "createdAt", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : "—" },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: commissions as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "commissions",
    title: "Commissions",
  });

  return (
    <div className="page-container">
      {ConfirmDialogNode}

      <DashboardPageHeader
        eyebrow={t("financeWorkspace")}
        title={t("commissionsTitle")}
        description={t("commissionsDescription")}
        summary={{
          label: t("commissionRecordsAcross"),
          value: total.toLocaleString(),
          note: `${totalPages.toLocaleString()} ${totalPages === 1 ? t("commissionRecordsPages") : t("commissionRecordsPages_plural")}`,
        }}
      />

      <TableToolbar
        search={searchTerm}
        onSearchChange={(value) => { setSearchTerm(value); resetPage(); }}
        searchPlaceholder={t("searchPlaceholder")}
        actions={can("commissions", "create") ? (
          <Button
            onClick={() => setShowAdd(true)}
            size="sm"
            className="h-9 gap-2 rounded-lg px-4"
          >
            <Plus className="h-4 w-4" />
            {t("addCommissionButton")}
          </Button>
        ) : undefined}
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
        filterContent={(
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div>
                <label htmlFor="admin-commissions-status-filter" className="sr-only">{t("filterByStatus")}</label>
                <SearchableSelect
                  id="admin-commissions-status-filter"
                  className="h-11 w-full rounded-xl border-border bg-card"
                  options={STATUS_OPTIONS}
                  value={status || "all"}
                  onValueChange={(value) => {
                    setStatus(value === "all" ? "" : value);
                    resetPage();
                  }}
                  placeholder={t("allStatuses")}
                />
              </div>

              <div>
                <label htmlFor="admin-commissions-type-filter" className="sr-only">{t("filterByType")}</label>
                <SearchableSelect
                  id="admin-commissions-type-filter"
                  className="h-11 w-full rounded-xl border-border bg-card"
                  options={TYPE_OPTIONS}
                  value={typeFilter || "all"}
                  onValueChange={(value) => {
                    setTypeFilter(value === "all" ? "" : value);
                    resetPage();
                  }}
                  placeholder={t("allTypes")}
                />
              </div>

              <div>
                <label htmlFor="admin-commissions-currency-filter" className="sr-only">{t("filterByCurrency")}</label>
                <SearchableSelect
                  id="admin-commissions-currency-filter"
                  className="h-11 w-full rounded-xl border-border bg-card"
                  options={CURRENCY_OPTIONS}
                  value={currencyFilter || "all"}
                  onValueChange={(value) => {
                    setCurrencyFilter(value === "all" ? "" : value);
                    resetPage();
                  }}
                  placeholder={t("allCurrencies")}
                />
              </div>

              <div className="flex items-center gap-2 xl:col-span-2">
                <DateTimePicker
                  mode="date"
                  value={dateFrom}
                  onChange={(v) => { setDateFrom(v); resetPage(); }}
                  placeholder={t("dateFromLabel")}
                  className="h-11 rounded-xl border-border bg-card text-sm flex-1"
                />
                <span className="text-xs text-muted-foreground">{t("dateRangeSeparator")}</span>
                <DateTimePicker
                  mode="date"
                  value={dateTo}
                  onChange={(v) => { setDateTo(v); resetPage(); }}
                  placeholder={t("dateToLabel")}
                  className="h-11 rounded-xl border-border bg-card text-sm flex-1"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setStatus("");
                  setTypeFilter("");
                  setSearchTerm("");
                  setCurrencyFilter("");
                  setDateFrom("");
                  setDateTo("");
                  resetPage();
                }}
                disabled={!hasActiveFilters}
                className="h-11 rounded-xl border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-50"
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                {t("clearFiltersButton")}
              </Button>
            </div>
          </div>
        )}
        hasActiveFilters={hasActiveFilters}
      />

      <section className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="workspace-glass-panel rounded-2xl p-3 sm:p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("visibleRecordsLabel")}</p>
                <p className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight text-primary">{visibleCommissions}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("visibleRecordsHint")}</p>
              </div>
              <div className="workspace-tone-sky rounded-2xl p-2.5">
                <WalletCards className="h-5 w-5" />
              </div>
            </div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("pendingReviewLabel")}</p>
                <p className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight text-primary">{displayCurrency} {pendingAmount.toLocaleString()}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("pendingReviewHint")}</p>
              </div>
              <div className="workspace-tone-sky rounded-2xl p-2.5">
                <Clock3 className="h-5 w-5" />
              </div>
            </div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("approvedLabel")}</p>
                <p className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight text-primary">{displayCurrency} {approvedAmount.toLocaleString()}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("approvedHint")}</p>
              </div>
              <div className="workspace-tone-sky rounded-2xl p-2.5">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("paidOutLabel")}</p>
                <p className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight text-primary">{displayCurrency} {paidAmount.toLocaleString()}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("paidOutHint")}</p>
              </div>
              <div className="workspace-tone-sky rounded-2xl p-2.5">
                <ReceiptText className="h-5 w-5" />
              </div>
            </div>
          </div>
      </section>

      {errorMessage ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-700 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          {errorMessage}
        </div>
      ) : null}

      <section className="workspace-panel-surface overflow-hidden rounded-[24px]">
        <div className="flex flex-col gap-2 border-b border-border/80 px-4 py-4 sm:px-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("commissionLedgerLabel")}</p>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-lg font-semibold text-foreground">{t("commissionLedgerTitle")}</h3>
            <p className="text-sm text-muted-foreground">{t("recordsShowing")} {visibleCommissions.toLocaleString()} {visibleCommissions === 1 ? t("record") : t("records")} {t("onThisPage")}</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/80 bg-secondary/72 hover:bg-secondary/72">
                <TableHead>{t("tableHeaderAgent")}</TableHead>
                <TableHead>{t("tableHeaderType")}</TableHead>
                <TableHead>{t("tableHeaderAmount")}</TableHead>
                <TableHead>{t("tableHeaderStatus")}</TableHead>
                <TableHead>{t("tableHeaderDate")}</TableHead>
                <TableHead className="text-right">{t("tableHeaderActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-border/70 hover:bg-transparent">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}>
                        <div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : commissions.length === 0 ? (
                <TableRow className="border-border/70 hover:bg-transparent">
                  <TableCell colSpan={6} className="px-6 py-14 text-center">
                    <div className="flex flex-col items-center gap-3 text-center">
                      <div className="workspace-muted-pill rounded-[20px] p-3">
                        <Inbox className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{t("noCommissionsFound")}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{t("noCommissionsHint")}</p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : commissions.map((c) => (
                <TableRow key={c._id} className="border-border/70">
                  <TableCell>
                    <div>
                      <p className="font-medium text-foreground">{c.agentName ?? c.agentId?.fullName ?? "—"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{t("commissionRecord")}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <span className="inline-flex rounded-full border border-border/70 bg-secondary/70 px-2.5 py-1 text-xs font-medium capitalize text-foreground">
                      {c.type ?? "placement"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-semibold text-foreground">{c.currency ?? "USD"} {c.amount.toLocaleString()}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{c.rate ? `${c.rate}% rate` : t("rateNotSet")}</p>
                    </div>
                  </TableCell>
                  <TableCell><StatusBadge status={c.status} /></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {can("commissions", "approve") && c.status === "pending" && (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => updateStatus(c._id, "approved")}
                          className="text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                        >
                          {t("approveButton")}
                        </Button>
                      )}
                      {can("commissions", "approve") && c.status === "approved" && (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => updateStatus(c._id, "paid")}
                          className="text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950/40"
                        >
                          {t("markPaidButton")}
                        </Button>
                      )}
                      {can("commissions", "approve") && (c.status === "approved" || c.status === "paid") && (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => handleDispute(c._id)}
                          className="text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40"
                          title={t("disputeTitle")}
                        >
                          {t("disputeButton")}
                        </Button>
                      )}
                      {can("commissions", "approve") && c.status === "paid" && (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => handleClawback(c._id, c.amount)}
                          className="text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40"
                          title={t("clawbackTitle")}
                        >
                          {t("clawbackButton")}
                        </Button>
                      )}
                      {can("commissions", "approve") && c.status === "disputed" && (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => handleResolveDispute(c._id)}
                          className="text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                          title={t("resolveTitle")}
                        >
                          {t("resolveButton")}
                        </Button>
                      )}
                      {can("commissions", "update") && (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => setEditItem(c)}
                          title={t("editButton")}
                          aria-label={`${t("editAriaLabel")} ${c.agentId?.fullName ?? "agent"}`}
                        >
                          <Pencil className="h-3.5 w-3.5 text-primary" />
                        </Button>
                      )}
                      {can("commissions", "delete") && (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => handleDelete(c._id)}
                          title={t("deleteButton")}
                          aria-label={`${t("deleteAriaLabel")} ${c.agentId?.fullName ?? "agent"}`}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="border-t border-border/80 px-4 py-3 sm:px-5">
          <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
        </div>
      </section>

      <CrudModal open={showAdd} onClose={() => setShowAdd(false)} title={t("addModalTitle")} fields={ADD_FIELDS} onSubmit={handleCreate} />
      <CrudModal open={!!editItem} onClose={() => setEditItem(null)} title={t("editModalTitle")} fields={ADD_FIELDS}
        initialValues={editItem ? { type: editItem.type ?? "placement", amount: String(editItem.amount), currency: editItem.currency ?? "AED", rate: String(editItem.rate ?? ""), notes: editItem.notes ?? "" } : undefined}
        onSubmit={handleEdit} />
    </div>
  );
}
