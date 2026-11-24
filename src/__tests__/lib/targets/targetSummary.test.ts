/**
 * @jest-environment node
 *
 * The "not counted yet" figures beside the three targets (plan T5).
 */

jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, default: jest.fn(), connectDB: jest.fn() }));

import { uncountedRevenue } from "@/lib/targets/targetSummary";

const PERIOD = { start: "2026-11-01", end: "2026-11-30" };
const inv = (over: Record<string, unknown>) => ({
  status: "issued",
  issuedAt: new Date("2026-11-10T09:00:00Z"),
  currency: "AED",
  subtotal: 8000,
  discountPercent: 0,
  serviceCharge: 0,
  totalAmount: 8400,
  lineItems: [] as Array<{ amount: number; placementId?: string; chargeType?: string }>,
  ...over,
});

describe("uncountedRevenue", () => {
  it("counts hire-linked lines awaiting approval, whatever their date", () => {
    const r = uncountedRevenue([
      inv({ status: "pending_approval", issuedAt: undefined, lineItems: [{ amount: 4000, placementId: "h1" }, { amount: 4000, placementId: "h2" }] }),
    ], "AED", PERIOD);
    expect(r).toEqual({ awaitingApproval: 8000, leftOutNoHire: 0 });
  });

  it("counts fee lines with no hire on invoices issued this period, and ignores other charges", () => {
    const r = uncountedRevenue([
      inv({ subtotal: 3000, totalAmount: 3150, lineItems: [{ amount: 2500 }, { amount: 500, chargeType: "other" }] }),
    ], "AED", PERIOD);
    expect(r.leftOutNoHire).toBe(2500);
    expect(r.awaitingApproval).toBe(0);
  });

  it("leaves out invoices issued outside the period, other currencies and dead invoices", () => {
    const r = uncountedRevenue([
      inv({ issuedAt: new Date("2026-10-31T23:00:00Z"), lineItems: [{ amount: 1000 }] }),
      inv({ currency: "USD", lineItems: [{ amount: 1000 }] }),
      inv({ status: "void", lineItems: [{ amount: 1000 }] }),
      inv({ status: "pending_approval", currency: "USD", lineItems: [{ amount: 1000, placementId: "h" }] }),
    ], "AED", PERIOD);
    expect(r).toEqual({ awaitingApproval: 0, leftOutNoHire: 0 });
  });

  it("applies the invoice discount the way the target report does", () => {
    const r = uncountedRevenue([
      inv({ subtotal: 10000, discountPercent: 10, totalAmount: 9450, lineItems: [{ amount: 10000 }] }),
    ], "AED", PERIOD);
    expect(r.leftOutNoHire).toBe(9000);
  });
});
