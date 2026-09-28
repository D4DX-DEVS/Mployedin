/**
 * @jest-environment node
 *
 * Mark paid stores how the money went out. The schema must declare those paths:
 * Mongoose's strict mode silently drops any path it doesn't know, so a missing
 * one would lose the method or payer without an error.
 */
import mongoose from "mongoose";
import Commission from "@/models/Commission";

describe("Commission payout fields", () => {
  it("keeps the payment method, reference, day and payer", () => {
    const paidBy = new mongoose.Types.ObjectId();
    const doc = new Commission({
      type: "placement", amount: 100, currency: "AED", status: "paid",
      paymentRef: "NEFT-1", paymentMethod: "cash", paidAt: new Date("2026-09-20T12:00:00Z"), paidBy,
    });
    expect(doc.toObject()).toMatchObject({ paymentRef: "NEFT-1", paymentMethod: "cash", paidBy });
    expect(doc.validateSync()).toBeUndefined();
  });

  it("refuses an unknown payment method", () => {
    const doc = new Commission({ type: "placement", amount: 100, currency: "AED", status: "paid", paymentMethod: "crypto" });
    expect(doc.validateSync()?.errors.paymentMethod).toBeDefined();
  });
});
