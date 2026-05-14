export const INVOICE_STATUSES = [
  "draft",
  "pending_approval",
  "issued",
  "sent",
  "paid",
  "partially_paid",
  "overdue",
  "void",
  "cancelled",
  "refunded",
  "credit_note",
] as const;

export type InvoiceStatusValue = (typeof INVOICE_STATUSES)[number];

export type InvoiceDeliveryState = "not_sent" | "sent" | "viewed" | "downloaded";

export const INVOICE_TERMINAL_STATUSES = [
  "void",
  "cancelled",
  "refunded",
  "credit_note",
] as const;

export const ACTIVE_RECRUITMENT_INVOICE_STATUSES = [
  "draft",
  "pending_approval",
  "issued",
  "sent",
  "paid",
  "partially_paid",
  "overdue",
] as const;

export const PAYMENT_BLOCKED_INVOICE_STATUSES = [
  "draft",
  "pending_approval",
  "paid",
  "void",
  "cancelled",
  "refunded",
  "credit_note",
] as const;

export const INVOICE_UPDATE_STATUSES = [
  "draft",
  "pending_approval",
  "issued",
  "sent",
  "paid",
  "overdue",
  "void",
  "cancelled",
] as const;

export const PAYABLE_INVOICE_STATUSES = [
  "issued",
  "sent",
  "partially_paid",
  "overdue",
] as const;

export function isInvoiceStatus(status: string | null): status is InvoiceStatusValue {
  return Boolean(status && (INVOICE_STATUSES as readonly string[]).includes(status));
}

export function getInvoiceDeliveryState(invoice: {
  sentAt?: Date | string | null;
  viewedAt?: Date | string | null;
  downloadedAt?: Date | string | null;
}): InvoiceDeliveryState {
  if (invoice.downloadedAt) return "downloaded";
  if (invoice.viewedAt) return "viewed";
  if (invoice.sentAt) return "sent";
  return "not_sent";
}