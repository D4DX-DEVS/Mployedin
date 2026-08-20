"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { usePagination } from "@/hooks/usePagination";
import { useTableExport } from "@/hooks/useTableExport";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { csrfFetch } from "@/lib/security/csrf-client";
import type { ExportColumn } from "@/lib/export";
import {
  Search, RotateCcw, Gift, Clock, CheckCircle2, XCircle,
  Inbox, Eye, X, FileDown, Pencil, Send, History, ArrowLeftRight,
} from "lucide-react";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface OfferItem {
  _id: string;
  candidateName: string;
  candidateEmail?: string;
  jobTitle: string;
  companyName?: string;
  salary?: number;
  currency?: string;
  period?: "monthly" | "annually";
  benefits?: string;
  notes?: string;
  status: string;
  startDate?: string;
  expiresAt?: string;
  respondedAt?: string;
  declineReason?: string;
  createdAt: string;
  revisionNumber?: number;
  viewedAt?: string;
  lastRemindedAt?: string;
  reminderCount?: number;
  counterOffer?: {
    amount: number;
    currency: string;
    period: string;
    note?: string;
    proposedAt?: string;
  } | null;
  events?: Array<{
    type: string;
    at: string;
    actorRole?: string;
    actorName?: string;
    note?: string;
  }>;
}

interface Filters {
  search: string;
  status: string;
}

const INITIAL_FILTERS: Filters = { search: "", status: "all" };

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AgentOffersPage() {
  const t = useTranslations("agentOffers");
  const locale = useLocale();
  const [offers, setOffers] = useState<OfferItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [stats, setStats] = useState({ total: 0, pending: 0, accepted: 0, declined: 0 });
  const [detailOffer, setDetailOffer] = useState<OfferItem | null>(null);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [withdrawPending, setWithdrawPending] = useState(false);
  const [reviseOffer, setReviseOffer] = useState<OfferItem | null>(null);
  const [reviseForm, setReviseForm] = useState({
    amount: "", currency: "AED", period: "monthly", startDate: "", expiresAt: "", benefits: "", notes: "", revisionNote: "",
  });
  const [reviseError, setReviseError] = useState("");
  const [revisePending, setRevisePending] = useState(false);
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const pagination = usePagination();
  const { paginationParams, updateTotal } = pagination;

  const statusOptions = [
    { value: "all", label: t("statusOptions.all") },
    { value: "pending", label: t("status.pending") },
    { value: "countered", label: t("status.countered") },
    { value: "accepted", label: t("status.accepted") },
    { value: "declined", label: t("status.declined") },
    { value: "expired", label: t("status.expired") },
    { value: "withdrawn", label: t("status.withdrawn") },
  ];

  const formatDate = useCallback((date?: string) => date ? new Date(date).toLocaleDateString(locale) : "—", [locale]);

  const statusLabel = (status: string) => {
    switch (status) {
      case "pending": return t("status.pending");
      case "countered": return t("status.countered");
      case "accepted": return t("status.accepted");
      case "declined": return t("status.declined");
      case "expired": return t("status.expired");
      case "withdrawn": return t("status.withdrawn");
      default: return status;
    }
  };

  const getStatusBadgeVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "accepted": return "default";
      case "pending": return "secondary";
      case "countered": return "outline";
      case "declined":
      case "withdrawn": return "destructive";
      default: return "outline";
    }
  };

  const isExpired = (o: OfferItem) =>
    o.status === "pending" && !!o.expiresAt && new Date(o.expiresAt) < new Date();

  const isExpiringSoon = (o: OfferItem) => {
    if (o.status !== "pending" || !o.expiresAt) return false;
    const daysLeft = Math.ceil((new Date(o.expiresAt).getTime() - Date.now()) / 86400000);
    return daysLeft <= 2 && daysLeft > 0;
  };

  const formatSalary = (o: OfferItem) => {
    if (!o.salary) return "—";
    const periodLabel = o.period === "annually" ? t("perYear") : o.period === "monthly" ? t("perMonth") : "";
    return `${o.currency ?? "AED"} ${o.salary.toLocaleString(locale)} ${periodLabel}`.trim();
  };

  const fetchOffers = useCallback(async () => {
    setLoading(true);
    try {
      const params = paginationParams();
      if (filters.search) params.set("search", filters.search);
      if (filters.status !== "all") params.set("status", filters.status);
      params.set("scope", "agent");

      const res = await fetch(`/api/offers?${params}`, { cache: "no-store" });
      if (!res.ok) {
        throw new Error("Failed to fetch offers");
      }

      const data = await res.json();
      setOffers(data.items ?? []);
      updateTotal(data.total ?? 0);
      if (data.stats) setStats(data.stats);
    } catch {
      setOffers([]);
      updateTotal(0);
      toast.error(t("errors.fetchFailed"));
    } finally {
      setLoading(false);
    }
  }, [filters, paginationParams, updateTotal, t]);

  useEffect(() => { fetchOffers(); }, [fetchOffers]);

  const updateFilter = (key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    pagination.resetPage();
  };

  const handleWithdraw = async (offerId: string) => {
    setWithdrawPending(true);
    try {
      const res = await csrfFetch(`/api/offers/${offerId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to withdraw");
      toast.success(t("success.withdrawn"));
      setWithdrawingId(null);
      if (detailOffer?._id === offerId) setDetailOffer(null);
      await fetchOffers();
    } catch {
      toast.error(t("errors.withdrawFailed"));
    } finally {
      setWithdrawPending(false);
    }
  };

  const toDateInput = (iso?: string) => {
    const d = iso ? new Date(iso) : new Date();
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  };

  const openRevise = (o: OfferItem) => {
    setReviseError("");
    // Pre-fill with the candidate's counter (if any) so agents can revise to match.
    const amount = o.counterOffer?.amount ?? o.salary ?? "";
    const currency = o.counterOffer?.currency || o.currency || "AED";
    const period = o.counterOffer?.period || o.period || "monthly";
    const expires = new Date(); expires.setDate(expires.getDate() + 7);
    setReviseForm({
      amount: String(amount || ""),
      currency,
      period,
      startDate: toDateInput(o.startDate),
      expiresAt: toDateInput(expires.toISOString()),
      benefits: o.benefits || "",
      notes: o.notes || "",
      revisionNote: "",
    });
    setReviseOffer(o);
  };

  const submitRevise = async () => {
    if (!reviseOffer) return;
    setReviseError("");
    const amount = Number(reviseForm.amount);
    if (!amount || amount <= 0) { setReviseError(t("reviseDialog.errors.amount")); return; }
    if (!/^[A-Za-z]{3}$/.test(reviseForm.currency)) { setReviseError(t("reviseDialog.errors.currency")); return; }
    if (!reviseForm.startDate) { setReviseError(t("reviseDialog.errors.startDate")); return; }
    if (new Date(reviseForm.startDate) <= new Date()) { setReviseError(t("reviseDialog.errors.startFuture")); return; }
    setRevisePending(true);
    try {
      const res = await csrfFetch(`/api/offers/${reviseOffer._id}/revise`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salary: { amount, currency: reviseForm.currency.toUpperCase(), period: reviseForm.period },
          startDate: new Date(reviseForm.startDate).toISOString(),
          expiresAt: reviseForm.expiresAt ? new Date(reviseForm.expiresAt).toISOString() : undefined,
          benefits: reviseForm.benefits.trim() || undefined,
          notes: reviseForm.notes.trim() || undefined,
          revisionNote: reviseForm.revisionNote.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setReviseError(data.error || t("reviseDialog.errors.failed"));
        return;
      }
      toast.success(t("success.revised"));
      setReviseOffer(null);
      if (detailOffer?._id === reviseOffer._id) setDetailOffer(null);
      await fetchOffers();
    } finally {
      setRevisePending(false);
    }
  };

  const handleRemind = async (offerId: string) => {
    setRemindingId(offerId);
    try {
      const res = await csrfFetch(`/api/offers/${offerId}/remind`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || t("errors.remindFailed"));
        return;
      }
      toast.success(t("success.reminded"));
      await fetchOffers();
    } finally {
      setRemindingId(null);
    }
  };

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: t("table.candidate"), key: "candidateName" },
    { header: t("table.job"), key: "jobTitle" },
    { header: t("table.salary"), key: "salary", formatter: (_v, r) => formatSalary(r as unknown as OfferItem) },
    { header: t("table.status"), key: "status", formatter: (v) => statusLabel(String(v)) },
    { header: t("table.startDate"), key: "startDate", formatter: (v) => formatDate(v ? String(v) : undefined) },
    { header: t("table.expires"), key: "expiresAt", formatter: (v) => formatDate(v ? String(v) : undefined) },
    { header: t("table.sent"), key: "createdAt", formatter: (v) => formatDate(v ? String(v) : undefined) },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: offers as unknown as Record<string, unknown>[],
    columns: exportColumns,
    filename: "agent-offers",
    title: t("header.title"),
  });

  return (
    <div className="page-container">
      <DashboardPageHeader
        icon={Gift}
        eyebrow={t("header.title")}
        title={t("header.title")}
        description={t("header.description")}
        metrics={[
          { label: t("metrics.total"), value: stats.total, icon: Gift },
          { label: t("status.pending"), value: stats.pending, icon: Clock },
          { label: t("status.accepted"), value: stats.accepted, icon: CheckCircle2 },
          { label: t("status.declined"), value: stats.declined, icon: XCircle },
        ]}
      />

      {/* Filters */}
      <section className="workspace-panel-surface rounded-[28px] panel-body">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("filters.searchPlaceholder")}
              value={filters.search}
              onChange={(e) => updateFilter("search", e.target.value)}
              className="pl-9"
            />
          </div>
          <SearchableSelect options={statusOptions} value={filters.status} onValueChange={(v) => updateFilter("status", v)} placeholder={t("filters.status")} className="w-36" />
          <Button variant="ghost" size="sm" onClick={() => { setFilters(INITIAL_FILTERS); pagination.resetPage(); }}>
            <RotateCcw className="mr-1 h-4 w-4" /> {t("actions.reset")}
          </Button>
        </div>
      </section>

      {/* Table */}
      <section className="workspace-panel-surface rounded-[28px] panel-body">
        {!loading && offers.length > 0 && (
          <TableToolbar
            onExportCsv={handleExportCsv}
            onExportExcel={handleExportExcel}
            onExportPdf={handleExportPdf}
            className="mb-4"
          />
        )}
        {loading ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("table.candidate")}</TableHead>
                  <TableHead>{t("table.job")}</TableHead>
                  <TableHead>{t("table.salary")}</TableHead>
                  <TableHead>{t("table.startDate")}</TableHead>
                  <TableHead className="text-right">{t("table.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : offers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Inbox className="h-12 w-12 text-muted-foreground/40" />
            <p className="mt-4 text-sm font-medium text-muted-foreground">{t("empty")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("table.candidate")}</TableHead>
                  <TableHead>{t("table.job")}</TableHead>
                  <TableHead>{t("table.salary")}</TableHead>
                  <TableHead>{t("table.startDate")}</TableHead>
                  <TableHead className="text-right">{t("table.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {offers.map((o) => (
                  <TableRow key={o._id} className={isExpiringSoon(o) ? "bg-amber-500/10" : undefined}>
                    <TableCell>
                      <p className="font-medium text-foreground">{o.candidateName}</p>
                      {o.candidateEmail && <p className="text-xs text-muted-foreground">{o.candidateEmail}</p>}
                      <Badge variant={getStatusBadgeVariant(o.status)}>
                        {isExpired(o) ? t("status.expired") : statusLabel(o.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{o.jobTitle}</p>
                      {o.companyName && <p className="text-xs text-muted-foreground">{o.companyName}</p>}
                    </TableCell>
                    <TableCell className="text-sm">{formatSalary(o)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <span className="block">{formatDate(o.startDate)}</span>
                      <span className="mt-1 block text-xs">{t("table.expires")}: {formatDate(o.expiresAt)}</span>
                      <span className="mt-1 block text-xs">{t("table.sent")}: {formatDate(o.createdAt)}</span>
                      {isExpiringSoon(o) && (
                        <span className="mt-1 block text-xs font-semibold text-amber-600">{t("expiringSoon")}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1.5">
                        <Button size="sm" variant="ghost" className="h-8 rounded-lg px-2.5 text-xs"
                          onClick={() => setDetailOffer(o)}>
                          <Eye className="me-1 h-3.5 w-3.5" />
                          {t("actions.view")}
                        </Button>
                        {(o.status === "pending" || o.status === "countered") && !isExpired(o) && (
                          <Button size="sm" variant="ghost"
                            className="h-8 rounded-lg px-2.5 text-xs"
                            onClick={() => openRevise(o)}>
                            {o.status === "countered"
                              ? <ArrowLeftRight className="me-1 h-3.5 w-3.5" />
                              : <Pencil className="me-1 h-3.5 w-3.5" />}
                            {o.status === "countered" ? t("actions.respondCounter") : t("actions.revise")}
                          </Button>
                        )}
                        {o.status === "pending" && !isExpired(o) && (
                          <Button size="sm" variant="ghost"
                            className="h-8 rounded-lg px-2.5 text-xs"
                            disabled={remindingId === o._id}
                            onClick={() => handleRemind(o._id)}>
                            <Send className="me-1 h-3.5 w-3.5" />
                            {t("actions.remind")}
                          </Button>
                        )}
                        {(o.status === "pending" || o.status === "countered") && !isExpired(o) && (
                          <Button size="sm" variant="ghost"
                            className="h-8 rounded-lg px-2.5 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                            onClick={() => setWithdrawingId(o._id)}>
                            <X className="me-1 h-3.5 w-3.5" />
                            {t("actions.withdraw")}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <PaginationControls
        page={pagination.page}
        totalPages={pagination.totalPages}
        limit={pagination.limit}
        total={pagination.total}
        onPageChange={pagination.setPage}
        onLimitChange={pagination.setLimit}
      />

      {/* Withdraw confirm */}
      {withdrawingId && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-[28px] border border-border bg-background shadow-[0_30px_90px_-36px_rgba(15,23,42,0.5)]">
            <div className="border-b border-border/60 px-6 py-5">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">{t("withdrawDialog.title")}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("withdrawDialog.description")}</p>
            </div>
            <div className="flex justify-end gap-2 px-6 py-5">
              <Button variant="ghost" className="rounded-xl" onClick={() => setWithdrawingId(null)} disabled={withdrawPending}>
                {t("actions.cancel")}
              </Button>
              <Button variant="destructive" className="rounded-xl" disabled={withdrawPending} onClick={() => handleWithdraw(withdrawingId)}>
                {withdrawPending ? t("withdrawDialog.withdrawing") : t("withdrawDialog.confirm")}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Detail modal */}
      {detailOffer && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-border bg-background shadow-[0_30px_90px_-36px_rgba(15,23,42,0.5)]">
            <div className="flex items-start justify-between gap-4 panel-head">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("detail.title")}</p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{detailOffer.jobTitle}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("detail.description")}</p>
              </div>
              <Button size="sm" variant="ghost" className="h-9 w-9 rounded-full p-0" onClick={() => setDetailOffer(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-5 px-6 py-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("detail.candidate")}</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">{detailOffer.candidateName}</p>
                  {detailOffer.candidateEmail && <p className="text-xs text-muted-foreground">{detailOffer.candidateEmail}</p>}
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("detail.status")}</p>
                  <Badge variant={getStatusBadgeVariant(detailOffer.status)} className="mt-2">
                    {isExpired(detailOffer) ? t("status.expired") : statusLabel(detailOffer.status)}
                  </Badge>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("detail.salary")}</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">{formatSalary(detailOffer)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("detail.startDate")}</p>
                  <p className="mt-2 text-sm text-foreground/85">{formatDate(detailOffer.startDate)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("detail.createdAt")}</p>
                  <p className="mt-2 text-sm text-foreground/85">{formatDate(detailOffer.createdAt)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("detail.expires")}</p>
                  <p className="mt-2 text-sm text-foreground/85">{formatDate(detailOffer.expiresAt)}</p>
                </div>
              </div>
              {detailOffer.benefits && (
                <div className="rounded-2xl border border-border bg-background/60 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("detail.benefits")}</p>
                  <p className="mt-2 text-sm leading-6 text-foreground/85">{detailOffer.benefits}</p>
                </div>
              )}
              {detailOffer.notes && (
                <div className="rounded-2xl border border-border bg-background/60 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("detail.notes")}</p>
                  <p className="mt-2 text-sm leading-6 text-foreground/85">{detailOffer.notes}</p>
                </div>
              )}
              {detailOffer.respondedAt && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("detail.responded")}</p>
                  <p className="mt-2 text-sm text-foreground/85">{formatDate(detailOffer.respondedAt)}</p>
                </div>
              )}
              {detailOffer.declineReason && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-600">{t("detail.declineReason")}</p>
                  <p className="mt-2 text-sm leading-6 text-red-700">{detailOffer.declineReason}</p>
                </div>
              )}
              {detailOffer.counterOffer && (
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-4">
                  <div className="flex items-center gap-2">
                    <ArrowLeftRight className="h-4 w-4 text-indigo-600" />
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-700">{t("detail.counterOffer")}</p>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-indigo-900">
                    {detailOffer.counterOffer.currency} {Number(detailOffer.counterOffer.amount).toLocaleString(locale)} {detailOffer.counterOffer.period === "annually" ? t("perYear") : t("perMonth")}
                  </p>
                  {detailOffer.counterOffer.note && (
                    <p className="mt-1 text-sm leading-6 text-indigo-800/90">{detailOffer.counterOffer.note}</p>
                  )}
                </div>
              )}
              {detailOffer.events && detailOffer.events.length > 0 && (
                <div className="rounded-2xl border border-border bg-background/60 px-4 py-4">
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4 text-muted-foreground" />
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("detail.timeline")}</p>
                  </div>
                  <ol className="mt-3 space-y-3">
                    {[...detailOffer.events].reverse().map((e, idx) => (
                      <li key={`${e.type}-${e.at}-${idx}`} className="flex gap-3">
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary/60" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">
                            {t(`events.${e.type}`)}
                            {e.actorName ? <span className="font-normal text-muted-foreground"> · {e.actorName}</span> : null}
                          </p>
                          {e.note && <p className="text-xs text-muted-foreground">{e.note}</p>}
                          <p className="text-[11px] text-muted-foreground/80">{e.at ? new Date(e.at).toLocaleString(locale) : ""}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => window.open(`/api/offers/${detailOffer._id}/letter/pdf`, "_blank", "noopener")}
                >
                  <FileDown className="mr-2 h-4 w-4" />
                  {t("actions.downloadLetter")}
                </Button>
                {(detailOffer.status === "pending" || detailOffer.status === "countered") && !isExpired(detailOffer) && (
                  <Button
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => openRevise(detailOffer)}
                  >
                    {detailOffer.status === "countered"
                      ? <ArrowLeftRight className="mr-2 h-4 w-4" />
                      : <Pencil className="mr-2 h-4 w-4" />}
                    {detailOffer.status === "countered" ? t("actions.respondCounter") : t("actions.revise")}
                  </Button>
                )}
                {detailOffer.status === "pending" && !isExpired(detailOffer) && (
                  <Button
                    variant="outline"
                    className="rounded-xl"
                    disabled={remindingId === detailOffer._id}
                    onClick={() => handleRemind(detailOffer._id)}
                  >
                    <Send className="mr-2 h-4 w-4" />
                    {t("actions.remind")}
                  </Button>
                )}
                {(detailOffer.status === "pending" || detailOffer.status === "countered") && !isExpired(detailOffer) && (
                  <Button
                    variant="ghost"
                    className="rounded-xl text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => setWithdrawingId(detailOffer._id)}
                  >
                    <X className="mr-2 h-4 w-4" />
                    {t("actions.withdraw")}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Revise / respond-to-counter dialog */}
      <Dialog open={!!reviseOffer} onOpenChange={(open) => { if (!open) setReviseOffer(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {reviseOffer?.status === "countered" ? t("reviseDialog.titleCounter") : t("reviseDialog.title")}
            </DialogTitle>
            <DialogDescription>
              {reviseOffer?.status === "countered" ? t("reviseDialog.descriptionCounter") : t("reviseDialog.description")}
            </DialogDescription>
          </DialogHeader>

          {reviseOffer?.counterOffer && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
              {t("reviseDialog.candidateAsked")}:{" "}
              <span className="font-semibold">
                {reviseOffer.counterOffer.currency} {Number(reviseOffer.counterOffer.amount).toLocaleString(locale)} {reviseOffer.counterOffer.period === "annually" ? t("perYear") : t("perMonth")}
              </span>
            </div>
          )}

          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1">
                <label className="text-xs font-medium text-muted-foreground">{t("reviseDialog.currency")}</label>
                <Input value={reviseForm.currency} maxLength={3}
                  onChange={(e) => setReviseForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))} />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-muted-foreground">{t("reviseDialog.amount")}</label>
                <Input type="number" min={0} value={reviseForm.amount}
                  onChange={(e) => setReviseForm((f) => ({ ...f, amount: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t("reviseDialog.period")}</label>
              <SearchableSelect
                options={[{ value: "monthly", label: t("perMonth") }, { value: "annually", label: t("perYear") }]}
                value={reviseForm.period}
                onValueChange={(v) => setReviseForm((f) => ({ ...f, period: v }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">{t("reviseDialog.startDate")}</label>
                <DateTimePicker mode="date" value={reviseForm.startDate}
                  onChange={(v) => setReviseForm((f) => ({ ...f, startDate: v }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">{t("reviseDialog.expiresAt")}</label>
                <DateTimePicker mode="date" value={reviseForm.expiresAt}
                  onChange={(v) => setReviseForm((f) => ({ ...f, expiresAt: v }))} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t("reviseDialog.benefits")}</label>
              <Textarea rows={2} value={reviseForm.benefits}
                onChange={(e) => setReviseForm((f) => ({ ...f, benefits: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t("reviseDialog.revisionNote")}</label>
              <Textarea rows={2} placeholder={t("reviseDialog.revisionNotePlaceholder")} value={reviseForm.revisionNote}
                onChange={(e) => setReviseForm((f) => ({ ...f, revisionNote: e.target.value }))} />
            </div>
            {reviseError && <p className="text-sm text-red-600">{reviseError}</p>}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setReviseOffer(null)} disabled={revisePending}>
              {t("actions.cancel")}
            </Button>
            <Button onClick={submitRevise} disabled={revisePending}>
              {revisePending ? t("reviseDialog.saving") : t("reviseDialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
