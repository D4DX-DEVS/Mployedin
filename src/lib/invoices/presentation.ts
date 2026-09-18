/**
 * Shared invoice presentation layer.
 *
 * The employer dialog and the PDF generator used to each decide, separately,
 * what an invoice "has": the dialog hid its Items and Billed-to sections when
 * a subscription invoice arrived with `lineItems: []` and no employer link,
 * while the PDF printed an empty `BILL TO —` for the same document. These
 * functions are the single answer to "what does this invoice show", so the two
 * surfaces cannot drift apart again.
 *
 * Everything here is pure and free of translation: functions return keys and
 * raw values, and each caller supplies its own labels and date formatting.
 */

export type InvoiceBillingDetails = {
  companyName?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  taxId?: string;
};

export type InvoiceEmployerRef =
  | {
      companyName?: string;
      companyEmail?: string;
      phone?: string;
      address?: string;
      country?: string;
      taxId?: string;
    }
  | string
  | null;

export type PresentableLineItem = {
  description?: string;
  quantity?: number;
  unitPrice?: number;
  amount?: number;
};

/**
 * The invoice fields these helpers read. Structural on purpose — the same
 * shape arrives as a lean Mongo document on the server and as JSON in the
 * browser, and neither carries Mongoose typing by the time it gets here.
 */
export type PresentableInvoice = {
  invoiceNumber?: string;
  category?: string;
  type?: string;
  status?: string;
  currency?: string;
  description?: string;
  planName?: string;
  billingCycle?: string;
  periodStart?: string | Date | null;
  periodEnd?: string | Date | null;
  issuedAt?: string | Date | null;
  createdAt?: string | Date | null;
  dueDate?: string | Date | null;
  subtotal?: number;
  amount?: number;
  discountPercent?: number;
  discountAmount?: number;
  taxType?: string;
  taxPercent?: number;
  taxAmount?: number;
  serviceCharge?: number;
  totalAmount?: number;
  paidAmount?: number;
  balanceDue?: number;
  paymentTerms?: string;
  customPaymentDays?: number;
  notes?: string;
  lineItems?: PresentableLineItem[];
  billingDetails?: InvoiceBillingDetails;
  employerId?: InvoiceEmployerRef;
  jobId?: { title?: string } | string | null;
};

const DAY_MS = 86_400_000;

/** Trimmed value, or undefined for null/empty/whitespace — empty strings are stored freely. */
function clean(value?: string | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toDate(value?: string | Date | null): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function asObject<T extends object>(value: T | string | null | undefined): T | undefined {
  return value && typeof value === "object" ? value : undefined;
}

// ──────────────────────────────────────────────────────────────────────────
// Bill to
// ──────────────────────────────────────────────────────────────────────────

export type BillToFallback = {
  companyName?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  country?: string;
  taxId?: string;
};

export type ResolvedBillTo = {
  companyName: string | null;
  contactPerson?: string;
  email?: string;
  phone?: string;
  /** Address lines, already collapsed and free of blanks. */
  lines: string[];
  country?: string;
  taxId?: string;
  /** True when nothing at all is known about the payer. */
  isEmpty: boolean;
};

/**
 * Resolve who the invoice is billed to, field by field.
 *
 * The fallback runs per field rather than per object because a subscription
 * invoice has neither `billingDetails` nor `employerId` — only `userId` — so
 * the caller looks the employer profile up and passes it in here.
 */
export function resolveBillTo(
  invoice: PresentableInvoice,
  fallback?: BillToFallback,
): ResolvedBillTo {
  const billing = invoice.billingDetails;
  const employer = asObject(invoice.employerId);

  const companyName =
    clean(billing?.companyName) ?? clean(employer?.companyName) ?? clean(fallback?.companyName) ?? null;
  const contactPerson = clean(billing?.contactPerson) ?? clean(fallback?.contactPerson);
  const email = clean(billing?.email) ?? clean(employer?.companyEmail) ?? clean(fallback?.email);
  const phone = clean(billing?.phone) ?? clean(employer?.phone) ?? clean(fallback?.phone);
  const address = clean(billing?.address) ?? clean(employer?.address) ?? clean(fallback?.address);
  const country = clean(billing?.country) ?? clean(employer?.country) ?? clean(fallback?.country);
  const taxId = clean(billing?.taxId) ?? clean(employer?.taxId) ?? clean(fallback?.taxId);

  const cityLine = [clean(billing?.city), clean(billing?.state), clean(billing?.postalCode)]
    .filter(Boolean)
    .join(", ");

  const lines = [address, cityLine || undefined, country].filter(
    (l): l is string => typeof l === "string" && l.length > 0,
  );

  return {
    companyName,
    contactPerson,
    email,
    phone,
    lines,
    country,
    taxId,
    isEmpty: !companyName && !contactPerson && !email && !phone && lines.length === 0,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Line items
// ──────────────────────────────────────────────────────────────────────────

export type ResolvedLineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  /** True when the row was derived from the invoice rather than stored on it. */
  synthesized: boolean;
};

/**
 * Always returns at least one row. Subscription invoices carry their only
 * description on the invoice itself, so an empty `lineItems` array becomes a
 * single synthesized row instead of a missing section.
 */
export function resolveLineItems(invoice: PresentableInvoice): ResolvedLineItem[] {
  const stored = invoice.lineItems ?? [];
  if (stored.length > 0) {
    return stored.map((item) => ({
      description: clean(item.description) ?? "—",
      quantity: item.quantity ?? 1,
      unitPrice: item.unitPrice ?? 0,
      amount: item.amount ?? 0,
      synthesized: false,
    }));
  }

  const value = invoice.subtotal ?? invoice.amount ?? invoice.totalAmount ?? 0;
  return [
    {
      description: clean(invoice.description) ?? clean(invoice.planName) ?? "Service",
      quantity: 1,
      unitPrice: value,
      amount: value,
      synthesized: true,
    },
  ];
}

// ──────────────────────────────────────────────────────────────────────────
// Totals
// ──────────────────────────────────────────────────────────────────────────

export type TotalRowKey =
  | "subtotal"
  | "discount"
  | "tax"
  | "serviceCharge"
  | "total"
  | "paid"
  | "balance";

export type TotalRow = {
  key: TotalRowKey;
  amount: number;
  /** Render the amount with a leading minus. */
  negative?: boolean;
  /** Emphasised row — the grand total and the outstanding balance. */
  emphasis?: boolean;
  meta?: { taxType?: string | null; taxPercent?: number; discountPercent?: number };
};

/**
 * Build the totals ladder, omitting rows that do not apply.
 *
 * The dialog previously inlined these as `{invoice.discountAmount && … && (…)}`,
 * which rendered a literal `0` between Subtotal and Tax whenever the discount
 * was zero — a falsy number is a valid React child. Returning a list means a
 * row that does not apply cannot leak anything at all.
 */
export function resolveTotalRows(invoice: PresentableInvoice): TotalRow[] {
  const rows: TotalRow[] = [];

  rows.push({ key: "subtotal", amount: invoice.subtotal ?? 0 });

  if ((invoice.discountAmount ?? 0) > 0) {
    rows.push({
      key: "discount",
      amount: invoice.discountAmount as number,
      negative: true,
      meta: { discountPercent: invoice.discountPercent ?? 0 },
    });
  }

  if ((invoice.taxAmount ?? 0) > 0) {
    const taxType = clean(invoice.taxType);
    rows.push({
      key: "tax",
      amount: invoice.taxAmount as number,
      meta: {
        taxType: taxType && taxType !== "none" ? taxType.toUpperCase() : null,
        taxPercent: invoice.taxPercent ?? 0,
      },
    });
  }

  if ((invoice.serviceCharge ?? 0) > 0) {
    rows.push({ key: "serviceCharge", amount: invoice.serviceCharge as number });
  }

  rows.push({
    key: "total",
    amount: invoice.totalAmount ?? invoice.amount ?? 0,
    emphasis: true,
  });

  if ((invoice.paidAmount ?? 0) > 0) {
    rows.push({ key: "paid", amount: invoice.paidAmount as number });
    rows.push({ key: "balance", amount: derivedBalance(invoice), emphasis: true });
  }

  return rows;
}

function derivedBalance(invoice: PresentableInvoice): number {
  if (typeof invoice.balanceDue === "number") return invoice.balanceDue;
  return (invoice.totalAmount ?? invoice.amount ?? 0) - (invoice.paidAmount ?? 0);
}

// ──────────────────────────────────────────────────────────────────────────
// Facts
// ──────────────────────────────────────────────────────────────────────────

export type InvoiceFactKey =
  | "plan"
  | "billingCycle"
  | "servicePeriod"
  | "renewalType"
  | "job"
  | "category"
  | "currency"
  | "paymentTerms";

export type InvoiceFact = { key: InvoiceFactKey; value: string };

/**
 * The category-aware key/value list that fills the detail view.
 *
 * Subscription invoices carry `planName`, `billingCycle`, `periodStart`,
 * `periodEnd` and `type`, none of which the UI used to read — which is why a
 * renewal invoice looked like an empty page. Facts with no value are dropped
 * rather than rendered as a dash.
 */
export function invoiceFacts(
  invoice: PresentableInvoice,
  opts: { formatDate: (d: Date) => string },
): InvoiceFact[] {
  const facts: InvoiceFact[] = [];
  const push = (key: InvoiceFactKey, value?: string | null) => {
    const v = clean(value ?? undefined);
    if (v) facts.push({ key, value: v });
  };

  const isSubscription = invoice.category === "subscription";

  if (isSubscription) {
    push("plan", invoice.planName);
    push("billingCycle", invoice.billingCycle);

    const start = toDate(invoice.periodStart);
    const end = toDate(invoice.periodEnd);
    if (start && end) {
      push("servicePeriod", `${opts.formatDate(start)} – ${opts.formatDate(end)}`);
    } else if (start) {
      push("servicePeriod", opts.formatDate(start));
    }

    push("renewalType", invoice.type);
  } else {
    push("job", asObject(invoice.jobId)?.title);
  }

  push("category", invoice.category);
  push("currency", invoice.currency);
  push("paymentTerms", formatPaymentTerms(invoice));

  return facts;
}

/** "net_30" → "Net 30"; "custom" → "Custom (45 days)". */
export function formatPaymentTerms(invoice: PresentableInvoice): string | undefined {
  const terms = clean(invoice.paymentTerms);
  if (!terms) return undefined;
  if (terms === "custom") {
    return `Custom (${invoice.customPaymentDays ?? 0} days)`;
  }
  return terms
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

// ──────────────────────────────────────────────────────────────────────────
// Payment state
// ──────────────────────────────────────────────────────────────────────────

export type InvoiceStamp = "paid" | "void" | "overdue" | null;

export type InvoicePaymentState = {
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  isPaid: boolean;
  isVoid: boolean;
  isPartiallyPaid: boolean;
  /** Nothing was ever charged — a free-plan renewal, typically. */
  isZeroValue: boolean;
  hasBalance: boolean;
  canPay: boolean;
  /** Whole days until the due date; 0 once the date has passed. */
  daysUntilDue: number | null;
  /** Whole days past the due date while a balance remains; 0 otherwise. */
  overdueDays: number;
  progressPercent: number;
  stamp: InvoiceStamp;
};

/** Statuses that are not yet payable by the customer. */
const UNPAYABLE_STATUSES = new Set(["void", "draft", "pending_approval", "cancelled", "refunded"]);

export function paymentState(
  invoice: PresentableInvoice,
  now: Date = new Date(),
): InvoicePaymentState {
  const totalAmount = invoice.totalAmount ?? invoice.amount ?? 0;
  const paidAmount = invoice.paidAmount ?? 0;
  const balanceDue = derivedBalance(invoice);

  const isVoid = invoice.status === "void";
  const isPaid = invoice.status === "paid" || (totalAmount > 0 && balanceDue <= 0 && paidAmount > 0);
  const isZeroValue = totalAmount <= 0;
  const hasBalance = balanceDue > 0;
  const canPay = hasBalance && !isPaid && !UNPAYABLE_STATUSES.has(invoice.status ?? "");

  const due = toDate(invoice.dueDate);
  let daysUntilDue: number | null = null;
  let overdueDays = 0;
  if (due) {
    const diff = due.getTime() - now.getTime();
    if (diff >= 0) {
      daysUntilDue = Math.ceil(diff / DAY_MS);
    } else {
      daysUntilDue = 0;
      overdueDays = Math.floor(-diff / DAY_MS);
    }
  }

  const progressPercent = totalAmount > 0 ? Math.round((paidAmount / totalAmount) * 100) : 0;

  let stamp: InvoiceStamp = null;
  if (isVoid) stamp = "void";
  else if (isPaid) stamp = "paid";
  else if (hasBalance && overdueDays > 0) stamp = "overdue";

  return {
    totalAmount,
    paidAmount,
    balanceDue,
    isPaid,
    isVoid,
    isPartiallyPaid: paidAmount > 0 && balanceDue > 0,
    isZeroValue,
    hasBalance,
    canPay,
    daysUntilDue,
    overdueDays,
    progressPercent,
    stamp,
  };
}
