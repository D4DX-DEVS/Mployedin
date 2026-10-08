/**
 * CM-1: explicit commission lifecycle.
 */
import { COMMISSION_TRANSITIONS, isAllowedCommissionTransition as allowed } from "@/lib/commissions/transitions";

describe("commission transition map", () => {
  it("matches the documented lifecycle", () => {
    expect(COMMISSION_TRANSITIONS).toEqual({
      pending: ["approved", "disputed"],
      approved: ["paid", "disputed", "clawed_back"],
      paid: ["clawed_back", "disputed"],
      disputed: ["approved", "pending", "clawed_back"],
      clawed_back: [],
    });
  });

  it("treats clawed_back as terminal for everyone", () => {
    for (const to of ["pending", "approved", "paid", "disputed"] as const) {
      expect(allowed("clawed_back", to, "update")).toBe(false);
    }
  });

  it("forbids skipping approval (pending → paid)", () => {
    expect(allowed("pending", "paid", "update")).toBe(false);
  });

  it("lets an admin (commissions:update) make every mapped move", () => {
    expect(allowed("approved", "paid", "update")).toBe(true);
    expect(allowed("disputed", "pending", "update")).toBe(true);
    expect(allowed("paid", "clawed_back", "update")).toBe(true);
  });

  it("limits approve-only roles to pending → approved and raising disputes", () => {
    expect(allowed("pending", "approved", "approve")).toBe(true);
    expect(allowed("approved", "disputed", "approve")).toBe(true);
    expect(allowed("approved", "paid", "approve")).toBe(false);
    expect(allowed("disputed", "approved", "approve")).toBe(false); // resolution is update-only
    expect(allowed("approved", "clawed_back", "approve")).toBe(false);
  });

  it("lets the beneficiary only dispute", () => {
    expect(allowed("pending", "disputed", "beneficiary")).toBe(true);
    expect(allowed("paid", "disputed", "beneficiary")).toBe(true);
    expect(allowed("pending", "approved", "beneficiary")).toBe(false);
  });

  it("never returns a disputed PAID commission to approved/pending (double payout)", () => {
    expect(allowed("disputed", "approved", "update", { paidBefore: true })).toBe(false);
    expect(allowed("disputed", "pending", "update", { paidBefore: true })).toBe(false);
    expect(allowed("disputed", "paid", "update", { paidBefore: true })).toBe(true);
    expect(allowed("disputed", "clawed_back", "update", { paidBefore: true })).toBe(true);
  });

  it("allows no-op status writes", () => {
    expect(allowed("clawed_back", "clawed_back", "beneficiary")).toBe(true);
  });
});
