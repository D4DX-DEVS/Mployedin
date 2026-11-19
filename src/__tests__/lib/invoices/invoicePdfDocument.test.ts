/** @jest-environment node */
import { statusBadge, isCollectible, humanize, factValue, totalRowLabel } from "@/lib/invoices/pdfLabels";
import { paymentState, type PresentableInvoice } from "@/lib/invoices/presentation";
import { buildInvoiceEmail } from "@/lib/invoices/invoiceEmail";
import { generateInvoicePdf } from "@/lib/invoices/generatePdf";
import { hasArabic } from "@/lib/pdf/invoiceFonts";

const NOW = new Date("2026-11-18T12:00:00Z");
const future = "2026-12-30";
const past = "2026-11-01";

const base: PresentableInvoice = {
  invoiceNumber: "INV-1",
  currency: "AED",
  status: "sent",
  subtotal: 100,
  totalAmount: 100,
  paidAmount: 0,
  balanceDue: 100,
  dueDate: future,
  lineItems: [{ description: "Placement fee", quantity: 1, unitPrice: 100, amount: 100 }],
};

const badgeFor = (inv: PresentableInvoice) => statusBadge(inv.status, paymentState(inv, NOW)).label;

describe("statusBadge — the one word the payer sees", () => {
  it("never prints internal workflow states", () => {
    expect(badgeFor({ ...base, status: "sent" })).toBe("Due");
    expect(badgeFor({ ...base, status: "issued" })).toBe("Due");
    expect(badgeFor({ ...base, status: "pending_approval" })).toBe("Draft");
  });

  it("reads payment state", () => {
    expect(badgeFor({ ...base, status: "paid", paidAmount: 100, balanceDue: 0 })).toBe("Paid");
    expect(badgeFor({ ...base, paidAmount: 40, balanceDue: 60 })).toBe("Part paid");
    expect(badgeFor({ ...base, dueDate: past })).toBe("Overdue");
    expect(badgeFor({ ...base, status: "void" })).toBe("Void");
    expect(badgeFor({ ...base, status: "credit_note" })).toBe("Credit note");
  });
});

describe("isCollectible — when the document may ask for money", () => {
  const collectible = (inv: PresentableInvoice) => isCollectible(inv.status, paymentState(inv, NOW));

  it("asks on live and draft invoices with a balance", () => {
    expect(collectible(base)).toBe(true);
    expect(collectible({ ...base, status: "draft" })).toBe(true);
  });

  it("never asks on void, cancelled, refunded, credit notes or settled invoices", () => {
    for (const status of ["void", "cancelled", "refunded", "credit_note"]) {
      expect(collectible({ ...base, status })).toBe(false);
    }
    expect(collectible({ ...base, status: "paid", paidAmount: 100, balanceDue: 0 })).toBe(false);
  });
});

describe("labels", () => {
  it("humanizes enum values", () => {
    expect(humanize("bulk_hiring")).toBe("Bulk hiring");
    expect(factValue("billingCycle", "monthly")).toBe("Monthly");
    expect(factValue("category", "recruitment")).toBe("Recruitment");
    expect(factValue("plan", "growth pro")).toBe("growth pro");
  });

  it("names tax rows by their (uppercased) type and rate", () => {
    expect(totalRowLabel({ key: "tax", amount: 5, meta: { taxType: "VAT", taxPercent: 5 } })).toBe("VAT (5%)");
  });

  it("detects Arabic text", () => {
    expect(hasArabic("شركة الخليج")).toBe(true);
    expect(hasArabic("Gulf Trading LLC")).toBe(false);
  });
});

describe("buildInvoiceEmail", () => {
  it("headlines the balance, not the gross total, once part is paid", () => {
    const { html } = buildInvoiceEmail({
      invoice: { ...base, totalAmount: 1000, paidAmount: 400, balanceDue: 600 },
      companyName: "Acme",
    });
    expect(html).toContain("Amount due");
    expect(html).toContain("AED 600.00");
    expect(html).toContain("Already paid");
  });

  it("does not ask a credit note to be paid", () => {
    const { html, subject } = buildInvoiceEmail({
      invoice: { ...base, status: "credit_note" },
      companyName: "Acme",
      issuerName: "Mployedin FZ-LLC",
      hasBankDetails: true,
    });
    expect(html).not.toContain("Amount due");
    expect(html).not.toContain("Bank details");
    expect(subject).toBe("Invoice INV-1 from Mployedin FZ-LLC");
  });

  it("mentions bank details only when the PDF carries them", () => {
    const withBank = buildInvoiceEmail({ invoice: base, companyName: "Acme", hasBankDetails: true }).html;
    const without = buildInvoiceEmail({ invoice: base, companyName: "Acme" }).html;
    expect(withBank).toContain("Bank details for payment are in the attached PDF.");
    expect(without).not.toContain("Bank details");
  });

  it("escapes typed values", () => {
    const { html } = buildInvoiceEmail({
      invoice: base,
      companyName: "<b>Evil</b>",
      issuerEmail: "\"><script>x</script>",
    });
    expect(html).not.toContain("<b>Evil</b>");
    expect(html).not.toContain("<script>");
  });
});

describe("generateInvoicePdf", () => {
  const issuer = {
    legalName: "Mployedin FZ-LLC",
    addressLines: ["Dubai"],
    hasBankDetails: true,
    bank: { bankName: "Bank", iban: "AE00" },
  };

  it.each([
    ["live", base],
    ["paid", { ...base, status: "paid", paidAmount: 100, balanceDue: 0, paidAt: past }],
    ["void", { ...base, status: "void" }],
    ["credit note", { ...base, status: "credit_note" }],
    ["arabic payer", { ...base, billingDetails: { companyName: "شركة الخليج للتجارة" } }],
    ["subscription", { ...base, category: "subscription", lineItems: [], description: "Growth plan", billingCycle: "monthly" }],
  ])("renders a %s invoice", (_label, inv) => {
    const pdf = generateInvoicePdf(inv, { issuer });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it("keeps a typical invoice on one page", () => {
    const pdf = generateInvoicePdf({ ...base, notes: "Thank you." }, { issuer }).toString("latin1");
    expect(pdf.match(/\/Type \/Page\b/g)).toHaveLength(1);
  });
});
