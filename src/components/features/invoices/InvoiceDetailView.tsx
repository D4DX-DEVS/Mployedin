"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { csrfFetch } from "@/lib/security/csrf-client";
import { getInvoiceDeliveryState, type InvoiceDeliveryState } from "@/lib/invoices/status";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Building2, FileText, CreditCard, Coins, History, AlertTriangle,
  CheckCircle2, XCircle, Send, Loader2, Download, Eye, BellRing, UserCircle2,
} from "lucide-react";

interface InvoiceCommission {
  role: string;
  rate: number;
  amount: number;
  status: string;
  notes?: string;
}

interface Payment {
  _id?: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  referenceNumber?: string;
  notes?: string;
  recordedBy?: { name?: string; email?: string };
  createdAt?: string;
}

interface InvoiceData {
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
  currency: string;
  status: string;
  paymentTerms: string;
  dueDate?: string;
  issuedAt?: string;
  sentAt?: string;
  viewedAt?: string;
  downloadedAt?: string;
  reminderCount?: number;
  lastReminderAt?: string;
  approvedAt?: string;
  paidAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  notes?: string;
  internalNotes?: string;
  billingDetails?: {
    companyName?: string;
    contactPerson?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
    taxId?: string;
  };
  lineItems: Array<{ description: string; quantity: number; unitPrice: number; amount: number }>;
  commissions: InvoiceCommission[];
  platformRevenue: number;
  payments: Payment[];
  employerId?: { companyName?: string; _id?: string };
  jobId?: { title?: string; _id?: string };
  agentId?: { _id?: string };
  voidReason?: string;
  creditNoteNumber?: string;
  createdAt: string;
}

interface InvoiceDetailViewProps {
  invoiceId: string | null;
  open: boolean;
  onClose: () => void;
  onRefresh: () => void;
  role: "admin" | "super_agent" | "agent";
}

const PAYMENT_METHODS = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "credit_card", label: "Credit Card" },
  { value: "online", label: "Online" },
  { value: "other", label: "Other" },
];

const DELIVERY_STATE_LABELS: Record<InvoiceDeliveryState, string> = {
  not_sent: "Not sent",
  sent: "Sent",
  viewed: "Viewed",
  downloaded: "Downloaded",
};

const DELIVERY_STATE_STYLES: Record<InvoiceDeliveryState, string> = {
  not_sent: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-300",
  sent: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300",
  viewed: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/50 dark:bg-violet-950/30 dark:text-violet-300",
  downloaded: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300",
};

function fmtDateTime(value?: string) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function InvoiceDetailView({ invoiceId, open, onClose, onRefresh, role }: InvoiceDetailViewProps) {
  const t = useTranslations("invoiceDetailView");
  const tCommon = useTranslations("common");
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [senderContext, setSenderContext] = useState<{ name: string; role: string; label: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"details" | "payments" | "commissions" | "history">("details");

  // Payment form
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [paymentRef, setPaymentRef] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [recordingPayment, setRecordingPayment] = useState(false);

  // Hydrate payment date on mount
  useEffect(() => {
    setPaymentDate(new Date().toISOString().split("T")[0]);
  }, []);

  // Status update
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  const fetchInvoice = useCallback(async () => {
    if (!invoiceId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`);
      if (!res.ok) throw new Error("Failed to load invoice");
      const data = await res.json();
      setInvoice(data.invoice);
      setSenderContext(data.senderContext ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load invoice");
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    if (open && invoiceId) { fetchInvoice(); setActiveTab("details"); }
  }, [open, invoiceId, fetchInvoice]);

  const handleStatusUpdate = async (newStatus: string, extraPayload?: Record<string, string | undefined>) => {
    if (!invoice) return;
    setUpdatingStatus(true);
    try {
      const res = await csrfFetch(`/api/invoices/${invoice._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, ...extraPayload }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed"); }
      toast.success(`Invoice ${newStatus}`);
      setShowRejectForm(false);
      setRejectionReason("");
      await fetchInvoice();
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleRejectInvoice = async () => {
    if (invoice?.status !== "pending_approval") {
      toast.error("Only pending invoices can be rejected");
      return;
    }
    const trimmedReason = rejectionReason.trim();
    await handleStatusUpdate("cancelled", {
      rejectionReason: trimmedReason || undefined,
      voidReason: trimmedReason || undefined,
    });
  };

  const handleRecordPayment = async () => {
    if (!invoice || !paymentAmount) return;
    setRecordingPayment(true);
    try {
      const res = await csrfFetch(`/api/invoices/${invoice._id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(paymentAmount),
          paymentDate,
          paymentMethod,
          referenceNumber: paymentRef || undefined,
          notes: paymentNotes || undefined,
        }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed"); }
      const data = await res.json();
      toast.success(data.message ?? "Payment recorded");
      setShowPaymentForm(false);
      setPaymentAmount(""); setPaymentRef(""); setPaymentNotes("");
      await fetchInvoice();
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setRecordingPayment(false);
    }
  };

  const fmt = (v: number | undefined | null) => `${invoice?.currency ?? "AED"} ${(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const canManage = role === "admin" || role === "super_agent";
  const deliveryState = invoice ? getInvoiceDeliveryState(invoice) : "not_sent";
  const canRecordReminder = Boolean(invoice?.sentAt && invoice && ["sent", "partially_paid", "overdue"].includes(invoice.status));

  const handleDeliveryAction = async (action: "sent" | "reminder") => {
    if (!invoice) return;
    setUpdatingStatus(true);
    try {
      const res = await csrfFetch(`/api/invoices/${invoice._id}/delivery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed"); }
      toast.success(action === "sent" ? "Invoice marked sent" : "Reminder recorded");
      await fetchInvoice();
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setUpdatingStatus(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border/80 px-6 py-4">
          <DialogTitle className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-primary" />
            {invoice ? `Invoice ${invoice.invoiceNumber}` : t("invoiceDetails")}
          </DialogTitle>
          {invoice && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={invoice.status} />
              <span className="text-xs text-muted-foreground">{invoice.category}</span>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="text-xs text-muted-foreground">{invoice.issuedAt ? new Date(invoice.issuedAt).toLocaleDateString() : "Not issued yet"}</span>
            </div>
          )}
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : invoice ? (
          <>
            {/* Tabs */}
            <div className="flex border-b border-border/80 px-6">
              {(["details", "payments", "commissions"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`border-b-2 px-4 py-2.5 text-sm font-medium capitalize transition-colors ${
                    activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="max-h-[55vh] overflow-y-auto px-6 py-5">
              {/* Details Tab */}
              {activeTab === "details" && (
                <div className="space-y-5">
                  {/* KPI Row */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-xl border border-border/70 bg-secondary/30 p-3">
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">{t("total")}</p>
                      <p className="mt-1 text-lg font-bold text-primary">{fmt(invoice.totalAmount)}</p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-secondary/30 p-3">
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">{t("paid")}</p>
                      <p className="mt-1 text-lg font-bold text-emerald-600">{fmt(invoice.paidAmount)}</p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-secondary/30 p-3">
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">{t("balanceDue")}</p>
                      <p className="mt-1 text-lg font-bold text-amber-600">{fmt(invoice.balanceDue)}</p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-secondary/30 p-3">
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">{t("platformRevenue")}</p>
                      <p className="mt-1 text-lg font-bold">{fmt(invoice.platformRevenue)}</p>
                    </div>
                  </div>

                  {/* Issued By */}
                  {senderContext && (
                    <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-secondary/20 p-3">
                      <UserCircle2 className="h-5 w-5 text-primary" />
                      <div>
                        <p className="text-xs font-semibold uppercase text-muted-foreground">{t("issuedBy")}</p>
                        <p className="text-sm font-medium">{senderContext.name} <span className="text-muted-foreground">— {senderContext.label}</span></p>
                      </div>
                    </div>
                  )}

                  {/* Billing Info */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-border/70 p-4">
                      <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-muted-foreground" /><p className="text-xs font-semibold uppercase text-muted-foreground">{t("billTo")}</p></div>
                      <div className="mt-2 space-y-0.5 text-sm">
                        <p className="font-medium">{invoice.billingDetails?.companyName || invoice.employerId?.companyName || "—"}</p>
                        <p className="text-muted-foreground">{invoice.billingDetails?.contactPerson}</p>
                        <p className="text-muted-foreground">{invoice.billingDetails?.email}</p>
                        <p className="text-muted-foreground">{invoice.billingDetails?.phone}</p>
                        <p className="text-muted-foreground">{invoice.billingDetails?.address}</p>
                        {invoice.billingDetails?.taxId && <p className="text-muted-foreground">Tax ID: {invoice.billingDetails.taxId}</p>}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border/70 p-4">
                      <div className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-muted-foreground" /><p className="text-xs font-semibold uppercase text-muted-foreground">{t("invoiceDetailsLabel")}</p></div>
                      <div className="mt-2 space-y-0.5 text-sm">
                        <p>{t("job")}: <span className="font-medium">{invoice.jobId?.title || "—"}</span></p>
                        <p>{t("terms")}: <span className="font-medium">{invoice.paymentTerms?.replace(/_/g, " ")}</span></p>
                        {invoice.dueDate && <p>{t("dueDate")}: <span className="font-medium">{new Date(invoice.dueDate).toLocaleDateString()}</span></p>}
                        {invoice.approvedAt && <p>{t("approved")}: <span className="font-medium">{new Date(invoice.approvedAt).toLocaleDateString()}</span></p>}
                        {invoice.rejectedAt && <p>{t("rejected")}: <span className="font-medium">{new Date(invoice.rejectedAt).toLocaleDateString()}</span></p>}
                        <p>{t("tax")}: <span className="font-medium">{invoice.taxType && invoice.taxType !== "none" ? `${invoice.taxType.toUpperCase()} ${invoice.taxPercent}%` : t("none")}</span></p>
                        {invoice.rejectionReason && <p className="text-rose-600 dark:text-rose-300">{t("reason")}: {invoice.rejectionReason}</p>}
                        {invoice.description && <p className="text-muted-foreground">{invoice.description}</p>}
                      </div>
                    </div>
                  </div>

                  {/* Delivery */}
                  <div className="rounded-xl border border-border/70 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2"><Send className="h-4 w-4 text-muted-foreground" /><p className="text-xs font-semibold uppercase text-muted-foreground">{t("delivery")}</p></div>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${DELIVERY_STATE_STYLES[deliveryState]}`}>
                        {DELIVERY_STATE_LABELS[deliveryState]}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-4">
                      <div className="rounded-lg bg-secondary/30 p-3">
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-muted-foreground"><Send className="h-3.5 w-3.5" /> {t("sent")}</div>
                        <p className="mt-1 text-xs font-medium">{fmtDateTime(invoice.sentAt)}</p>
                      </div>
                      <div className="rounded-lg bg-secondary/30 p-3">
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-muted-foreground"><Eye className="h-3.5 w-3.5" /> {t("viewed")}</div>
                        <p className="mt-1 text-xs font-medium">{fmtDateTime(invoice.viewedAt)}</p>
                      </div>
                      <div className="rounded-lg bg-secondary/30 p-3">
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-muted-foreground"><Download className="h-3.5 w-3.5" /> {t("downloaded")}</div>
                        <p className="mt-1 text-xs font-medium">{fmtDateTime(invoice.downloadedAt)}</p>
                      </div>
                      <div className="rounded-lg bg-secondary/30 p-3">
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-muted-foreground"><BellRing className="h-3.5 w-3.5" /> {t("reminders")}</div>
                        <p className="mt-1 text-xs font-medium">{invoice.reminderCount ?? 0}{invoice.lastReminderAt ? ` · ${fmtDateTime(invoice.lastReminderAt)}` : ""}</p>
                      </div>
                    </div>
                  </div>

                  {/* Line Items */}
                  {invoice.lineItems?.length > 0 && (
                    <div className="overflow-hidden rounded-xl border border-border/70">
                      <table className="w-full text-sm">
                        <thead><tr className="bg-muted/50"><th className="px-4 py-2 text-left text-xs font-semibold">{t("description")}</th><th className="px-4 py-2 text-right text-xs font-semibold">{t("quantity")}</th><th className="px-4 py-2 text-right text-xs font-semibold">{t("unitPrice")}</th><th className="px-4 py-2 text-right text-xs font-semibold">{t("amount")}</th></tr></thead>
                        <tbody>
                          {invoice.lineItems.map((li, i) => (
                            <tr key={i} className="border-t border-border/50"><td className="px-4 py-2">{li.description}</td><td className="px-4 py-2 text-right">{li.quantity}</td><td className="px-4 py-2 text-right">{fmt(li.unitPrice)}</td><td className="px-4 py-2 text-right font-medium">{fmt(li.amount)}</td></tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="border-t border-border/70 bg-muted/30 px-4 py-2.5">
                        <div className="ml-auto max-w-xs space-y-0.5 text-sm">
                          <div className="flex justify-between"><span>{t("subtotal")}</span><span>{fmt(invoice.subtotal)}</span></div>
                          {invoice.discountPercent > 0 && <div className="flex justify-between text-emerald-600"><span>{t("discountLabel", { percent: invoice.discountPercent })}</span><span>-{fmt(invoice.discountAmount)}</span></div>}
                          {invoice.serviceCharge > 0 && <div className="flex justify-between"><span>{t("serviceCharge")}</span><span>{fmt(invoice.serviceCharge)}</span></div>}
                          {invoice.taxAmount > 0 && <div className="flex justify-between"><span>{t("taxLabel", { type: invoice.taxType?.toUpperCase(), percent: invoice.taxPercent })}</span><span>{fmt(invoice.taxAmount)}</span></div>}
                          <div className="border-t border-border/50 pt-0.5" />
                          <div className="flex justify-between font-bold"><span>{t("total")}</span><span>{fmt(invoice.totalAmount)}</span></div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {(invoice.notes || invoice.internalNotes) && (
                    <div className="space-y-2">
                      {invoice.notes && <div className="rounded-lg bg-muted/30 p-3 text-sm"><p className="font-semibold text-xs text-muted-foreground">{t("notes")}</p><p className="mt-1">{invoice.notes}</p></div>}
                      {invoice.internalNotes && canManage && <div className="rounded-lg bg-amber-50/50 p-3 text-sm dark:bg-amber-950/20"><p className="font-semibold text-xs text-amber-700 dark:text-amber-300">{t("internalNotes")}</p><p className="mt-1">{invoice.internalNotes}</p></div>}
                    </div>
                  )}
                </div>
              )}

              {/* Payments Tab */}
              {activeTab === "payments" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold">{t("paymentHistory")}</h4>
                    {canManage && !["draft", "pending_approval", "void", "cancelled", "refunded", "paid", "credit_note"].includes(invoice.status) && (
                      <Button size="sm" onClick={() => setShowPaymentForm(!showPaymentForm)} className="h-8 gap-1.5 rounded-lg bg-sky-600 text-xs hover:bg-sky-700">
                        <CreditCard className="h-3.5 w-3.5" /> {t("recordPayment")}
                      </Button>
                    )}
                  </div>

                  {/* Payment form */}
                  {showPaymentForm && (
                    <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-4 dark:border-sky-900/40 dark:bg-sky-950/20">
                      <p className="mb-3 text-xs font-semibold text-sky-700 dark:text-sky-300">{t("recordNewPayment", { balance: fmt(invoice.balanceDue) })}</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div><Label className="text-xs">{t("amount")} *</Label><Input type="number" min={0.01} max={invoice.balanceDue} step="0.01" className="mt-1 h-9 rounded-lg" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} /></div>
                        <div><Label className="text-xs">{t("date")}</Label><DateTimePicker mode="date" value={paymentDate} onChange={setPaymentDate} /></div>
                        <div><Label className="text-xs">{t("method")}</Label><SearchableSelect id="pay-method" className="mt-1 h-9 w-full rounded-lg border-border bg-card" options={PAYMENT_METHODS} value={paymentMethod} onValueChange={setPaymentMethod} /></div>
                        <div><Label className="text-xs">{t("referenceNumber")}</Label><Input className="mt-1 h-9 rounded-lg" value={paymentRef} onChange={e => setPaymentRef(e.target.value)} /></div>
                      </div>
                      <div className="mt-2"><Label className="text-xs">{t("notes")}</Label><Textarea className="mt-1 rounded-lg" rows={2} value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} /></div>
                      <div className="mt-3 flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setShowPaymentForm(false)} className="h-8 rounded-lg">{tCommon("cancel")}</Button>
                        <Button size="sm" onClick={handleRecordPayment} disabled={recordingPayment || !paymentAmount} className="h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700">
                          {recordingPayment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("record")}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Payment list */}
                  {invoice.payments?.length > 0 ? (
                    <div className="space-y-2">
                      {invoice.payments.map((p, i) => (
                        <div key={p._id || i} className="flex items-center justify-between rounded-lg border border-border/70 bg-secondary/20 p-3">
                          <div>
                            <p className="text-sm font-medium">{fmt(p.amount)}</p>
                            <p className="text-xs text-muted-foreground">{p.paymentMethod?.replace(/_/g, " ")} {p.referenceNumber ? `• ${p.referenceNumber}` : ""}</p>
                            {p.recordedBy && <p className="text-xs text-muted-foreground">By: {p.recordedBy.name || p.recordedBy.email}</p>}
                          </div>
                          <p className="text-xs text-muted-foreground">{new Date(p.paymentDate).toLocaleDateString()}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-8 text-center text-sm text-muted-foreground">{t("noPaymentsRecorded")}</div>
                  )}
                </div>
              )}

              {/* Commissions Tab */}
              {activeTab === "commissions" && (
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold">{t("commissionBreakdown")}</h4>
                  {invoice.commissions?.length > 0 ? (
                    <div className="space-y-2">
                      {invoice.commissions.map((c, i) => (
                        <div key={i} className="flex items-center justify-between rounded-lg border border-border/70 bg-secondary/20 p-3">
                          <div>
                            <p className="text-sm font-medium capitalize">{c.role?.replace(/_/g, " ")} — {c.rate}%</p>
                            <p className="text-xs text-muted-foreground">{c.notes}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold">{fmt(c.amount)}</p>
                            <StatusBadge status={c.status} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-8 text-center text-sm text-muted-foreground">{t("noCommissionsOnInvoice")}</div>
                  )}
                  <div className="rounded-xl border border-border/70 bg-secondary/30 p-4">
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">{t("totalCommissions")}</span><span className="font-medium">{fmt(invoice.commissions?.reduce((s, c) => s + c.amount, 0) ?? 0)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">{t("platformRevenue")}</span><span className="font-bold text-emerald-600">{fmt(invoice.platformRevenue)}</span></div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            {canManage && (
              <div className="space-y-3 border-t border-border/80 px-6 py-3">
                {invoice.status === "pending_approval" && showRejectForm && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3 dark:border-rose-900/50 dark:bg-rose-950/20">
                    <Label className="text-xs text-rose-700 dark:text-rose-300">{t("rejectionReason")}</Label>
                    <Textarea className="mt-1 rounded-lg" rows={2} value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} placeholder={t("rejectionReasonPlaceholder")} />
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                  {invoice.status === "pending_approval" && (
                    <>
                      <Button size="sm" onClick={() => handleStatusUpdate("issued")} disabled={updatingStatus} className="h-8 gap-1.5 rounded-lg bg-sky-600 text-xs hover:bg-sky-700">
                        <CheckCircle2 className="h-3.5 w-3.5" /> {t("approveAndIssue")}
                      </Button>
                      {showRejectForm ? (
                        <Button size="sm" variant="outline" onClick={handleRejectInvoice} disabled={updatingStatus} className="h-8 gap-1.5 rounded-lg text-xs text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30">
                          <XCircle className="h-3.5 w-3.5" /> {t("confirmReject")}
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setShowRejectForm(true)} disabled={updatingStatus} className="h-8 gap-1.5 rounded-lg text-xs text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30">
                          <XCircle className="h-3.5 w-3.5" /> {t("reject")}
                        </Button>
                      )}
                    </>
                  )}
                  {invoice.status === "draft" && (
                    <Button size="sm" onClick={() => handleStatusUpdate("issued")} disabled={updatingStatus} className="h-8 gap-1.5 rounded-lg bg-sky-600 text-xs hover:bg-sky-700">
                      <Send className="h-3.5 w-3.5" /> {t("issueInvoice")}
                    </Button>
                  )}
                  {invoice.status === "issued" && (
                    <Button size="sm" variant="outline" onClick={() => handleDeliveryAction("sent")} disabled={updatingStatus} className="h-8 gap-1.5 rounded-lg text-xs">
                      <Send className="h-3.5 w-3.5" /> {t("markSent")}
                    </Button>
                  )}
                  {canRecordReminder && (
                    <Button size="sm" variant="outline" onClick={() => handleDeliveryAction("reminder")} disabled={updatingStatus} className="h-8 gap-1.5 rounded-lg text-xs">
                      <BellRing className="h-3.5 w-3.5" /> {t("recordReminder")}
                    </Button>
                  )}
                  {["issued", "sent"].includes(invoice.status) && (
                    <Button size="sm" onClick={() => handleStatusUpdate("paid")} disabled={updatingStatus} className="h-8 gap-1.5 rounded-lg bg-emerald-600 text-xs hover:bg-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" /> {t("markPaid")}
                    </Button>
                  )}
                  {!["pending_approval", "void", "cancelled", "refunded", "paid", "credit_note"].includes(invoice.status) && (
                    <Button size="sm" variant="outline" onClick={() => handleStatusUpdate("void")} disabled={updatingStatus} className="h-8 gap-1.5 rounded-lg text-xs text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30">
                      <XCircle className="h-3.5 w-3.5" /> {t("void")}
                    </Button>
                  )}
                  </div>
                  <Button variant="outline" size="sm" onClick={onClose} className="h-8 rounded-lg text-xs">{tCommon("close")}</Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="py-20 text-center text-sm text-muted-foreground">{t("invoiceNotFound")}</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
