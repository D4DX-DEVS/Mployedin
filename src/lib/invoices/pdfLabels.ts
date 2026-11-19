import type { InvoiceFactKey, InvoicePaymentState, TotalRow } from "./presentation";

/**
 * Customer-facing wording for the invoice PDF. Kept apart from the drawing
 * code so the document never prints raw enum values ("recruitment",
 * "monthly", "SENT") at the person paying it.
 */

export type Rgb = [number, number, number];

export type StatusBadge = { label: string; text: Rgb; fill: Rgb };

const GREEN: StatusBadge = { label: "Paid", text: [21, 128, 61], fill: [220, 252, 231] };
const RED: StatusBadge = { label: "Overdue", text: [185, 28, 28], fill: [254, 226, 226] };
const AMBER: StatusBadge = { label: "Part paid", text: [180, 83, 9], fill: [254, 243, 199] };
const BLUE: StatusBadge = { label: "Due", text: [40, 69, 149], fill: [224, 231, 255] };
const GREY = (label: string): StatusBadge => ({ label, text: [82, 82, 91], fill: [228, 228, 231] });

/** The one status word the payer needs — internal workflow states collapse into it. */
export function statusBadge(status: string | undefined, state: InvoicePaymentState): StatusBadge {
  if (state.isVoid) return GREY("Void");
  switch (status) {
    case "draft":
    case "pending_approval":
      return GREY("Draft");
    case "cancelled":
      return GREY("Cancelled");
    case "refunded":
      return GREY("Refunded");
    case "credit_note":
      return GREY("Credit note");
    default:
      break;
  }
  if (state.isPaid) return GREEN;
  if (state.hasBalance && state.overdueDays > 0) return RED;
  if (state.isPartiallyPaid) return AMBER;
  if (state.isZeroValue) return GREY("No charge");
  return BLUE;
}

const NOT_COLLECTIBLE = new Set(["void", "cancelled", "refunded", "credit_note"]);

/**
 * Whether the document should ask for money (amount-due panel, bank details).
 * Drafts still do, so a preview looks like what the customer will get; a
 * void, cancelled, refunded invoice or a credit note never does even when a
 * stale balanceDue says otherwise.
 */
export function isCollectible(status: string | undefined, state: InvoicePaymentState): boolean {
  return state.hasBalance && !state.isVoid && !NOT_COLLECTIBLE.has(status ?? "");
}

/** "bulk_hiring" → "Bulk hiring"; "monthly" → "Monthly". */
export function humanize(value: string): string {
  const spaced = value.replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const FACT_LABELS: Record<InvoiceFactKey, string> = {
  plan: "Plan",
  billingCycle: "Billing cycle",
  servicePeriod: "Service period",
  renewalType: "Order type",
  job: "Position",
  category: "Service",
  currency: "Currency",
  paymentTerms: "Payment terms",
};

/** Facts whose values are enum codes rather than free text. */
const ENUM_FACTS = new Set<InvoiceFactKey>(["billingCycle", "renewalType", "category"]);

export function factLabel(key: InvoiceFactKey): string {
  return FACT_LABELS[key];
}

export function factValue(key: InvoiceFactKey, value: string): string {
  return ENUM_FACTS.has(key) ? humanize(value) : value;
}

/** English labels for the totals ladder; the dialog translates the same keys. */
export function totalRowLabel(row: TotalRow): string {
  switch (row.key) {
    case "subtotal":
      return "Subtotal";
    case "discount":
      return row.meta?.discountPercent ? `Discount (${row.meta.discountPercent}%)` : "Discount";
    case "tax": {
      const name = row.meta?.taxType ?? "Tax";
      return row.meta?.taxPercent ? `${name} (${row.meta.taxPercent}%)` : name;
    }
    case "serviceCharge":
      return "Service charge";
    case "paid":
      return "Amount paid";
    case "balance":
      return "Balance due";
    case "total":
    default:
      return "Total";
  }
}

export function safeDate(value?: Date | string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtMoney(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** "Hire: Name · Job title · Starts 01 Dec 2026" under a linked line; null when nothing is known. */
export function hireLine(hire?: { candidateName?: string; jobTitle?: string; startDate?: Date | string | null }): string | null {
  if (!hire) return null;
  const parts = [hire.candidateName, hire.jobTitle, hire.startDate ? `Starts ${safeDate(hire.startDate)}` : undefined]
    .map((p) => p?.trim())
    .filter(Boolean);
  return parts.length ? `Hire: ${parts.join(" · ")}` : null;
}
