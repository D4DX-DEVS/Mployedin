"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { useCurrencyPreference } from "@/hooks/useCurrencyPreference";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  RotateCcw, CalendarDays, Inbox,
  Eye, FileText, Download, Building2,
  CreditCard, CheckCircle2, Clock, AlertTriangle, Send,
  Banknote, Receipt, ExternalLink,
  MessageSquareWarning, ShieldCheck, Zap, Smartphone,
  Globe, HelpCircle, ReceiptText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { PageHero } from "@/components/shared/PageHero";
import type { ExportColumn } from "@/lib/export";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useTranslations } from "next-intl";

// ── Types ────────────────────────────────────────────────────────────────────
interface Invoice {
  _id: string;
  invoiceNumber: string;
  category: string;
  type: string;
  description?: string;
  subtotal: number;
  taxType?: string;
  taxPercent?: number;
  taxAmount: number;
  discountPercent?: number;
  discountAmount?: number;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  amount: number;
  currency: string;
  status: string;
  dueDate?: string;
  issuedAt?: string;
  jobId?: { title?: string; _id?: string };
  employerId?: { companyName?: string; _id?: string };
  billingDetails?: {
    companyName?: string;
    contactPerson?: string;
    email?: string;
    phone?: string;
    address?: string;
    country?: string;
    taxId?: string;
  };
  lineItems?: Array<{ description: string; quantity: number; unitPrice: number; amount: number }>;
  paymentTerms?: string;
  notes?: string;
  payments?: Array<{ amount: number; method: string; date: string; reference?: string }>;
  createdAt: string;
}



// ── Employer Invoice Detail ─────────────────────────────────────────────────
function EmployerInvoiceDetail({ invoice, open, onClose, onRefresh }: { invoice: Invoice | null; open: boolean; onClose: () => void; onRefresh: () => void }) {
  const t = useTranslations("employerInvoices");
  const [downloading, setDownloading] = useState(false);
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [paymentRef, setPaymentRef] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [activeTab, setActiveTab] = useState("details");
  // Pay Now gateway
  const [gatewayEnabled, setGatewayEnabled] = useState(false);
  const [gatewayLoading, setGatewayLoading] = useState(false);
  // Dispute
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeCategory, setDisputeCategory] = useState("other");
  const [disputeDesc, setDisputeDesc] = useState("");
  const [disputeLoading, setDisputeLoading] = useState(false);
  // Sender context
  const [senderContext, setSenderContext] = useState<{ name: string; role: string; label: string } | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);

  // Fetch sender context when dialog opens
  useEffect(() => {
    if (!open || !invoice) { setSenderContext(null); return; }
    fetch(`/api/invoices/${invoice._id}`)
      .then(r => r.json())
      .then(d => setSenderContext(d.senderContext ?? null))
      .catch(() => setSenderContext(null));
  }, [open, invoice]);

  // Check gateway availability when dialog opens
  useEffect(() => {
    if (!open || !invoice) return;
    fetch(`/api/invoices/${invoice._id}/pay`)
      .then(r => r.json())
      .then(d => setGatewayEnabled(d.gatewayEnabled ?? false))
      .catch(() => setGatewayEnabled(false));
  }, [open, invoice]);

  if (!invoice) return null;
  const fmt = (v: number) => `${invoice.currency} ${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const isPaid = invoice.status === "paid";
  const isOverdue = invoice.status === "overdue";
  const canPay = !isPaid && invoice.status !== "void" && invoice.status !== "draft" && invoice.status !== "pending_approval";
  const balanceDue = invoice.balanceDue ?? (invoice.totalAmount - (invoice.paidAmount ?? 0));
  const daysUntilDue = invoice.dueDate ? Math.ceil((new Date(invoice.dueDate).getTime() - Date.now()) / 86400000) : null;

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`/api/invoices/${invoice._id}/pdf`);
      if (!res.ok) throw new Error("Failed to download");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invoice.invoiceNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("toastPdfDownloaded"));
    } catch {
      toast.error(t("toastPdfFailed"));
    } finally {
      setDownloading(false);
    }
  };

  const handlePayNow = async () => {
    setGatewayLoading(true);
    try {
      const res = await fetch(`/api/invoices/${invoice._id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (res.status === 501) {
        toast.info(t("toastOnlineComingSoon"));
        setActiveTab("pay");
        return;
      }
      if (!res.ok) throw new Error(data.error || t("paymentInitiateFailed"));
      // Redirect to payment gateway checkout
      window.location.href = data.checkoutUrl;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toastPaymentFailed"));
    } finally {
      setGatewayLoading(false);
    }
  };

  const handleNotifyPayment = async () => {
    setNotifyLoading(true);
    try {
      const res = await fetch(`/api/invoices/${invoice._id}/delivery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "payment_notification",
          paymentMethod,
          referenceNumber: paymentRef,
          notes: paymentNotes,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to send notification");
      }
      toast.success(t("toastNotificationSent"));
      setPaymentRef("");
      setPaymentNotes("");
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toastNotificationFailed"));
    } finally {
      setNotifyLoading(false);
    }
  };

  const handleRaiseDispute = async () => {
    if (!disputeReason.trim()) return;
    setDisputeLoading(true);
    try {
      const res = await fetch(`/api/invoices/${invoice._id}/dispute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: disputeReason,
          category: disputeCategory,
          description: disputeDesc,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to submit query");
      }
      toast.success(t("toastQuerySubmitted"));
      setDisputeOpen(false);
      setDisputeReason("");
      setDisputeDesc("");
      setDisputeCategory("other");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toastQueryFailed"));
    } finally {
      setDisputeLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); setActiveTab("details"); setDisputeOpen(false); } }}>
      <DialogContent ref={dialogRef} className="max-h-[90vh] max-w-2xl overflow-y-auto scrollbar-none">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {t("invoiceNumber", { number: invoice.invoiceNumber })}
              </DialogTitle>
              <div className="mt-1.5 flex items-center gap-2">
                <StatusBadge status={invoice.status} />
                {invoice.issuedAt && (
                  <span className="text-xs text-muted-foreground">
                    {new Date(invoice.issuedAt).toLocaleDateString()}
                  </span>
                )}
                {isOverdue && (
                  <Badge variant="outline" className="gap-1 border-rose-300 bg-rose-50 text-rose-700 text-[10px] dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-400">
                    <AlertTriangle className="h-2.5 w-2.5" /> {t("overdueStatus")}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Quick Actions Bar */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-secondary/20 p-3">
          <Button
            variant="outline" size="sm"
            className="gap-1.5 rounded-lg"
            disabled={downloading}
            onClick={handleDownloadPdf}
          >
            <Download className="h-3.5 w-3.5" />
            {downloading ? t("downloading") : t("downloadPdf")}
          </Button>

          {canPay && balanceDue > 0 && (
            <Button
              size="sm"
              className="gap-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground"
              disabled={gatewayLoading}
              onClick={handlePayNow}
            >
              <Zap className="h-3.5 w-3.5" />
              {gatewayLoading ? t("processing") : t("payNow")}
            </Button>
          )}

          {canPay && balanceDue > 0 && (
            <Button
              variant="outline" size="sm"
              className="gap-1.5 rounded-lg border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
              onClick={() => setActiveTab("pay")}
            >
              <Send className="h-3.5 w-3.5" />
              {t("notifyPayment")}
            </Button>
          )}

          <Button
            variant="ghost" size="sm"
            className="gap-1.5 rounded-lg text-muted-foreground hover:text-foreground"
            onClick={() => { setDisputeOpen(true); setActiveTab("support"); }}
          >
            <HelpCircle className="h-3.5 w-3.5" />
            {t("billingQuery")}
          </Button>

          {isPaid && (
            <Badge variant="outline" className="ml-auto gap-1 border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400">
              <CheckCircle2 className="h-3 w-3" /> {t("fullyPaid")}
            </Badge>
          )}
        </div>

        {/* Due Date Alert */}
        {canPay && balanceDue > 0 && daysUntilDue !== null && (
          <div className={`flex items-center gap-3 rounded-xl border p-3 text-sm ${
            daysUntilDue < 0
              ? "border-rose-200 bg-rose-50/50 dark:border-rose-900/50 dark:bg-rose-950/20"
              : daysUntilDue <= 7
                ? "border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20"
                : "border-blue-200 bg-blue-50/50 dark:border-blue-900/50 dark:bg-blue-950/20"
          }`}>
            <Clock className={`h-4 w-4 shrink-0 ${
              daysUntilDue < 0 ? "text-rose-600" : daysUntilDue <= 7 ? "text-amber-600" : "text-blue-600"
            }`} />
            <span className={
              daysUntilDue < 0
                ? "text-rose-700 dark:text-rose-300"
                : daysUntilDue <= 7
                  ? "text-amber-700 dark:text-amber-300"
                  : "text-blue-700 dark:text-blue-300"
            }>
              {daysUntilDue < 0
                ? t("overdueBy", { days: Math.abs(daysUntilDue) })
                : daysUntilDue === 0
                  ? t("dueToday")
                  : t("dueIn", { days: daysUntilDue })
              } — {t("outstanding", { amount: fmt(balanceDue) })}
            </span>
          </div>
        )}

        {/* Amount Summary Cards */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-border/70 p-3 text-center">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t("summaryTotal")}</p>
            <p className="mt-0.5 text-base font-bold">{fmt(invoice.totalAmount)}</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-3 text-center dark:border-emerald-900/50 dark:bg-emerald-950/10">
            <p className="text-[10px] font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">{t("summaryPaid")}</p>
            <p className="mt-0.5 text-base font-bold text-emerald-700 dark:text-emerald-300">{fmt(invoice.paidAmount ?? 0)}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-3 text-center dark:border-amber-900/50 dark:bg-amber-950/10">
            <p className="text-[10px] font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">{t("summaryBalance")}</p>
            <p className="mt-0.5 text-base font-bold text-amber-700 dark:text-amber-300">{fmt(balanceDue)}</p>
          </div>
          <div className="rounded-xl border border-border/70 p-3 text-center">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t("summaryDue")}</p>
            <p className="mt-0.5 text-sm font-semibold">{invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : "—"}</p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3">
          <TabsList className="w-full justify-start rounded-xl bg-secondary/40">
            <TabsTrigger value="details" className="gap-1.5 rounded-lg text-xs">
              <Receipt className="h-3 w-3" /> {t("tabDetails")}
            </TabsTrigger>
            <TabsTrigger value="pay" className="gap-1.5 rounded-lg text-xs">
              <CreditCard className="h-3 w-3" /> {t("tabPayment")}
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5 rounded-lg text-xs">
              <Clock className="h-3 w-3" /> {t("tabHistory")}
            </TabsTrigger>
            <TabsTrigger value="support" className="gap-1.5 rounded-lg text-xs">
              <MessageSquareWarning className="h-3 w-3" /> {t("tabSupport")}
            </TabsTrigger>
          </TabsList>

          {/* ──── Details Tab ──── */}
          <TabsContent value="details" className="space-y-4">
            {/* Billing Details */}
            {invoice.billingDetails && (
              <div className="rounded-xl border border-border/70 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("billedTo")}</p>
                <div className="grid gap-1 text-sm">
                  {invoice.billingDetails.companyName && <p className="font-medium">{invoice.billingDetails.companyName}</p>}
                  {invoice.billingDetails.contactPerson && <p className="text-muted-foreground">{invoice.billingDetails.contactPerson}</p>}
                  {invoice.billingDetails.email && <p className="text-muted-foreground">{invoice.billingDetails.email}</p>}
                  {invoice.billingDetails.phone && <p className="text-muted-foreground">{invoice.billingDetails.phone}</p>}
                  {invoice.billingDetails.address && <p className="text-muted-foreground">{invoice.billingDetails.address}</p>}
                  {(invoice.billingDetails.country || invoice.billingDetails.taxId) && (
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {invoice.billingDetails.country && (
                        <span className="flex items-center gap-1"><Globe className="h-3 w-3" /> {invoice.billingDetails.country}</span>
                      )}
                      {invoice.billingDetails.taxId && (
                        <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> {t("taxIdLabel", { id: invoice.billingDetails.taxId })}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Issued By */}
            {senderContext && (
              <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-secondary/20 p-3">
                <ReceiptText className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("issuedBy")}</p>
                  <p className="text-sm font-medium">{senderContext.name} <span className="text-muted-foreground">— {senderContext.label}</span></p>
                </div>
              </div>
            )}

            {/* Line Items */}
            {invoice.lineItems && invoice.lineItems.length > 0 && (
              <div className="rounded-xl border border-border/70 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("items")}</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="pb-2 text-left">{t("descriptionCol")}</th>
                      <th className="pb-2 text-right">{t("qty")}</th>
                      <th className="pb-2 text-right">{t("price")}</th>
                      <th className="pb-2 text-right">{t("amount")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.lineItems.map((li, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-2">{li.description}</td>
                        <td className="py-2 text-right">{li.quantity}</td>
                        <td className="py-2 text-right">{fmt(li.unitPrice)}</td>
                        <td className="py-2 text-right font-medium">{fmt(li.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Totals */}
            <div className="rounded-xl border border-border/70 bg-secondary/10 p-4">
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">{t("subtotal")}</span><span>{fmt(invoice.subtotal)}</span></div>
                {invoice.discountAmount && invoice.discountAmount > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">{t("discount", { percent: invoice.discountPercent ?? 0 })}</span><span className="text-rose-600">-{fmt(invoice.discountAmount)}</span></div>
                )}
                {invoice.taxAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {t("tax")} {invoice.taxType ? `(${invoice.taxType.toUpperCase()}` : ""}
                      {invoice.taxPercent ? ` ${invoice.taxPercent}%` : ""}
                      {invoice.taxType ? ")" : ""}
                    </span>
                    <span>{fmt(invoice.taxAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-1.5 font-bold"><span>{t("total")}</span><span className="text-primary">{fmt(invoice.totalAmount)}</span></div>
              </div>
            </div>

            {/* Notes & Terms */}
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              {invoice.paymentTerms && (
                <div><p className="text-xs text-muted-foreground">{t("paymentTerms")}</p><p className="capitalize">{invoice.paymentTerms.replace(/_/g, " ")}</p></div>
              )}
              {invoice.jobId?.title && (
                <div><p className="text-xs text-muted-foreground">Job</p><p>{invoice.jobId.title}</p></div>
              )}
              <div><p className="text-xs text-muted-foreground">{t("currencyLabel")}</p><p>{invoice.currency}</p></div>
              <div><p className="text-xs text-muted-foreground">Category</p><p className="capitalize">{invoice.category?.replace(/_/g, " ")}</p></div>
            </div>
            {invoice.notes && (
              <div className="rounded-lg bg-muted/30 p-3 text-sm"><p className="mb-1 text-xs text-muted-foreground">{t("notes")}</p><p>{invoice.notes}</p></div>
            )}
          </TabsContent>

          {/* ──── Payment Tab ──── */}
          <TabsContent value="pay" className="space-y-4">
            {isPaid ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-6 text-center dark:border-emerald-900/50 dark:bg-emerald-950/20">
                <CheckCircle2 className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-300">{t("invoiceFullyPaid")}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{t("thankYou")}</p>
                </div>
                <Button variant="outline" size="sm" className="mt-2 gap-1.5" onClick={handleDownloadPdf}>
                  <ReceiptText className="h-3.5 w-3.5" /> {t("downloadReceipt")}
                </Button>
              </div>
            ) : !canPay ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-border/70 bg-secondary/20 p-6 text-center">
                <Clock className="h-10 w-10 text-muted-foreground" />
                <div>
                  <p className="text-base font-semibold">{t("invoiceProcessing")}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{t("processingDesc")}</p>
                </div>
              </div>
            ) : (
              <>
                {/* Pay Now Section */}
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-primary" />
                      <p className="text-sm font-semibold">{t("payOnline")}</p>
                    </div>
                    {!gatewayEnabled && (
                      <Badge variant="outline" className="text-[10px] border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                        {t("comingSoon")}
                      </Badge>
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      className="flex items-center gap-3 rounded-xl border border-border/70 bg-card p-3 text-left text-sm transition-all hover:border-primary/50 hover:shadow-sm disabled:opacity-50"
                      disabled={!gatewayEnabled}
                      onClick={handlePayNow}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-950/30">
                        <CreditCard className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                      </div>
                      <div>
                        <p className="font-medium">{t("creditDebitCard")}</p>
                        <p className="text-[11px] text-muted-foreground">{t("visaMastercard")}</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      className="flex items-center gap-3 rounded-xl border border-border/70 bg-card p-3 text-left text-sm transition-all hover:border-primary/50 hover:shadow-sm disabled:opacity-50"
                      disabled={!gatewayEnabled}
                      onClick={handlePayNow}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-100 dark:bg-green-950/30">
                        <Smartphone className="h-4 w-4 text-green-600 dark:text-green-400" />
                      </div>
                      <div>
                        <p className="font-medium">{t("upiMobile")}</p>
                        <p className="text-[11px] text-muted-foreground">{t("upiProviders")}</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      className="flex items-center gap-3 rounded-xl border border-border/70 bg-card p-3 text-left text-sm transition-all hover:border-primary/50 hover:shadow-sm disabled:opacity-50"
                      disabled={!gatewayEnabled}
                      onClick={handlePayNow}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950/30">
                        <ExternalLink className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <p className="font-medium">{t("netBanking")}</p>
                        <p className="text-[11px] text-muted-foreground">{t("allBanks")}</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      className="flex items-center gap-3 rounded-xl border border-border/70 bg-card p-3 text-left text-sm transition-all hover:border-primary/50 hover:shadow-sm disabled:opacity-50"
                      disabled={!gatewayEnabled}
                      onClick={handlePayNow}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-950/30">
                        <Banknote className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                      </div>
                      <div>
                        <p className="font-medium">{t("wallet")}</p>
                        <p className="text-[11px] text-muted-foreground">{t("walletProviders")}</p>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Manual / Bank Transfer Section */}
                <div className="rounded-xl border border-emerald-200/60 bg-emerald-50/20 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/10">
                  <div className="mb-3 flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <p className="text-sm font-semibold">{t("bankTransfer")}</p>
                  </div>
                  <p className="mb-4 text-xs text-muted-foreground">
                    {t("bankTransferDesc")}
                  </p>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="emp-pay-method" className="text-xs">{t("paymentMethod")}</Label>
                      <SearchableSelect
                        id="emp-pay-method"
                        className="mt-1 h-10 w-full rounded-xl"
                        options={[
                          { value: "bank_transfer", label: t("bankNeft") },
                          { value: "credit_card", label: t("creditDebit") },
                          { value: "upi", label: t("upi") },
                          { value: "cheque", label: t("cheque") },
                          { value: "cash", label: t("cash") },
                          { value: "wire", label: t("internationalWire") },
                          { value: "other", label: t("other") },
                        ]}
                        value={paymentMethod}
                        onValueChange={setPaymentMethod}
                        placeholder={t("selectPaymentMethod")}
                        modal
                      />
                    </div>
                    <div>
                      <Label htmlFor="emp-pay-ref" className="text-xs">{t("referenceId")}</Label>
                      <Input
                        id="emp-pay-ref"
                        className="mt-1 h-10 rounded-xl"
                        placeholder={t("referencePlaceholder")}
                        value={paymentRef}
                        onChange={e => setPaymentRef(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="emp-pay-notes" className="text-xs">{t("notesOptional")}</Label>
                      <Textarea
                        id="emp-pay-notes"
                        className="mt-1 min-h-[60px] resize-none rounded-xl"
                        placeholder={t("notesPlaceholder")}
                        value={paymentNotes}
                        onChange={e => setPaymentNotes(e.target.value)}
                      />
                    </div>
                    <Button
                      className="w-full gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
                      disabled={notifyLoading || !paymentRef.trim()}
                      onClick={handleNotifyPayment}
                    >
                      <Send className="h-4 w-4" />
                      {notifyLoading ? t("sending") : t("sendNotification")}
                    </Button>
                  </div>
                </div>

                {/* Balance reminder */}
                <div className="flex items-center justify-between rounded-xl border border-border/70 bg-secondary/10 p-3 text-sm">
                  <span className="text-muted-foreground">{t("amountToPay")}</span>
                  <span className="text-lg font-bold text-primary">{fmt(balanceDue)}</span>
                </div>
              </>
            )}
          </TabsContent>

          {/* ──── History Tab ──── */}
          <TabsContent value="history" className="space-y-4">
            {invoice.payments && invoice.payments.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("paymentRecords")}</p>
                {invoice.payments.map((p, i) => (
                  <div key={i} className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                    <div>
                      <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">{fmt(p.amount)}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.method?.replace(/_/g, " ")} {p.reference ? `· Ref: ${p.reference}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">{new Date(p.date).toLocaleDateString()}</p>
                      <CheckCircle2 className="ml-auto mt-0.5 h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-border/70 bg-secondary/10 p-8 text-center">
                <Clock className="h-8 w-8 text-muted-foreground/50" />
                <div>
                  <p className="text-sm font-medium">{t("noPayments")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {canPay ? t("noPaymentsDesc") : t("paymentWillAppear")}
                  </p>
                </div>
              </div>
            )}

            {/* Invoice timeline */}
            <div className="rounded-xl border border-border/70 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("timeline")}</p>
              <div className="relative space-y-4 pl-4 before:absolute before:left-[5px] before:top-2 before:h-[calc(100%-16px)] before:w-px before:bg-border">
                <div className="flex items-start gap-3 text-sm">
                  <div className="relative -ml-4 mt-0.5 h-3 w-3 rounded-full border-2 border-primary bg-background" />
                  <div>
                    <p className="font-medium">{t("invoiceCreated")}</p>
                    <p className="text-xs text-muted-foreground">{new Date(invoice.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
                {invoice.issuedAt && (
                  <div className="flex items-start gap-3 text-sm">
                    <div className="relative -ml-4 mt-0.5 h-3 w-3 rounded-full border-2 border-blue-500 bg-background" />
                    <div>
                      <p className="font-medium">{t("issuedEvent")}</p>
                      <p className="text-xs text-muted-foreground">{new Date(invoice.issuedAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                )}
                {invoice.payments && invoice.payments.length > 0 && invoice.payments.map((p, i) => (
                  <div key={i} className="flex items-start gap-3 text-sm">
                    <div className="relative -ml-4 mt-0.5 h-3 w-3 rounded-full border-2 border-emerald-500 bg-background" />
                    <div>
                      <p className="font-medium text-emerald-700 dark:text-emerald-300">{t("paymentOf", { amount: fmt(p.amount) })}</p>
                      <p className="text-xs text-muted-foreground">{new Date(p.date).toLocaleDateString()} · {p.method?.replace(/_/g, " ")}</p>
                    </div>
                  </div>
                ))}
                {isPaid && (
                  <div className="flex items-start gap-3 text-sm">
                    <div className="relative -ml-4 mt-0.5 h-3 w-3 rounded-full border-2 border-emerald-600 bg-emerald-600" />
                    <p className="font-semibold text-emerald-700 dark:text-emerald-300">{t("fullyPaidEvent")}</p>
                  </div>
                )}
                {isOverdue && (
                  <div className="flex items-start gap-3 text-sm">
                    <div className="relative -ml-4 mt-0.5 h-3 w-3 rounded-full border-2 border-rose-500 bg-rose-500" />
                    <p className="font-semibold text-rose-700 dark:text-rose-300">{t("overdueEvent")}</p>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ──── Support Tab ──── */}
          <TabsContent value="support" className="space-y-4">
            {/* Raise Billing Query */}
            <div className="rounded-xl border border-border/70 p-4">
              <div className="mb-3 flex items-center gap-2">
                <MessageSquareWarning className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">{t("raiseBillingQuery")}</p>
              </div>
              <p className="mb-4 text-xs text-muted-foreground">
                {t("billingQueryDesc")}
              </p>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="dispute-category" className="text-xs">{t("issueCategory")}</Label>
                  <SearchableSelect
                    id="dispute-category"
                    className="mt-1 h-10 w-full rounded-xl"
                    options={[
                      { value: "wrong_amount", label: t("wrongAmount") },
                      { value: "tax_issue", label: t("taxGst") },
                      { value: "duplicate", label: t("duplicateInvoice") },
                      { value: "refund_request", label: t("refundRequest") },
                      { value: "other", label: t("otherIssue") },
                    ]}
                    value={disputeCategory}
                    onValueChange={setDisputeCategory}
                    placeholder={t("selectIssueCategory")}
                    modal
                  />
                </div>
                <div>
                  <Label htmlFor="dispute-reason" className="text-xs">{t("subject")}</Label>
                  <Input
                    id="dispute-reason"
                    className="mt-1 h-10 rounded-xl"
                    placeholder={t("subjectPlaceholder")}
                    value={disputeReason}
                    onChange={e => setDisputeReason(e.target.value)}
                    maxLength={200}
                  />
                </div>
                <div>
                  <Label htmlFor="dispute-desc" className="text-xs">{t("detailsOptional")}</Label>
                  <Textarea
                    id="dispute-desc"
                    className="mt-1 min-h-[80px] resize-none rounded-xl"
                    placeholder={t("detailsPlaceholder")}
                    value={disputeDesc}
                    onChange={e => setDisputeDesc(e.target.value)}
                    maxLength={1000}
                  />
                </div>
                <Button
                  className="w-full gap-2 rounded-xl"
                  variant="outline"
                  disabled={disputeLoading || !disputeReason.trim()}
                  onClick={handleRaiseDispute}
                >
                  <MessageSquareWarning className="h-4 w-4" />
                  {disputeLoading ? t("submitting") : t("submitBillingQuery")}
                </Button>
              </div>
            </div>

            {/* Contact Finance */}
            <div className="rounded-xl border border-border/70 bg-secondary/10 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("needHelp")}</p>
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  {t("helpDesc")}
                </p>
                <div className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">{t("helpEmail")}</span>
                  <span className="text-xs text-muted-foreground">{t("responseTime")}</span>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function EmployerInvoicesPage() {
  const t = useTranslations("employerInvoices");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const { displayCurrency } = useCurrencyPreference();
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  const [summary, setSummary] = useState({ issued: 0, paid: 0, partially_paid: 0, overdue: 0, totalAmount: 0, totalPaid: 0, totalBalance: 0 });

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
      if (data.summary) setSummary(prev => ({ ...prev, ...data.summary }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("toastLoadFailed");
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, dateFrom, dateTo, page, limit, updateTotal]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);
  useEffect(() => { document.title = t("pageTitle"); }, [t]);

  const hasActiveFilters = Boolean(statusFilter || dateFrom || dateTo);
  const fmt = (v: number) => `${displayCurrency} ${v.toLocaleString()}`;

  const exportColumns: ExportColumn<Invoice>[] = [
    { header: t("invoiceHash"), key: "invoiceNumber" },
    { header: t("job"), key: "jobId" as keyof Invoice, formatter: (_v, r) => (r as unknown as Invoice).jobId?.title ?? "—" },
    { header: t("categoryCol"), key: "category" },
    { header: t("total"), key: "totalAmount", formatter: v => String(v ?? 0) },
    { header: t("paid"), key: "paidAmount", formatter: v => String(v ?? 0) },
    { header: t("balance"), key: "balanceDue", formatter: v => String(v ?? 0) },
    { header: t("status"), key: "status" },
    { header: t("dueDate"), key: "dueDate" as keyof Invoice, formatter: v => v ? new Date(String(v)).toLocaleDateString() : "—" },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: invoices as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "my-invoices",
    title: t("exportTitle"),
  });

  return (
    <div className="page-container employer-legacy-surface space-y-6">
      <PageHero
        title={t("title")}
        description={t("description")}
        eyebrow={t("employerBilling")}
        icon={Building2}
        actions={
          <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("employerBilling")}</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{t("invoiceCount", { count: total })}</p>
          </div>
        }
      />
      <TableToolbar
        search="" onSearchChange={() => {}} searchPlaceholder={t("searchPlaceholder")}
        onExportCsv={handleExportCsv} onExportExcel={handleExportExcel} onExportPdf={handleExportPdf}
        filterContent={
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <SearchableSelect id="emp-inv-status" className="h-11 w-full rounded-xl border-border bg-card" options={[{ value: "all", label: t("allStatuses") }, { value: "issued", label: t("issued") }, { value: "sent", label: t("sent") }, { value: "paid", label: t("paidStatus") }, { value: "partially_paid", label: t("partiallyPaid") }, { value: "overdue", label: t("overdueStatus") }]} value={statusFilter || "all"} onValueChange={v => { setStatusFilter(v === "all" ? "" : v); resetPage(); }} placeholder={t("allStatuses")} />
              <div className="flex items-center gap-2 xl:col-span-2">
                <div className="relative flex-1"><CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input type="date" className="h-11 rounded-xl border-border bg-card pl-9 text-sm" value={dateFrom} onChange={e => { setDateFrom(e.target.value); resetPage(); }} /></div>
                <span className="text-xs text-muted-foreground">to</span>
                <div className="relative flex-1"><Input type="date" className="h-11 rounded-xl border-border bg-card text-sm" value={dateTo} onChange={e => { setDateTo(e.target.value); resetPage(); }} /></div>
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={() => { setStatusFilter(""); setDateFrom(""); setDateTo(""); resetPage(); }} disabled={!hasActiveFilters} className="h-11 rounded-xl">
                <RotateCcw className="mr-2 h-4 w-4" /> {t("clear")}
              </Button>
            </div>
          </div>
        }
        hasActiveFilters={hasActiveFilters}
      />

      {/* Summary Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border/70 bg-card p-4">
          <p className="text-xs text-muted-foreground">{t("totalBilled")}</p>
          <p className="mt-1 text-xl font-bold">{fmt(summary.totalAmount)}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
          <p className="text-xs text-emerald-600 dark:text-emerald-400">{t("totalPaid")}</p>
          <p className="mt-1 text-xl font-bold text-emerald-700 dark:text-emerald-300">{fmt(summary.totalPaid)}</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
          <p className="text-xs text-amber-600 dark:text-amber-400">{t("outstandingBalance")}</p>
          <p className="mt-1 text-xl font-bold text-amber-700 dark:text-amber-300">{fmt(summary.totalBalance)}</p>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4 dark:border-rose-900/50 dark:bg-rose-950/20">
          <p className="text-xs text-rose-600 dark:text-rose-400">{t("overdue")}</p>
          <p className="mt-1 text-xl font-bold text-rose-700 dark:text-rose-300">{summary.overdue}</p>
        </div>
      </div>

      {/* Invoice Table */}
      {errorMessage && <div className="rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">{errorMessage}</div>}

      <section className="workspace-panel-surface overflow-hidden rounded-[24px]">
        <div className="flex flex-col gap-2 border-b border-border/80 px-4 py-4 sm:px-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("billingHistory")}</p>
          <h3 className="text-lg font-semibold text-foreground">{t("yourInvoices")}</h3>
        </div>
        {/* Mobile card list (<sm) — 9-column table doesn't fit a phone */}
        <div className="space-y-3 p-4 sm:hidden">
          {loading ? Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3 rounded-xl border border-border/70 bg-card p-4">
              {Array.from({ length: 3 }).map((_, j) => <div key={j} className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />)}
            </div>
          )) : invoices.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="workspace-muted-pill rounded-[20px] p-3"><Inbox className="h-6 w-6" /></div>
              <div><p className="text-sm font-semibold">{t("noInvoices")}</p><p className="mt-1 text-sm text-muted-foreground">{t("noInvoicesDesc")}</p></div>
            </div>
          ) : invoices.map((inv) => (
            <button
              key={inv._id}
              type="button"
              onClick={() => setSelectedInvoice(inv)}
              className="w-full space-y-2 rounded-xl border border-border/70 bg-card p-4 text-start active:bg-secondary/30"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-sm font-medium">{inv.invoiceNumber}</p>
                <StatusBadge status={inv.status} />
              </div>
              {inv.jobId?.title && <p className="truncate text-sm text-muted-foreground">{inv.jobId.title}</p>}
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-semibold">{inv.currency} {(inv.totalAmount ?? 0).toLocaleString()}</span>
                {(inv.balanceDue ?? 0) > 0 && (
                  <span className="text-amber-600 dark:text-amber-400">{t("balance")}: {inv.currency} {(inv.balanceDue ?? 0).toLocaleString()}</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{t("dueDate")}: {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "—"}</p>
            </button>
          ))}
        </div>
        <div className="hidden overflow-x-auto sm:block">
          <Table>
            <TableHeader>
              <TableRow className="border-border/80 bg-secondary/72 hover:bg-secondary/72">
                <TableHead>{t("invoiceHash")}</TableHead>
                <TableHead>{t("job")}</TableHead>
                <TableHead>{t("categoryCol")}</TableHead>
                <TableHead className="text-right">{t("total")}</TableHead>
                <TableHead className="text-right">{t("paid")}</TableHead>
                <TableHead className="text-right">{t("balance")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead>{t("dueDate")}</TableHead>
                <TableHead className="text-right">{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="border-border/70 hover:bg-transparent">
                  {Array.from({ length: 9 }).map((_, j) => <TableCell key={j}><div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" /></TableCell>)}
                </TableRow>
              )) : invoices.length === 0 ? (
                <TableRow className="border-border/70 hover:bg-transparent">
                  <TableCell colSpan={9} className="px-6 py-14 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="workspace-muted-pill rounded-[20px] p-3"><Inbox className="h-6 w-6" /></div>
                      <div><p className="text-sm font-semibold">{t("noInvoices")}</p><p className="mt-1 text-sm text-muted-foreground">{t("noInvoicesDesc")}</p></div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : invoices.map((inv) => (
                <TableRow key={inv._id} className="border-border/70 cursor-pointer hover:bg-secondary/30" onClick={() => setSelectedInvoice(inv)}>
                  <TableCell><p className="font-mono text-sm font-medium">{inv.invoiceNumber}</p></TableCell>
                  <TableCell><p className="max-w-[160px] truncate text-sm">{inv.jobId?.title ?? "—"}</p></TableCell>
                  <TableCell><span className="text-[10px] capitalize text-muted-foreground">{inv.category?.replace(/_/g, " ")}</span></TableCell>
                  <TableCell className="text-right font-semibold">{inv.currency} {(inv.totalAmount ?? 0).toLocaleString()}</TableCell>
                  <TableCell className="text-right text-sm text-emerald-600 dark:text-emerald-400">{inv.currency} {(inv.paidAmount ?? 0).toLocaleString()}</TableCell>
                  <TableCell className="text-right text-sm text-amber-600 dark:text-amber-400">{inv.currency} {(inv.balanceDue ?? 0).toLocaleString()}</TableCell>
                  <TableCell><StatusBadge status={inv.status} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "—"}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedInvoice(inv)} className="h-7 w-7 p-0" title={t("view")} aria-label={t("view")}><Eye className="h-3.5 w-3.5" /></Button>
                      <Button
                        variant="ghost" size="sm" className="h-7 w-7 p-0" title={t("downloadPdf")} aria-label={t("downloadPdf")}
                        onClick={async () => {
                          try {
                            const res = await fetch(`/api/invoices/${inv._id}/pdf`);
                            if (!res.ok) throw new Error();
                            const blob = await res.blob();
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a"); a.href = url; a.download = `${inv.invoiceNumber}.pdf`; a.click();
                            URL.revokeObjectURL(url);
                            toast.success(t("toastPdfDownloaded"));
                          } catch { toast.error(t("toastPdfFailed")); }
                        }}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
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

      {/* Invoice Detail */}
      <EmployerInvoiceDetail
        invoice={selectedInvoice}
        open={!!selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
        onRefresh={fetchInvoices}
      />
    </div>
  );
}
