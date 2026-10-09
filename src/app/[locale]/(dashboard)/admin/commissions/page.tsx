"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { formErrorFromResponse } from "@/lib/errors/form-error";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { ErrorState } from "@/components/shared/ErrorState";
import { toast } from "sonner";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";
import { TableBodySkeleton } from "@/components/ui/loading";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePermissions } from "@/hooks/usePermissions";
import { usePagination } from "@/hooks/usePagination";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Pencil, Trash2, Clock3, CheckCircle2, WalletCards, ReceiptText, Inbox } from "lucide-react";
import { useConfirm } from "@/hooks/useConfirm";
import { csrfFetch } from "@/lib/security/csrf-client";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useTableExport } from "@/hooks/useTableExport";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { RowActions, type RowAction } from "@/components/shared/RowActions";
import {
  CommissionActionDialog, type CommissionActionMode, type CommissionActionTarget, type CommissionActionValues,
} from "./_components/CommissionActionDialog";
import { CommissionPayoutDialog, type CommissionPayoutValues } from "./_components/CommissionPayoutDialog";
import { commissionExportColumns, type Commission } from "./_components/commissionRow";
import type { ExportColumn } from "@/lib/export";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { toUserFacingError } from "@/lib/errors/user-facing";
import { formatCount, formatDate } from "@/lib/ui/intlFormat";

interface CurrencyTotals { currency: string; pending: number; approved: number; paid: number }
/** GET /api/commissions `summary`; the single figures mix currencies, byCurrency doesn't. */
interface CommissionSummary { pending: number; approved: number; paid: number; currency: string; byCurrency?: CurrencyTotals[] }

export default function AdminCommissionsPage() {
  const t = useTranslations("adminCommissions");
  const tf = useTranslations("formErrors");
  const locale = useLocale();
  const { can } = usePermissions();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();

  // Commissions come from recruitment invoices, so their money is not edited
  // here (the API refuses it); corrections go through Dispute or Clawback.
  const NOTE_FIELDS: CrudField[] = [
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
  ];
  const TYPE_LABELS: Record<string, string> = { placement: t("typePlacement"), override: t("typeOverride"), bonus: t("typeBonus") };

  const CURRENCY_OPTIONS = [
    { value: "all", label: t("allCurrencies") },
    ...SUPPORTED_CURRENCIES.map(c => ({ value: c.code, label: `${c.code} — ${c.label}` })),
  ];
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // In the URL so the dashboard's "pending commissions" row lands filtered.
  const [status, setStatus] = useUrlFilter("status", "", { allow: ["pending", "approved", "paid", "disputed", "clawed_back"] });
  const [typeFilter, setTypeFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState("");
  const [summary, setSummary] = useState<CommissionSummary>({ pending: 0, approved: 0, paid: 0, currency: "AED" });
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [editItem, setEditItem] = useState<Commission | null>(null);
  const [payoutTarget, setPayoutTarget] = useState<CommissionActionTarget | null>(null);
  const [actionTarget, setActionTarget] = useState<{ mode: CommissionActionMode; target: CommissionActionTarget } | null>(null);

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
      const message = toUserFacingError(error, { fallback: t("failedLoadCommissions") }).message;
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [status, typeFilter, searchTerm, dateFrom, dateTo, currencyFilter, page, limit, updateTotal]);

  useEffect(() => { fetchCommissions(); }, [fetchCommissions]);

  useEffect(() => { document.title = "Commissions · MPLOYEDIN"; }, []);

  const handleEdit = async (values: Record<string, string>) => {
    if (!editItem) {
      throw new Error("No commission selected for editing");
    }

    const res = await csrfFetch(`/api/commissions/${editItem._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: values.notes ?? "" }),
    });
    if (!res.ok) throw await formErrorFromResponse(res, { t: tf, locale, fieldLabels: NOTE_FIELDS });
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
      toast.error(toUserFacingError(error, { fallback: t("failedDelete") }).message);
    }
  };

  const approve = async (id: string) => {
    try {
      const res = await csrfFetch(`/api/commissions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.error ?? t("failedUpdateStatus"));
      }

      toast.success(t("commissionApproved"));
      await fetchCommissions();
    } catch (error: unknown) {
      toast.error(toUserFacingError(error, { fallback: t("failedUpdateStatus") }).message);
    }
  };

  // Mark paid records the payout (method, reference, day) in CommissionPayoutDialog.
  const submitPayout = async (values: CommissionPayoutValues) => {
    if (!payoutTarget) return;
    const res = await csrfFetch(`/api/commissions/${payoutTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "paid", ...values }),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => null);
      // A 422 reason (missing reference, future date) is written for this screen.
      throw new Error(res.status === 422 && error?.error
        ? error.error
        : toUserFacingError(new Error(error?.error ?? ""), { fallback: t("failedUpdateStatus") }).message);
    }
    toast.success(t("commissionMarkedPaid"));
    await fetchCommissions();
  };

  // Dispute and clawback collect a reason (and amount) in CommissionActionDialog.
  const submitCommissionAction = async ({ reason, clawbackAmount }: CommissionActionValues) => {
    if (!actionTarget) return;
    const isClawback = actionTarget.mode === "clawback";
    const fallback = isClawback ? t("failedClawback") : t("failedDispute");
    const res = await csrfFetch(`/api/commissions/${actionTarget.target.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isClawback
        ? { status: "clawed_back", clawbackReason: reason, clawbackAmount }
        : { status: "disputed", disputeReason: reason }),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => null);
      throw new Error(toUserFacingError(new Error(error?.error ?? fallback), { fallback }).message);
    }
    toast.success(isClawback ? t("commissionClawbacked") : t("markDisputedSuccess"));
    await fetchCommissions();
  };

  const recipientLabel = (c: Commission) => c.recipientName ?? c.agentName ?? t("recipientNone");
  const targetFor = (c: Commission): CommissionActionTarget => ({ id: c._id, name: recipientLabel(c), amount: c.amount, currency: c.currency ?? "USD" });
  const openCommissionAction = (mode: CommissionActionMode, c: Commission) => setActionTarget({ mode, target: targetFor(c) });

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
      toast.error(toUserFacingError(error, { fallback: t("failedResolveDispute") }).message);
    }
  };

  const hasActiveFilters = Boolean(status || typeFilter || searchTerm || dateFrom || dateTo || currencyFilter);

  // Lines keep their invoice's currency and nothing converts, so each card lists
  // one figure per currency ("AED 1,200 · INR 6,000") instead of adding them up.
  const currencyTotals = summary.byCurrency?.length
    ? summary.byCurrency
    : [{ currency: currencyFilter || summary.currency, pending: summary.pending, approved: summary.approved, paid: summary.paid }];
  // One line per currency: a quarter-width card can't hold "INR 50,330 · AED 3,000"
  // at any width. Two or more currencies step down a size so the card grows
  // one short line, not a wide one. Whole units, like the invoices strip; rows stay exact.
  const moneyStrip = (pick: (row: CurrencyTotals) => number) => {
    const rows = currencyTotals.filter((row) => pick(row) > 0);
    const shown = rows.length ? rows : currencyTotals.slice(0, 1);
    const size = shown.length > 1 ? "text-sm leading-snug sm:text-lg sm:leading-tight" : "text-sm sm:text-2xl";
    return (
      <span className={`flex flex-col ${size}`}>
        {shown.map((row) => (
          <span key={row.currency}>{row.currency} {formatCount(rows.length ? pick(row) : 0, { maximumFractionDigits: 0 })}</span>
        ))}
      </span>
    );
  };

  const commissionMetrics = [
    { label: t("recordsLabel"), value: formatCount(total), icon: WalletCards, iconSurfaceClassName: "workspace-tone-sky" },
    { label: t("pendingReviewLabel"), value: moneyStrip((row) => row.pending), icon: Clock3, iconSurfaceClassName: "workspace-tone-sky" },
    { label: t("approvedLabel"), value: moneyStrip((row) => row.approved), icon: CheckCircle2, iconSurfaceClassName: "workspace-tone-sky" },
    { label: t("paidOutLabel"), value: moneyStrip((row) => row.paid), icon: ReceiptText, iconSurfaceClassName: "workspace-tone-sky" },
  ];

  // BUG-004: export the full filtered result set, not just the visible page.
  const fetchAllCommissions = useCallback(async () => {
    const base = new URLSearchParams();
    if (status) base.set("status", status);
    if (typeFilter) base.set("type", typeFilter);
    if (searchTerm.trim()) base.set("search", searchTerm.trim());
    if (dateFrom) base.set("dateFrom", dateFrom);
    if (dateTo) base.set("dateTo", dateTo);
    if (currencyFilter) base.set("currency", currencyFilter);
    return fetchAllPaginated<Record<string, unknown>>(
      (page, limit) => `/api/commissions?${new URLSearchParams({ ...Object.fromEntries(base), page: String(page), limit: String(limit) })}`,
      (json) => ({
        rows: (((json.items ?? json.commissions ?? []) as Record<string, unknown>[])),
        total: Number(json.total ?? json.totalCount ?? (json.pagination as { total?: number } | undefined)?.total ?? 0),
      }),
    );
  }, [status, typeFilter, searchTerm, dateFrom, dateTo, currencyFilter]);
  const exportColumns = commissionExportColumns(t, TYPE_LABELS);
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: commissions as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "commissions",
    title: t("exportTitle"),
    fetchAll: fetchAllCommissions,
  });


  // The row's next step (Approve → Mark paid, or Resolve a dispute) is the
  // labelled button, like Mark paid on Placements; otherwise Edit is.
  const rowActionsFor = (c: Commission): { quick: RowAction[]; menu: RowAction[] } => {
    const canApprove = can("commissions", "approve");
    const next: RowAction | null = !canApprove ? null
      : c.status === "pending" ? { key: "approve", label: t("approveButton"), icon: CheckCircle2, iconClassName: "text-emerald-600", onSelect: () => approve(c._id) }
      : c.status === "approved" && can("commissions", "update") ? { key: "paid", label: t("markPaidButton"), icon: CheckCircle2, iconClassName: "text-emerald-600", onSelect: () => setPayoutTarget(targetFor(c)) }
      : c.status === "disputed" ? { key: "resolve", label: t("resolveButton"), icon: CheckCircle2, onSelect: () => handleResolveDispute(c._id) }
      : null;
    const edit: RowAction | null = can("commissions", "update")
      ? { key: "edit", label: t("editNotesButton"), icon: Pencil, iconOnly: true, onSelect: () => setEditItem(c) }
      : null;
    const quick = [next ?? edit].filter((x): x is RowAction => x !== null);
    // Money already sent is recovered by clawback — also while it is disputed.
    const paidOut = c.status === "paid" || (c.status === "disputed" && Boolean(c.paidAt));
    // An invoice's line goes when the invoice is voided; a paid one by clawback.
    const deletable = !c.invoice && !c.paidAt && c.status !== "paid" && c.status !== "clawed_back";
    const menu: RowAction[] = [
      ...(next && edit ? [edit] : []),
      ...(canApprove && (c.status === "approved" || c.status === "paid")
        ? [{ key: "dispute", label: t("disputeButton"), icon: Clock3, onSelect: () => openCommissionAction("dispute", c) }] : []),
      ...(can("commissions", "update") && paidOut
        ? [{ key: "clawback", label: t("clawbackButton"), icon: Trash2, destructive: true, onSelect: () => openCommissionAction("clawback", c) }] : []),
      ...(can("commissions", "delete") && deletable
        ? [{ key: "delete", label: t("deleteButton"), icon: Trash2, iconOnly: true, destructive: true, onSelect: () => handleDelete(c._id) }] : []),
    ];
    return { quick, menu };
  };

  return (
    <div className="page-container">
      {ConfirmDialogNode}

      <DashboardPageHeader
        compact
        compactOnMobile
        title={t("commissionsTitle")}
        description={t("commissionsDescription")}
        metrics={commissionMetrics}
      />

      <InlineFilterBar
        className="workspace-panel-surface rounded-2xl border-b-0"
        onClear={hasActiveFilters ? () => {
          setStatus("");
          setTypeFilter("");
          setSearchTerm("");
          setCurrencyFilter("");
          setDateFrom("");
          setDateTo("");
          resetPage();
        } : undefined}
        clearLabel={t("clearFiltersButton")}
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
        moreLabel={t("advancedFilters")}
        more={(
          <>
            <SearchableSelect
              id="admin-commissions-type-filter"
              className={INLINE_FILTER_CONTROL}
              options={TYPE_OPTIONS}
              value={typeFilter || "all"}
              onValueChange={(value) => {
                setTypeFilter(value === "all" ? "" : value);
                resetPage();
              }}
              placeholder={t("allTypes")}
            />
            <SearchableSelect
              id="admin-commissions-currency-filter"
              className={INLINE_FILTER_CONTROL}
              options={CURRENCY_OPTIONS}
              value={currencyFilter || "all"}
              onValueChange={(value) => {
                setCurrencyFilter(value === "all" ? "" : value);
                resetPage();
              }}
              placeholder={t("allCurrencies")}
            />
            <div className="flex items-center gap-2">
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
          </>
        )}
      >
        <InlineFilterSearch
          value={searchTerm}
          onChange={(value) => { setSearchTerm(value); resetPage(); }}
          placeholder={t("searchPlaceholder")}
        />
        <SearchableSelect
          id="admin-commissions-status-filter"
          className={INLINE_FILTER_CONTROL}
          options={STATUS_OPTIONS}
          value={status || "all"}
          onValueChange={(value) => {
            setStatus(value === "all" ? "" : value);
            resetPage();
          }}
          placeholder={t("allStatuses")}
        />
      </InlineFilterBar>

      {errorMessage ? (
        <ErrorState title={t("failedLoadCommissions")} onRetry={fetchCommissions} />
      ) : null}

      <section className="workspace-panel-surface overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/80 bg-muted/30 hover:bg-muted/30">
                <TableHead>{t("tableHeaderRecipient")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t("tableHeaderType")}</TableHead>
                <TableHead>{t("tableHeaderInvoice")}</TableHead>
                <TableHead>{t("tableHeaderAmount")}</TableHead>
                <TableHead>{t("tableHeaderStatus")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t("tableHeaderDate")}</TableHead>
                <TableHead className="text-right">{t("tableHeaderActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableBodySkeleton rows={5} cols={7} />
              ) : commissions.length === 0 ? (
                <TableRow className="border-border/70 hover:bg-transparent">
                  <TableCell colSpan={7} className="px-6 py-14 text-center">
                    <div className="flex flex-col items-center gap-3 text-center">
                      <div className="workspace-muted-pill rounded-3xl p-3">
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
                      <p className={c.recipientName ? "font-medium text-foreground" : "font-medium text-muted-foreground"}>{c.recipientName ?? t("recipientNone")}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {c.recipientRole === "super_agent" ? t("recipientSuperAgent") : c.recipientRole === "agent" ? t("recipientAgent") : t("recipientNoneHint")}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    <span className="inline-flex rounded-full border border-border/70 bg-secondary/70 px-2.5 py-1 text-xs font-medium text-foreground">
                      {TYPE_LABELS[c.type ?? "placement"] ?? c.type}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {c.invoice ? (
                      <Link href={`/${locale}/admin/invoices?invoice=${c.invoice._id}`} className="whitespace-nowrap font-medium text-primary underline-offset-4 hover:underline">
                        {c.invoice.invoiceNumber ?? t("viewInvoice")}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">{t("noInvoice")}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="whitespace-nowrap font-semibold text-foreground">{c.currency ?? "USD"} {formatCount(c.amount)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{c.rate ? t("rateValue", { rate: c.rate }) : t("rateNotSet")}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={c.status} />
                    {c.status === "paid" && c.paymentRef ? (
                      <p className="mt-1 max-w-40 truncate text-xs text-muted-foreground" title={c.paymentRef}>{t("paidRef", { ref: c.paymentRef })}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-sm text-muted-foreground lg:table-cell">{formatDate(new Date(c.createdAt), { day: "2-digit", month: "short", year: "numeric" })}</TableCell>
                  <TableCell className="text-right">
                    <RowActions name={recipientLabel(c)} {...rowActionsFor(c)} />
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

      <CrudModal open={!!editItem} onClose={() => setEditItem(null)} title={t("editNotesTitle")} description={t("editNotesDescription")} fields={NOTE_FIELDS}
        initialValues={editItem ? { notes: editItem.notes ?? "" } : undefined}
        onSubmit={handleEdit} />
      <CommissionPayoutDialog target={payoutTarget} onClose={() => setPayoutTarget(null)} onSubmit={submitPayout} />
      <CommissionActionDialog mode={actionTarget?.mode ?? null} target={actionTarget?.target ?? null}
        onClose={() => setActionTarget(null)} onSubmit={submitCommissionAction} />
    </div>
  );
}
