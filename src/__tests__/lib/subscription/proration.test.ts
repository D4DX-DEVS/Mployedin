/**
 * @jest-environment node
 */
import { computePlanChangeQuote } from "@/lib/subscription/proration";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-09-15T00:00:00Z");

function current(overrides: Record<string, unknown> = {}) {
  return {
    status: "active",
    startDate: new Date(now.getTime() - 10 * DAY),
    endDate: new Date(now.getTime() + 20 * DAY), // 30-day period, 20 days unused
    planSnapshot: { tier: 1, price: 300, currency: "AED" },
    ...overrides,
  };
}

const gold = { tier: 2, price: 600, currency: "AED" };
const free = { tier: 0, price: 0, currency: "AED" };

describe("computePlanChangeQuote", () => {
  it("no subscription → new at full price", () => {
    expect(computePlanChangeQuote(null, gold, now)).toMatchObject({ kind: "new", amount: 600, credit: 0 });
  });

  it("upgrade mid-cycle credits unused days of the current plan", () => {
    // 300 × 20/30 = 200 credit → 600 − 200 = 400
    const q = computePlanChangeQuote(current(), gold, now);
    expect(q).toMatchObject({ kind: "upgrade", credit: 200, amount: 400, remainingDays: 20, periodDays: 30 });
  });

  it("floors the credit to the cent", () => {
    const q = computePlanChangeQuote(current({ planSnapshot: { tier: 1, price: 100, currency: "AED" } }), gold, now);
    // 100 × 2/3 = 66.666… → 66.66
    expect(q.credit).toBe(66.66);
    expect(q.amount).toBe(533.34);
  });

  it("never credits more than the new price", () => {
    const pricey = current({ planSnapshot: { tier: 1, price: 3000, currency: "AED" } });
    const q = computePlanChangeQuote(pricey, { tier: 2, price: 500, currency: "AED" }, now);
    expect(q.credit).toBe(500);
    expect(q.amount).toBe(0);
  });

  it("no credit across currencies", () => {
    const q = computePlanChangeQuote(current({ planSnapshot: { tier: 1, price: 300, currency: "INR" } }), gold, now);
    expect(q).toMatchObject({ kind: "upgrade", credit: 0, amount: 600, currencyMismatch: true });
  });

  it("free current plan → full price, no credit", () => {
    const q = computePlanChangeQuote(current({ planSnapshot: { tier: 0, price: 0, currency: "AED" } }), gold, now);
    expect(q).toMatchObject({ credit: 0, amount: 600 });
  });

  it("past_due period was never paid → no credit", () => {
    const q = computePlanChangeQuote(current({ status: "past_due" }), gold, now);
    expect(q).toMatchObject({ kind: "upgrade", credit: 0, amount: 600 });
  });

  it("downgrade → scheduled at period end, nothing charged", () => {
    const cur = current({ planSnapshot: { tier: 2, price: 600, currency: "AED" } });
    const q = computePlanChangeQuote(cur, { tier: 1, price: 300, currency: "AED" }, now);
    expect(q.kind).toBe("downgrade");
    expect(q.amount).toBe(0);
    expect(q.effectiveAt?.toISOString()).toBe(new Date(now.getTime() + 20 * DAY).toISOString());
    expect(computePlanChangeQuote(cur, free, now).kind).toBe("downgrade");
  });

  it("same tier, cheaper price counts as a downgrade", () => {
    const cur = current({ planSnapshot: { tier: 1, price: 300, currency: "AED" } });
    expect(computePlanChangeQuote(cur, { tier: 1, price: 200, currency: "AED" }, now).kind).toBe("downgrade");
  });

  it("lapsed period → buy outright as new", () => {
    const q = computePlanChangeQuote(current({ endDate: new Date(now.getTime() - DAY) }), gold, now);
    expect(q).toMatchObject({ kind: "new", amount: 600, credit: 0 });
  });
});
