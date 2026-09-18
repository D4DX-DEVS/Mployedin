/**
 * Unit tests for the shared invoice presentation layer.
 *
 * Both the employer invoice dialog and the PDF generator read an invoice
 * through these functions, so a field that resolves one way on screen cannot
 * resolve another way in the downloaded document.
 */

import {
  resolveBillTo,
  resolveLineItems,
  resolveTotalRows,
  invoiceFacts,
  paymentState,
  type PresentableInvoice,
} from "@/lib/invoices/presentation";

const isoDate = (s: string) => new Date(s).toISOString();

/** A recruitment invoice with every optional block populated. */
const recruitmentInvoice: PresentableInvoice = {
  invoiceNumber: "INV-202605-00012",
  category: "recruitment",
  currency: "AED",
  subtotal: 3000,
  discountPercent: 0,
  discountAmount: 0,
  taxType: "vat",
  taxPercent: 5,
  taxAmount: 150,
  serviceCharge: 0,
  totalAmount: 3150,
  paidAmount: 0,
  balanceDue: 3150,
  status: "overdue",
  paymentTerms: "net_30",
  dueDate: isoDate("2026-06-20T10:32:12.340Z"),
  issuedAt: isoDate("2026-05-21T10:32:12.340Z"),
  jobId: { title: "Senior Electrical Engineer" },
  employerId: {
    companyName: "d4dx",
    companyEmail: "d4dx.co@gmail.com",
    phone: "+919988776655",
    address: "efnewfekhjkbf",
    country: "IN",
  },
  billingDetails: {
    companyName: "d4dx",
    contactPerson: "Employer",
    email: "d4dx.co@gmail.com",
    phone: "+919988776655",
    address: "efnewfekhjkbf",
    country: "",
    taxId: "",
  },
  lineItems: [
    {
      description: "Recruitment placement fee for Marketing Manager",
      quantity: 15,
      unitPrice: 200,
      amount: 3000,
    },
  ],
};

/**
 * A subscription invoice exactly as the auto-renewal cron writes it: no
 * employer link, no billing details, no line items, every money field zero.
 * This is the shape that rendered as a near-empty dialog and a PDF with an
 * empty BILL TO block.
 */
const subscriptionInvoice: PresentableInvoice = {
  invoiceNumber: "INV-202608-00075",
  category: "subscription",
  currency: "USD",
  planName: "Free",
  billingCycle: "monthly",
  periodStart: isoDate("2026-08-22T11:48:45.962Z"),
  periodEnd: isoDate("2026-09-21T11:48:45.962Z"),
  type: "renewal",
  description: "Auto-renewal: Free (monthly)",
  subtotal: 0,
  discountPercent: 0,
  discountAmount: 0,
  taxType: "none",
  taxPercent: 0,
  taxAmount: 0,
  serviceCharge: 0,
  totalAmount: 0,
  paidAmount: 0,
  balanceDue: 0,
  status: "issued",
  paymentTerms: "net_30",
  issuedAt: isoDate("2026-08-30T03:00:06.703Z"),
  dueDate: isoDate("2026-09-29T03:00:06.703Z"),
  lineItems: [],
};

const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

describe("resolveTotalRows", () => {
  it("omits the discount row when discountAmount is 0", () => {
    const keys = resolveTotalRows(recruitmentInvoice).map((r) => r.key);
    expect(keys).not.toContain("discount");
  });

  it("omits the tax row when taxAmount is 0", () => {
    const keys = resolveTotalRows(subscriptionInvoice).map((r) => r.key);
    expect(keys).not.toContain("tax");
  });

  it("never yields a row without a numeric amount", () => {
    for (const invoice of [recruitmentInvoice, subscriptionInvoice]) {
      for (const row of resolveTotalRows(invoice)) {
        expect(typeof row.amount).toBe("number");
        expect(Number.isNaN(row.amount)).toBe(false);
      }
    }
  });

  it("includes subtotal, tax and total for a taxed invoice, in that order", () => {
    const keys = resolveTotalRows(recruitmentInvoice).map((r) => r.key);
    expect(keys).toEqual(["subtotal", "tax", "total"]);
  });

  it("carries the tax type and percent so the label never reads 'undefined'", () => {
    const tax = resolveTotalRows(recruitmentInvoice).find((r) => r.key === "tax");
    expect(tax?.meta).toEqual({ taxType: "VAT", taxPercent: 5 });
  });

  it("falls back to a generic tax label when taxType is missing", () => {
    const rows = resolveTotalRows({ ...recruitmentInvoice, taxType: undefined });
    const tax = rows.find((r) => r.key === "tax");
    expect(tax?.meta?.taxType).toBeNull();
  });

  it("emits a discount row as a negative amount when a discount applies", () => {
    const rows = resolveTotalRows({
      ...recruitmentInvoice,
      discountAmount: 300,
      discountPercent: 10,
    });
    const discount = rows.find((r) => r.key === "discount");
    expect(discount?.amount).toBe(300);
    expect(discount?.negative).toBe(true);
    expect(discount?.meta?.discountPercent).toBe(10);
  });

  it("adds paid and balance rows only once a payment exists", () => {
    const unpaid = resolveTotalRows(recruitmentInvoice).map((r) => r.key);
    expect(unpaid).not.toContain("paid");

    const partial = resolveTotalRows({
      ...recruitmentInvoice,
      paidAmount: 1000,
      balanceDue: 2150,
    }).map((r) => r.key);
    expect(partial).toContain("paid");
    expect(partial).toContain("balance");
  });

  it("includes a service charge row when one is set", () => {
    const rows = resolveTotalRows({ ...recruitmentInvoice, serviceCharge: 50 });
    expect(rows.find((r) => r.key === "serviceCharge")?.amount).toBe(50);
  });
});

describe("resolveLineItems", () => {
  it("returns the stored line items untouched", () => {
    const items = resolveLineItems(recruitmentInvoice);
    expect(items).toHaveLength(1);
    expect(items[0].synthesized).toBe(false);
    expect(items[0].amount).toBe(3000);
  });

  it("synthesizes a row from the description when there are no line items", () => {
    const items = resolveLineItems(subscriptionInvoice);
    expect(items).toHaveLength(1);
    expect(items[0].synthesized).toBe(true);
    expect(items[0].description).toBe("Auto-renewal: Free (monthly)");
    expect(items[0].quantity).toBe(1);
  });

  it("falls back to the plan name when there is no description", () => {
    const items = resolveLineItems({
      ...subscriptionInvoice,
      description: undefined,
    });
    expect(items[0].description).toBe("Free");
  });

  it("prices a synthesized row from the subtotal", () => {
    const items = resolveLineItems({
      ...subscriptionInvoice,
      subtotal: 49,
      totalAmount: 49,
    });
    expect(items[0].unitPrice).toBe(49);
    expect(items[0].amount).toBe(49);
  });

  it("never returns an empty list", () => {
    const items = resolveLineItems({ ...subscriptionInvoice, description: undefined, planName: undefined });
    expect(items).toHaveLength(1);
    expect(items[0].description.length).toBeGreaterThan(0);
  });
});

describe("resolveBillTo", () => {
  it("prefers the invoice's own billing details", () => {
    const billTo = resolveBillTo(recruitmentInvoice);
    expect(billTo.companyName).toBe("d4dx");
    expect(billTo.contactPerson).toBe("Employer");
    expect(billTo.isEmpty).toBe(false);
  });

  it("ignores empty strings in billing details and falls through to the employer", () => {
    const billTo = resolveBillTo({
      ...recruitmentInvoice,
      billingDetails: { companyName: "", email: "", country: "" },
    });
    expect(billTo.companyName).toBe("d4dx");
    expect(billTo.country).toBe("IN");
  });

  it("uses the populated employer when the invoice has no billing details", () => {
    const billTo = resolveBillTo({ ...recruitmentInvoice, billingDetails: undefined });
    expect(billTo.companyName).toBe("d4dx");
    expect(billTo.email).toBe("d4dx.co@gmail.com");
  });

  it("uses the supplied fallback for a subscription invoice with no employer link", () => {
    const billTo = resolveBillTo(subscriptionInvoice, {
      companyName: "d4dx",
      email: "employer@mployedin.com",
      country: "IN",
    });
    expect(billTo.companyName).toBe("d4dx");
    expect(billTo.email).toBe("employer@mployedin.com");
    expect(billTo.isEmpty).toBe(false);
  });

  it("reports empty rather than inventing a company name", () => {
    const billTo = resolveBillTo(subscriptionInvoice);
    expect(billTo.companyName).toBeNull();
    expect(billTo.isEmpty).toBe(true);
    expect(billTo.lines).toEqual([]);
  });

  it("collapses the address into display lines without blank entries", () => {
    const billTo = resolveBillTo({
      ...recruitmentInvoice,
      billingDetails: {
        companyName: "Acme",
        address: "1 Long Road",
        city: "Dubai",
        state: "",
        postalCode: "00000",
        country: "AE",
        taxId: "TRN-99",
      },
    });
    expect(billTo.lines).toContain("1 Long Road");
    expect(billTo.lines).toContain("Dubai, 00000");
    expect(billTo.lines.every((l) => l.trim().length > 0)).toBe(true);
    expect(billTo.taxId).toBe("TRN-99");
  });
});

describe("invoiceFacts", () => {
  it("surfaces plan, cycle, service period and renewal type for a subscription", () => {
    const facts = invoiceFacts(subscriptionInvoice, { formatDate: fmtDate });
    const byKey = Object.fromEntries(facts.map((f) => [f.key, f.value]));
    expect(byKey.plan).toBe("Free");
    expect(byKey.billingCycle).toBe("monthly");
    expect(byKey.servicePeriod).toBe("2026-08-22 – 2026-09-21");
    expect(byKey.renewalType).toBe("renewal");
  });

  it("surfaces the job for a recruitment invoice and no subscription fields", () => {
    const facts = invoiceFacts(recruitmentInvoice, { formatDate: fmtDate });
    const keys = facts.map((f) => f.key);
    expect(keys).toContain("job");
    expect(keys).not.toContain("plan");
    expect(keys).not.toContain("servicePeriod");
  });

  it("always reports currency, category and payment terms", () => {
    for (const invoice of [recruitmentInvoice, subscriptionInvoice]) {
      const keys = invoiceFacts(invoice, { formatDate: fmtDate }).map((f) => f.key);
      expect(keys).toEqual(expect.arrayContaining(["currency", "category", "paymentTerms"]));
    }
  });

  it("omits facts with no value instead of rendering a dash", () => {
    const facts = invoiceFacts(
      { ...subscriptionInvoice, planName: undefined, periodStart: undefined, periodEnd: undefined },
      { formatDate: fmtDate },
    );
    expect(facts.every((f) => f.value && f.value.length > 0)).toBe(true);
    expect(facts.map((f) => f.key)).not.toContain("plan");
  });

  it("describes custom payment terms with the agreed day count", () => {
    const facts = invoiceFacts(
      { ...recruitmentInvoice, paymentTerms: "custom", customPaymentDays: 45 },
      { formatDate: fmtDate },
    );
    expect(facts.find((f) => f.key === "paymentTerms")?.value).toContain("45");
  });
});

describe("paymentState", () => {
  const now = new Date("2026-09-18T00:00:00.000Z");

  it("marks an unpaid overdue invoice with the days it is late", () => {
    const state = paymentState(recruitmentInvoice, now);
    expect(state.stamp).toBe("overdue");
    expect(state.overdueDays).toBe(89);
    expect(state.hasBalance).toBe(true);
    expect(state.canPay).toBe(true);
  });

  it("treats a zero-value invoice as nothing to pay", () => {
    const state = paymentState(subscriptionInvoice, now);
    expect(state.isZeroValue).toBe(true);
    expect(state.hasBalance).toBe(false);
    expect(state.canPay).toBe(false);
    expect(state.stamp).toBeNull();
  });

  it("stamps a paid invoice and blocks payment", () => {
    const state = paymentState(
      { ...recruitmentInvoice, status: "paid", paidAmount: 3150, balanceDue: 0 },
      now,
    );
    expect(state.stamp).toBe("paid");
    expect(state.canPay).toBe(false);
    expect(state.progressPercent).toBe(100);
  });

  it("stamps a void invoice and blocks payment", () => {
    const state = paymentState({ ...recruitmentInvoice, status: "void" }, now);
    expect(state.stamp).toBe("void");
    expect(state.canPay).toBe(false);
  });

  it("reports part payment progress", () => {
    const state = paymentState(
      { ...recruitmentInvoice, status: "partially_paid", paidAmount: 1575, balanceDue: 1575 },
      now,
    );
    expect(state.progressPercent).toBe(50);
    expect(state.isPartiallyPaid).toBe(true);
  });

  it("counts days remaining for an invoice that is not yet due", () => {
    const state = paymentState(
      { ...recruitmentInvoice, status: "issued", dueDate: isoDate("2026-09-28T00:00:00.000Z") },
      now,
    );
    expect(state.daysUntilDue).toBe(10);
    expect(state.overdueDays).toBe(0);
    expect(state.stamp).toBeNull();
  });

  it("derives the balance when the stored balanceDue is missing", () => {
    const state = paymentState(
      { ...recruitmentInvoice, balanceDue: undefined, paidAmount: 150 },
      now,
    );
    expect(state.balanceDue).toBe(3000);
  });
});
