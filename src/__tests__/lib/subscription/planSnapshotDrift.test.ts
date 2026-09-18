/**
 * Plan-snapshot drift.
 *
 * A subscription freezes the plan it was bought on into `planSnapshot`, and
 * every auto-renewal invoice is written from that snapshot. Nothing ever
 * re-read the plan, so an edit to the live plan never reached existing
 * subscribers: an employer on the Free plan kept being invoiced in USD long
 * after the plan itself had moved to AED.
 *
 * Freezing is deliberate — it grandfathers a price — so the fix is to make the
 * drift visible and its correction explicit, not to silently re-price people.
 */

import { diffPlanSnapshot, type PlanLike, type SnapshotLike } from "@/lib/subscription/planSnapshotDrift";

const plan: PlanLike = {
  name: "Free",
  tier: 0,
  price: 0,
  currency: "AED",
  billingCycle: "monthly",
};

const matchingSnapshot: SnapshotLike = {
  name: "Free",
  tier: 0,
  price: 0,
  currency: "AED",
  billingCycle: "monthly",
};

describe("diffPlanSnapshot", () => {
  it("reports no drift when the snapshot matches the plan", () => {
    const drift = diffPlanSnapshot(plan, matchingSnapshot);
    expect(drift).toEqual([]);
  });

  it("reports a currency change — the defect that billed an AED plan in USD", () => {
    const drift = diffPlanSnapshot(plan, { ...matchingSnapshot, currency: "USD" });
    expect(drift).toEqual([{ field: "currency", was: "USD", now: "AED" }]);
  });

  it("reports a price change", () => {
    const drift = diffPlanSnapshot({ ...plan, price: 49 }, matchingSnapshot);
    expect(drift).toEqual([{ field: "price", was: 0, now: 49 }]);
  });

  it("reports several fields at once", () => {
    const drift = diffPlanSnapshot(
      { ...plan, name: "Starter", price: 99, currency: "INR", billingCycle: "yearly", tier: 1 },
      matchingSnapshot,
    );
    expect(drift.map((d) => d.field).sort()).toEqual([
      "billingCycle",
      "currency",
      "name",
      "price",
      "tier",
    ]);
  });

  it("treats a missing snapshot as fully drifted rather than throwing", () => {
    const drift = diffPlanSnapshot(plan, null);
    expect(drift.length).toBeGreaterThan(0);
    expect(drift.map((d) => d.field)).toContain("currency");
  });

  it("ignores fields the plan does not define, so an edit cannot blank a snapshot", () => {
    const drift = diffPlanSnapshot({ ...plan, billingCycle: undefined }, matchingSnapshot);
    expect(drift.map((d) => d.field)).not.toContain("billingCycle");
  });

  it("does not report drift for a value that only differs by type coercion", () => {
    const drift = diffPlanSnapshot({ ...plan, price: 0 }, { ...matchingSnapshot, price: 0 });
    expect(drift).toEqual([]);
  });

  it("compares currency case-insensitively — 'aed' and 'AED' are one currency", () => {
    const drift = diffPlanSnapshot(plan, { ...matchingSnapshot, currency: "aed" });
    expect(drift).toEqual([]);
  });
});
