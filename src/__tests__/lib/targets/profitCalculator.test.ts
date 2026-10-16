/**
 * @jest-environment node
 */
/**
 * Profit is net invoice income (Invoice.platformRevenue) recognised as payments
 * arrive. These tests pin who earns an invoice, the one-currency rule, and the
 * query shape; the pro-rata arithmetic lives in the aggregation pipeline.
 */
import {
  attributeProfitRows,
  calculateProfits,
  earningAgentOf,
  profitInvoicePipeline,
  profitOwnerKey,
  type OwnershipIndex,
  type ProfitOwner,
  type ProfitRow,
} from "@/lib/targets/profitCalculator";
import { NON_REVENUE_INVOICE_STATUSES } from "@/lib/invoices/status";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));

const agentFind = jest.fn();
const superAgentFind = jest.fn();
const employerFind = jest.fn();
const employerAggregate = jest.fn();
const placementAggregate = jest.fn();
const invoiceAggregate = jest.fn();

const chain = (result: unknown) => ({ select: () => ({ lean: async () => result }) });

jest.mock("@/models/Agent", () => ({ __esModule: true, default: { find: (...a: unknown[]) => agentFind(...a) } }));
jest.mock("@/models/SuperAgent", () => ({ __esModule: true, default: { find: (...a: unknown[]) => superAgentFind(...a) } }));
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  default: { find: (...a: unknown[]) => employerFind(...a), aggregate: (...a: unknown[]) => employerAggregate(...a) },
}));
jest.mock("@/models/Placement", () => ({ __esModule: true, default: { aggregate: (...a: unknown[]) => placementAggregate(...a) } }));
jest.mock("@/models/Invoice", () => ({ __esModule: true, default: { aggregate: (...a: unknown[]) => invoiceAggregate(...a) } }));

// 24-char hex ids so the real ObjectId constructor accepts them.
const A1 = "5f0000000000000000000a01";
const A2 = "5f0000000000000000000a02";
const SA1 = "5f0000000000000000000b01";
const E1 = "5f0000000000000000000e01";
const E2 = "5f0000000000000000000e02";
const U_E1 = "5f0000000000000000000f01";
const U_A1 = "5f0000000000000000000c01";
const U_A2 = "5f0000000000000000000c02";
const U_SA1 = "5f0000000000000000000d01";

function row(overrides: Partial<ProfitRow>): ProfitRow {
  return {
    agentId: null,
    employerId: null,
    userId: null,
    saIds: [],
    day: "2027-01-10",
    currency: "AED",
    category: "recruitment",
    profit: 100,
    commissionCost: 20,
    invoiceIds: ["inv-1"],
    ...overrides,
  };
}

const index: OwnershipIndex = {
  employerAgent: new Map([[E1, A1], [E2, A2]]),
  employerUserAgent: new Map([[U_E1, A1]]),
};

function agentOwner(id: string, currency = "AED"): ProfitOwner {
  return { key: profitOwnerKey("agent", `u-${id}`), role: "agent", currency, agentIds: new Set([id]) };
}

function saOwner(team: string[], currency = "AED"): ProfitOwner {
  return { key: profitOwnerKey("super_agent", "u-sa"), role: "super_agent", currency, agentIds: new Set(team), saId: SA1 };
}

describe("earningAgentOf", () => {
  it("prefers the invoice's own agent over the employer's agent", () => {
    expect(earningAgentOf(row({ agentId: A1, employerId: E2 }), index)).toBe(A1);
  });

  it("falls back to the billed employer's agent, by employer id or by billed user", () => {
    expect(earningAgentOf(row({ employerId: E2 }), index)).toBe(A2);
    expect(earningAgentOf(row({ userId: U_E1 }), index)).toBe(A1);
  });

  it("is null when nobody owns the invoice", () => {
    expect(earningAgentOf(row({ employerId: "unknown", userId: "nobody" }), index)).toBeNull();
  });
});

describe("attributeProfitRows", () => {
  it("credits an invoice to exactly one agent", () => {
    const owners = [agentOwner(A1), agentOwner(A2)];
    const acc = attributeProfitRows([row({ agentId: A1, employerId: E2 })], owners, index);

    expect(acc.get(owners[0].key)?.months[0].profit).toBe(100);
    expect(acc.get(owners[1].key)?.months[0].profit).toBe(0);
  });

  it("credits employer-owned invoices that carry no agent (subscriptions) to the employer's agent", () => {
    const owners = [agentOwner(A1)];
    const acc = attributeProfitRows([row({ userId: U_E1, category: "subscription", profit: 50 })], owners, index);

    expect(acc.get(owners[0].key)?.months[0].profit).toBe(50);
    expect(acc.get(owners[0].key)?.categories.get("subscription")).toBe(50);
  });

  it("counts a team's invoice once for the super agent, even with an override line on it", () => {
    const sa = saOwner([A1, A2]);
    const acc = attributeProfitRows([row({ agentId: A1, saIds: [SA1] })], [sa], index);

    expect(acc.get(sa.key)?.months[0].profit).toBe(100);
    expect(acc.get(sa.key)?.invoices.size).toBe(1);
  });

  it("counts an invoice carrying the super agent's override line even when its agent is outside the team", () => {
    const sa = saOwner([A1]);
    const acc = attributeProfitRows([row({ agentId: A2, saIds: [SA1] })], [sa], index);

    expect(acc.get(sa.key)?.months[0].profit).toBe(100);
  });

  it("ignores another team's agent when there is no override line", () => {
    const sa = saOwner([A1]);
    const acc = attributeProfitRows([row({ agentId: A2 })], [sa], index);

    expect(acc.get(sa.key)?.months[0].profit).toBe(0);
  });

  it("only counts invoices in the profile's own currency; a missing currency is AED", () => {
    const aed = agentOwner(A1, "AED");
    const inr = { ...agentOwner(A1, "INR"), key: "agent:u-inr" };
    const acc = attributeProfitRows(
      [row({ agentId: A1, currency: "INR", profit: 700 }), row({ agentId: A1, currency: "", profit: 30, invoiceIds: ["inv-2"] })],
      [aed, inr],
      index,
    );

    expect(acc.get(aed.key)?.months[0].profit).toBe(30);
    expect(acc.get(inr.key)?.months[0].profit).toBe(700);
  });

  it("buckets by month and counts distinct invoices across payments", () => {
    const owner = agentOwner(A1);
    const acc = attributeProfitRows(
      [
        row({ agentId: A1, day: "2027-01-05", profit: 40, invoiceIds: ["inv-1"] }),
        row({ agentId: A1, day: "2027-02-05", profit: 60, invoiceIds: ["inv-1"] }),
        row({ agentId: A1, day: "2027-02-20", profit: 10, category: "subscription", invoiceIds: ["inv-2"] }),
      ],
      [owner],
      index,
    );
    const result = acc.get(owner.key)!;

    expect(result.months[0].profit).toBe(40);
    expect(result.months[1].profit).toBe(70);
    expect(result.months[1].invoices.size).toBe(2);
    expect(result.invoices.size).toBe(2);
  });
});

describe("profit per period", () => {
  const owner = (periods: { startDate: string; endDate: string }[]): ProfitOwner => ({ ...agentOwner(A1), periods });

  it("puts each payment day into the period that holds it, ends included", () => {
    const weekly = owner([
      { startDate: "2027-01-01", endDate: "2027-01-03" },
      { startDate: "2027-01-04", endDate: "2027-01-10" },
      { startDate: "2027-01-11", endDate: "2027-01-17" },
    ]);
    const acc = attributeProfitRows(
      [
        row({ agentId: A1, day: "2027-01-03", profit: 10, invoiceIds: ["a"] }),
        row({ agentId: A1, day: "2027-01-04", profit: 20, invoiceIds: ["b"] }),
        row({ agentId: A1, day: "2027-01-10", profit: 30, invoiceIds: ["c"] }),
        row({ agentId: A1, day: "2027-01-18", profit: 99, invoiceIds: ["d"] }), // after the last period
      ],
      [weekly],
      index,
    ).get(weekly.key)!;

    expect(acc.periods.map((p) => p.profit)).toEqual([10, 50, 0]);
    expect(acc.periods[1].invoices.size).toBe(2);
    // The year's totals still hold everything, in or out of a period.
    expect(acc.months[0].profit).toBe(159);
  });

  it("measures a custom range that cuts across months, leaving the gaps out", () => {
    const campaign = owner([{ startDate: "2027-03-15", endDate: "2027-04-15" }]);
    const acc = attributeProfitRows(
      [
        row({ agentId: A1, day: "2027-03-14", profit: 5 }),
        row({ agentId: A1, day: "2027-03-20", profit: 10 }),
        row({ agentId: A1, day: "2027-04-10", profit: 20 }),
        row({ agentId: A1, day: "2027-04-16", profit: 7 }),
      ],
      [campaign],
      index,
    ).get(campaign.key)!;

    expect(acc.periods[0].profit).toBe(30);
  });

  it("asks for no periods, and returns none, when the profile has no schedule", () => {
    const acc = attributeProfitRows([row({ agentId: A1 })], [agentOwner(A1)], index).get(agentOwner(A1).key)!;
    expect(acc.periods).toEqual([]);
  });
});

describe("profitInvoicePipeline", () => {
  const pipeline = profitInvoicePipeline(
    { agentIds: [A1], employerIds: [E1], employerUserIds: [U_E1], saIds: [SA1] },
    2026,
  ) as unknown as Array<Record<string, unknown>>;

  it("leaves out void, cancelled, refunded and credit-note invoices", () => {
    const match = pipeline[0].$match as { status: { $nin: string[] } };
    expect(match.status.$nin).toEqual(NON_REVENUE_INVOICE_STATUSES);
  });

  it("matches invoices by agent, employer, billed user or super-agent override line", () => {
    const match = pipeline[0].$match as { $or: Record<string, unknown>[] };
    expect(match.$or.map((arm) => Object.keys(arm)[0])).toEqual([
      "agentId",
      "employerId",
      "userId",
      "commissions.superAgentId",
    ]);
  });

  it("recognises profit per payment on the day it was paid (UTC), not the invoice date", () => {
    const stages = JSON.stringify(pipeline);
    expect(stages).toContain('"$unwind":"$payments"');
    expect(stages).toContain('"$dateToString":{"format":"%Y-%m-%d","date":"$payments.paymentDate","timezone":"UTC"}');
    expect(stages).toContain("$platformRevenue");
  });
});

describe("calculateProfits", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Own agents are looked up by userId, a super agent's team by superAgentId.
    agentFind.mockImplementation((filter: Record<string, unknown>) =>
      chain(
        filter.superAgentId
          ? [{ _id: A1, superAgentId: SA1 }]
          : [{ _id: A1, userId: U_A1 }, { _id: A2, userId: U_A2 }],
      ),
    );
    superAgentFind.mockImplementation(() => chain([{ _id: SA1, userId: U_SA1 }]));
    employerFind.mockImplementation(() => chain([{ _id: E1, userId: U_E1, agentId: A1 }]));
    employerAggregate.mockResolvedValue([{ _id: { agentId: A1, month: 3 }, count: 2 }]);
    placementAggregate.mockResolvedValue([{ _id: { agentId: A1, month: 3 }, count: 1 }]);
  });

  const aggregated = (agentId: string | null, month: number, profit: number, extra: Record<string, unknown> = {}) => ({
    _id: { agentId, employerId: null, userId: null, saIds: [], day: `2027-${String(month).padStart(2, "0")}-15`, currency: "AED", category: "recruitment", ...extra },
    profit,
    commissionCost: profit / 4,
    invoiceIds: [`inv-${agentId}-${month}`],
  });

  it("gives an agent their own profit and a super agent their team's, in one invoice query", async () => {
    invoiceAggregate.mockResolvedValue([aggregated(A1, 1, 400), aggregated(A2, 1, 999)]);

    const result = await calculateProfits(
      [
        { userId: U_A1, role: "agent", currency: "AED" },
        { userId: U_SA1, role: "super_agent", currency: "AED" },
      ],
      2026,
    );

    const agent = result.get(profitOwnerKey("agent", U_A1))!;
    const sa = result.get(profitOwnerKey("super_agent", U_SA1))!;

    expect(invoiceAggregate).toHaveBeenCalledTimes(1);
    expect(agent.totals.profit).toBe(400);
    expect(agent.totals.commissionCost).toBe(100);
    expect(agent.totals.revenue).toBe(500);
    // Only A1 is on this super agent's team: A2's 999 is not theirs.
    expect(sa.totals.profit).toBe(400);
  });

  it("returns profit per period for a profile that has a schedule", async () => {
    invoiceAggregate.mockResolvedValue([aggregated(A1, 1, 400), aggregated(A1, 2, 100)]);

    const result = await calculateProfits(
      [{
        userId: U_A1, role: "agent", currency: "AED",
        periods: [{ startDate: "2027-01-01", endDate: "2027-01-31" }, { startDate: "2027-02-01", endDate: "2027-12-31" }],
      }],
      2027,
    );
    const agent = result.get(profitOwnerKey("agent", U_A1))!;

    expect(agent.periods.map((p) => [p.startDate, p.profit, p.revenue, p.invoicesPaid])).toEqual([
      ["2027-01-01", 400, 500, 1],
      ["2027-02-01", 100, 125, 1],
    ]);
  });

  it("adds the agent's placements and new employers as drivers", async () => {
    invoiceAggregate.mockResolvedValue([]);

    const result = await calculateProfits([{ userId: U_A1, role: "agent", currency: "AED" }], 2026);
    const agent = result.get(profitOwnerKey("agent", U_A1))!;

    expect(agent.totals.placements).toBe(1);
    expect(agent.totals.newEmployers).toBe(2);
    expect(agent.months[2].placements).toBe(1);
    expect(agent.totals.profit).toBe(0);
  });

  it("returns twelve zeroed months for someone with no agent profile, without querying invoices for nobody", async () => {
    agentFind.mockImplementation(() => chain([]));
    superAgentFind.mockImplementation(() => chain([]));
    employerFind.mockImplementation(() => chain([]));
    placementAggregate.mockResolvedValue([]);
    employerAggregate.mockResolvedValue([]);

    const result = await calculateProfits([{ userId: U_A1, role: "agent", currency: "AED" }], 2026);
    const agent = result.get(profitOwnerKey("agent", U_A1))!;

    expect(agent.months).toHaveLength(12);
    expect(agent.totals.profit).toBe(0);
    expect(invoiceAggregate).not.toHaveBeenCalled();
  });
});
