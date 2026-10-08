/**
 * @jest-environment node
 */
import {
  applyPaidInvoiceToSubscription,
  markSubscriptionPastDue,
  suspendLapsedPastDueSubscriptions,
} from "@/lib/payments/subscriptionFulfillment";
import Invoice from "@/models/Invoice";
import Subscription from "@/models/Subscription";
import SubscriptionPlan from "@/models/SubscriptionPlan";
import SubscriptionHistory from "@/models/SubscriptionHistory";

jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/notifications/trigger", () => ({ notify: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, default: jest.fn(), connectDB: jest.fn() }));

jest.mock("@/models/Invoice", () => ({
  __esModule: true,
  default: { findOneAndUpdate: jest.fn(), updateOne: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({}) },
}));
jest.mock("@/models/Subscription", () => ({
  __esModule: true,
  default: { findById: jest.fn(), findOne: jest.fn(), create: jest.fn(), findOneAndUpdate: jest.fn(), find: jest.fn(), updateOne: jest.fn() },
}));
jest.mock("@/models/SubscriptionPlan", () => ({ __esModule: true, default: { findById: jest.fn() } }));
jest.mock("@/models/SubscriptionHistory", () => ({ __esModule: true, default: { create: jest.fn().mockResolvedValue({}) } }));
jest.mock("@/models/Employer", () => ({ __esModule: true, Employer: { findOneAndUpdate: jest.fn().mockResolvedValue({}) } }));

const inv = Invoice as unknown as Record<string, jest.Mock>;
const sub = Subscription as unknown as Record<string, jest.Mock>;
const planFind = (SubscriptionPlan as unknown as { findById: jest.Mock }).findById;
const historyCreate = (SubscriptionHistory as unknown as { create: jest.Mock }).create;

const DAY = 86_400_000;
const gold = { _id: "planGold", name: "Gold", tier: 2, price: 600, currency: "AED", billingCycle: "monthly", targetRole: "employer" };

function existingSub(overrides: Record<string, unknown> = {}) {
  return {
    _id: "sub1",
    userId: "user1",
    targetRole: "employer",
    planId: "planSilver",
    planSnapshot: { name: "Silver", tier: 1, price: 300, currency: "AED", billingCycle: "monthly" },
    status: "active",
    startDate: new Date(Date.now() - 10 * DAY),
    endDate: new Date(Date.now() + 20 * DAY),
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function paidInvoice(overrides: Record<string, unknown> = {}) {
  return {
    _id: "inv1", invoiceNumber: "INV-1", category: "subscription", type: "upgrade", status: "paid",
    userId: "user1", planId: "planGold", subscriptionId: "sub1", activationPending: true, ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  inv.findOneAndUpdate.mockResolvedValue({ _id: "inv1" }); // claim succeeds
  planFind.mockReturnValue({ lean: jest.fn().mockResolvedValue(gold) });
});

describe("applyPaidInvoiceToSubscription", () => {
  it("does nothing until the invoice is paid (plan is NOT applied before payment)", async () => {
    for (const status of ["issued", "partially_paid", "overdue"]) {
      expect(await applyPaidInvoiceToSubscription(paidInvoice({ status }))).toEqual({ status: "skipped" });
    }
    expect(inv.findOneAndUpdate).not.toHaveBeenCalled();
    expect(sub.findById).not.toHaveBeenCalled();
  });

  it("ignores manual-mode invoices without activationPending", async () => {
    expect((await applyPaidInvoiceToSubscription(paidInvoice({ activationPending: undefined }))).status).toBe("skipped");
  });

  it("applies once — a racing second call sees already_applied", async () => {
    inv.findOneAndUpdate.mockResolvedValueOnce(null);
    expect((await applyPaidInvoiceToSubscription(paidInvoice())).status).toBe("already_applied");
    expect(inv.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "inv1", activationPending: true },
      expect.objectContaining({ $set: expect.objectContaining({ activationPending: false }) }),
      expect.anything(),
    );
  });

  it("upgrade: switches the plan, starts a fresh period, cancels open renewals", async () => {
    const s = existingSub();
    sub.findById.mockResolvedValue(s);
    const res = await applyPaidInvoiceToSubscription(paidInvoice(), { provider: "stripe", paymentId: "pi_1" });

    expect(res).toMatchObject({ status: "applied", action: "upgraded", subscriptionId: "sub1" });
    expect(s.planId).toBe("planGold");
    expect(s.status).toBe("active");
    expect((s as Record<string, unknown>).planSnapshot).toMatchObject({ name: "Gold", tier: 2 });
    expect(s.save).toHaveBeenCalled();
    expect(inv.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionId: "sub1", type: "renewal", activationPending: true }),
      expect.objectContaining({ $set: expect.objectContaining({ status: "cancelled" }) }),
    );
    expect(historyCreate).toHaveBeenCalledWith(expect.objectContaining({ action: "upgraded", toPlanName: "Gold" }));
  });

  it("new purchase: creates the subscription and links it to the invoice", async () => {
    sub.findOne.mockResolvedValue(null);
    sub.create.mockResolvedValue({ _id: "subNew", endDate: new Date(Date.now() + 30 * DAY) });
    const res = await applyPaidInvoiceToSubscription(paidInvoice({ type: "new", subscriptionId: undefined }));
    expect(res).toMatchObject({ status: "applied", action: "assigned", subscriptionId: "subNew" });
    expect(sub.create).toHaveBeenCalledWith(expect.objectContaining({ userId: "user1", planId: "planGold", status: "active" }));
    expect(inv.updateOne).toHaveBeenCalledWith({ _id: "inv1" }, { $set: { subscriptionId: "subNew" } });
  });

  it("renewal: past_due subscription becomes active for the invoiced period", async () => {
    const periodStart = new Date(Date.now() - DAY);
    const periodEnd = new Date(Date.now() + 29 * DAY);
    const s = existingSub({ planId: "planGold", status: "past_due", pastDueSince: periodStart });
    sub.findById.mockResolvedValue(s);
    const res = await applyPaidInvoiceToSubscription(paidInvoice({ type: "renewal", periodStart, periodEnd }));

    expect(res.action).toBe("renewed");
    expect(s.status).toBe("active");
    expect(s.startDate).toEqual(periodStart);
    expect(s.endDate).toEqual(periodEnd);
    expect((s as Record<string, unknown>).pastDueSince).toBeUndefined();
  });

  it("renewal paid after the invoiced period ended → fresh period from today; suspended → reactivated", async () => {
    const s = existingSub({ planId: "planGold", status: "suspended" });
    sub.findById.mockResolvedValue(s);
    const res = await applyPaidInvoiceToSubscription(
      paidInvoice({ type: "renewal", periodStart: new Date(Date.now() - 40 * DAY), periodEnd: new Date(Date.now() - 10 * DAY) }),
    );
    expect(res.action).toBe("reactivated");
    expect(s.endDate.getTime()).toBeGreaterThan(Date.now() + 29 * DAY);
  });

  it("releases the claim when activation fails so a retry can apply it", async () => {
    sub.findById.mockRejectedValue(new Error("db down"));
    await expect(applyPaidInvoiceToSubscription(paidInvoice())).rejects.toThrow("db down");
    expect(inv.updateOne).toHaveBeenCalledWith(
      { _id: "inv1" },
      { $set: { activationPending: true }, $unset: { fulfilledAt: 1 } },
    );
  });
});

describe("past_due transitions", () => {
  it("markSubscriptionPastDue only moves an active subscription", async () => {
    sub.findOneAndUpdate.mockResolvedValueOnce({ _id: "sub1", userId: "user1", targetRole: "employer", planSnapshot: { name: "Gold" } });
    expect(await markSubscriptionPastDue("sub1", { reason: "Renewal payment failed" })).toBe(true);
    expect(sub.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "sub1", status: "active" },
      { $set: expect.objectContaining({ status: "past_due", pastDueSince: expect.any(Date) }) },
      expect.anything(),
    );
    sub.findOneAndUpdate.mockResolvedValueOnce(null);
    expect(await markSubscriptionPastDue("sub1", { reason: "again" })).toBe(false);
  });

  it("suspends past_due subscriptions whose grace window has run out", async () => {
    const now = new Date("2026-09-28T00:00:00Z");
    const lean = jest.fn().mockResolvedValue([
      { _id: "subA", userId: "u1", targetRole: "employer", planId: "p", planSnapshot: { name: "Gold" } },
    ]);
    sub.find.mockReturnValue({ select: () => ({ limit: () => ({ lean }) }) });
    sub.updateOne.mockResolvedValue({ modifiedCount: 1 });

    expect(await suspendLapsedPastDueSubscriptions(now)).toBe(1);
    const filter = sub.find.mock.calls[0][0];
    expect(filter.status).toBe("past_due");
    // default grace = 7 days
    expect(filter.pastDueSince.$lte.toISOString()).toBe(new Date(now.getTime() - 7 * DAY).toISOString());
    expect(sub.updateOne).toHaveBeenCalledWith({ _id: "subA", status: "past_due" }, { $set: { status: "suspended", suspendedAt: now } });
    expect(historyCreate).toHaveBeenCalledWith(expect.objectContaining({ action: "suspended" }));
  });
});
