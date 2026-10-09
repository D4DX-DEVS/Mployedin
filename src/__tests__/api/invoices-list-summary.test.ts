/**
 * @jest-environment node
 *
 * INV-01: the invoice list's "Pending" strip and the Analytics tab on the same
 * page must mean the same thing. BUG-02: an invoice awaiting approval carries
 * a real balance due, so pending_approval counts as Pending (only drafts are
 * not yet receivables).
 */

import { NextRequest } from "next/server";
import { PENDING_BALANCE_INVOICE_STATUSES } from "@/lib/invoices/status";

const aggregateMock = jest.fn();

jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function) => handler,
}));

jest.mock("@/models/Invoice", () => {
  const chain = {
    populate: () => chain,
    sort: () => chain,
    skip: () => chain,
    limit: () => chain,
    lean: () => Promise.resolve([]),
    cast: () => ({}),
  };
  return {
    __esModule: true,
    default: {
      find: () => chain,
      countDocuments: () => Promise.resolve(0),
      aggregate: (...args: unknown[]) => aggregateMock(...args),
    },
  };
});

jest.mock("@/models/Employer", () => ({ __esModule: true, default: { find: jest.fn() } }));
jest.mock("@/models/Job", () => ({ __esModule: true, default: { find: jest.fn() } }));
jest.mock("@/models/SuperAgent", () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: { findOne: () => ({ select: () => ({ lean: () => Promise.resolve(null) }) }) },
}));

type Stage = { $match?: unknown; $group?: Record<string, unknown> };

const CURRENCY_ID = { $ifNull: ["$currency", "AED"] };

beforeEach(() => {
  aggregateMock.mockReset();
  aggregateMock.mockImplementation((pipeline: Stage[]) => {
    const group = pipeline.find((stage) => stage.$group)?.$group;
    if (group?._id === "$status") {
      return Promise.resolve([
        { _id: "pending_approval", total: 322, count: 1, taxTotal: 0, paidTotal: 0, balanceTotal: 322 },
        { _id: "issued", total: 1000, count: 1, taxTotal: 0, paidTotal: 400, balanceTotal: 600 },
        { _id: "void", total: 25000, count: 1, taxTotal: 0, paidTotal: 0, balanceTotal: 25000 },
      ]);
    }
    return Promise.resolve([{ _id: "AED", total: 1322, count: 2, paidTotal: 400, balanceTotal: 600 }]);
  });
});

async function listSummary() {
  const { GET } = await import("@/app/api/invoices/route");
  const res = await (GET as Function)(new NextRequest("http://localhost/api/invoices"), {
    userId: "agent-user",
    role: "agent",
    locale: "en",
  });
  return (await res.json()).summary;
}

describe("GET /api/invoices summary", () => {
  it("counts payable + pending_approval invoices as pending, like the Analytics tab", async () => {
    const summary = await listSummary();

    expect(summary.totalBalance).toBe(922);
  });

  it("keeps void out of the money totals and every status in the counts", async () => {
    const summary = await listSummary();

    expect(summary.totalAmount).toBe(1322);
    expect(summary.totalCount).toBe(3);
    expect(summary.counts.void).toBe(1);
  });

  it("sums the per-currency pending balance over pending-balance invoices", async () => {
    await listSummary();

    const currencyPipeline = aggregateMock.mock.calls
      .map(([pipeline]) => pipeline as Stage[])
      .find((pipeline) => JSON.stringify(pipeline.find((s) => s.$group)?.$group?._id) === JSON.stringify(CURRENCY_ID));
    const balance = currencyPipeline?.find((s) => s.$group)?.$group?.balanceTotal;

    expect(balance).toEqual({
      $sum: { $cond: [{ $in: ["$status", [...PENDING_BALANCE_INVOICE_STATUSES]] }, "$balanceDue", 0] },
    });
  });
});
