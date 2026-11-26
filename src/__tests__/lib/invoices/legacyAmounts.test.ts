import { withLegacyInvoiceAmounts } from "@/lib/invoices/legacyAmounts";

describe("withLegacyInvoiceAmounts (AG-10)", () => {
  it("fills a legacy paid invoice from amount", () => {
    expect(withLegacyInvoiceAmounts({ amount: 5000, status: "paid" })).toMatchObject({
      totalAmount: 5000, paidAmount: 5000, balanceDue: 0,
    });
  });
  it("treats schema-default totalAmount 0 as missing", () => {
    expect(withLegacyInvoiceAmounts({ amount: 300, totalAmount: 0, status: "issued" })).toMatchObject({
      totalAmount: 300, paidAmount: 0, balanceDue: 300,
    });
  });
  it("leaves a modern invoice untouched", () => {
    const inv = { amount: 100, totalAmount: 100, paidAmount: 40, balanceDue: 60, status: "partially_paid" };
    expect(withLegacyInvoiceAmounts(inv)).toBe(inv);
  });
  it("void legacy invoice has no balance", () => {
    expect(withLegacyInvoiceAmounts<{ amount: number; status: string; balanceDue?: number }>({ amount: 200, status: "void" }).balanceDue).toBe(0);
  });
});
