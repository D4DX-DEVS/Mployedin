/**
 * @jest-environment node
 */
/**
 * Foundations of the three-pillar targets (docs/plans/2026-11-18-target-management-v2.md):
 * job publish/close stamps, effective-dated commission rates, the employer rate
 * step in the resolver, invoice-line hire links and the commission base.
 */
import mongoose from "mongoose";

const settingsFindOne = jest.fn();
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/models/SystemSettings", () => ({
  __esModule: true,
  default: { findOne: (...args: unknown[]) => settingsFindOne(...args) },
}));

import { stampJobLifecycle, type LifecycleJob } from "@/lib/targets/jobLifecycle";
import { effectiveRate } from "@/lib/commissions/effectiveRate";
import { clearCommissionOverrideCache, resolveCommissionRate, resolveOverrideRate } from "@/lib/commissions/resolveRate";
import { commissionBase, linkLinePlacements } from "@/lib/invoices/linePlacements";

const oid = () => new mongoose.Types.ObjectId();

function job(partial: Partial<LifecycleJob>, modified: string[] = []): LifecycleJob {
  return { isNew: false, status: "draft", isModified: (p: string) => modified.includes(p), ...partial };
}

describe("stampJobLifecycle", () => {
  const now = new Date("2027-03-12T10:00:00Z");

  it("does not stamp a draft", async () => {
    const j = job({ status: "draft" });
    await stampJobLifecycle(j, now, async () => oid());
    expect(j.firstPublishedAt).toBeUndefined();
    expect(j.acquiredByAgentId).toBeUndefined();
  });

  it("stamps the first publish with the job's own agent", async () => {
    const agent = oid();
    const j = job({ status: "active", agentId: agent }, ["status"]);
    await stampJobLifecycle(j, now, async () => oid());
    expect(j.firstPublishedAt).toEqual(now);
    expect(String(j.acquiredByAgentId)).toBe(String(agent));
  });

  it("falls back to the employer's agent when the job has none", async () => {
    const employerAgent = oid();
    const j = job({ status: "active", employerId: oid() }, ["status"]);
    await stampJobLifecycle(j, now, async () => employerAgent);
    expect(String(j.acquiredByAgentId)).toBe(String(employerAgent));
  });

  it("never moves the credit on a republish or after reassignment", async () => {
    const first = new Date("2027-01-05T00:00:00Z");
    const original = oid();
    const j = job({ status: "active", agentId: oid(), firstPublishedAt: first, acquiredByAgentId: original }, ["status"]);
    await stampJobLifecycle(j, now, async () => oid());
    expect(j.firstPublishedAt).toEqual(first);
    expect(String(j.acquiredByAgentId)).toBe(String(original));
  });

  it("still publishes when the employer lookup fails", async () => {
    const j = job({ status: "active", employerId: oid() }, ["status"]);
    await stampJobLifecycle(j, now, async () => {
      throw new Error("db down");
    });
    expect(j.firstPublishedAt).toEqual(now);
    expect(j.acquiredByAgentId).toBeUndefined();
  });

  it("stamps closedAt when a job is closed, and not on unrelated saves", async () => {
    const closing = job({ status: "closed" }, ["status"]);
    await stampJobLifecycle(closing, now);
    expect(closing.closedAt).toEqual(now);

    const earlier = new Date("2027-02-01T00:00:00Z");
    const untouched = job({ status: "closed", closedAt: earlier }, ["title"]);
    await stampJobLifecycle(untouched, now);
    expect(untouched.closedAt).toEqual(earlier);
  });
});

describe("effectiveRate", () => {
  const history = [
    { rate: 4.5, effectiveFrom: new Date("2027-01-01"), setAt: new Date("2026-12-20") },
    { rate: 5, effectiveFrom: new Date("2027-03-01"), setAt: new Date("2027-02-20") },
  ];

  it("returns null before any change applies, or with no history", () => {
    expect(effectiveRate(history, new Date("2026-12-31"))).toBeNull();
    expect(effectiveRate([], new Date())).toBeNull();
    expect(effectiveRate(undefined, new Date())).toBeNull();
  });

  it("applies the latest change on or before the date, so old invoices keep old rates", () => {
    expect(effectiveRate(history, new Date("2027-02-15"))).toBe(4.5);
    expect(effectiveRate(history, new Date("2027-03-01"))).toBe(5);
    expect(effectiveRate(history, new Date("2027-07-01"))).toBe(5);
  });

  it("takes the one set last when two start the same day", () => {
    const same = [
      { rate: 6, effectiveFrom: "2027-03-01", setAt: "2027-02-25" },
      { rate: 5.5, effectiveFrom: "2027-03-01", setAt: "2027-02-27" },
    ];
    expect(effectiveRate(same, new Date("2027-03-02"))).toBe(5.5);
  });
});

describe("rate resolver", () => {
  beforeEach(() => {
    clearCommissionOverrideCache();
    settingsFindOne.mockReturnValue({
      select: () => ({ lean: async () => ({ commissionOverrides: [{ countryCode: "AE", rate: 7, agentRate: 7, superAgentRate: 3 }] }) }),
    });
  });

  it("uses the employer rate before the country rule and the agent default", async () => {
    const r = await resolveCommissionRate(4, "UAE", { history: [{ rate: 6, effectiveFrom: new Date("2027-01-01") }], on: new Date("2027-03-01") });
    expect(r).toEqual({ rate: 6, source: "employer_rate" });
  });

  it("falls back to the country rule when no employer rate applies yet", async () => {
    const r = await resolveCommissionRate(4, "AE", { history: [{ rate: 6, effectiveFrom: new Date("2027-05-01") }], on: new Date("2027-03-01") });
    expect(r.source).toBe("country_override");
    expect(r.rate).toBe(7);
  });

  it("an employer rate applies even when the agent's own rate is 0", async () => {
    const r = await resolveCommissionRate(0, "AE", { history: [{ rate: 5, effectiveFrom: new Date("2027-01-01") }], on: new Date("2027-03-01") });
    expect(r.rate).toBe(5);
  });

  it("a 0% agent rate gives no commission, whatever the country rule says", async () => {
    expect((await resolveCommissionRate(0, "AE")).rate).toBe(0);
    expect((await resolveOverrideRate(0, "AE")).rate).toBe(0);
  });

  it("uses the super agent's rate in effect on the invoice date", async () => {
    const history = [{ rate: 2, effectiveFrom: new Date("2027-01-01") }];
    const before = await resolveOverrideRate(1.5, null, { history, on: new Date("2026-12-31") });
    const after = await resolveOverrideRate(1.5, null, { history, on: new Date("2027-01-02") });
    expect(before.rate).toBe(1.5);
    expect(after.rate).toBe(2);
  });
});

describe("invoice line hire links", () => {
  const jobId = String(oid());

  it("links a single line to the job's only hire", async () => {
    const placement = oid();
    const res = await linkLinePlacements<{ jobId: string; placementId?: unknown }>(jobId, [{ jobId }], async () => [{ _id: placement, jobId }]);
    expect("lines" in res && String(res.lines[0].placementId)).toBe(String(placement));
  });

  it("leaves lines unlinked when the job has several hires and none is named", async () => {
    const res = await linkLinePlacements<{ jobId: string; placementId?: unknown }>(jobId, [{ jobId }], async () => [
      { _id: oid(), jobId },
      { _id: oid(), jobId },
    ]);
    expect("lines" in res && res.lines[0].placementId).toBeUndefined();
  });

  it("keeps each named hire on its own line", async () => {
    const a = oid();
    const b = oid();
    const res = await linkLinePlacements(jobId, [{ jobId, placementId: String(a) }, { jobId, placementId: String(b) }], async () => [
      { _id: a, jobId },
      { _id: b, jobId },
    ]);
    expect("lines" in res && res.lines.map((l) => String(l.placementId))).toEqual([String(a), String(b)]);
  });

  it("rejects a hire from another job", async () => {
    const res = await linkLinePlacements(jobId, [{ jobId, placementId: String(oid()) }], async () => []);
    expect(res).toEqual({ error: "A line names a hire that is not on this job." });
  });
});

describe("commissionBase", () => {
  it("is the total minus tax: discount off, service charge in", () => {
    expect(commissionBase(42000, 0)).toBe(42000);
    expect(commissionBase(38000, 500)).toBe(38500);
    expect(commissionBase(0.1, 0.2)).toBe(0.3);
  });
});
