/**
 * @jest-environment node
 *
 * Guards the two ways this route used to lie about money:
 *   1. Voided invoices were excluded from the KPI tiles but still summed into
 *      the monthly trend and category breakdown drawn right below them.
 *   2. Amounts in different currencies were added together and the result was
 *      labelled with the viewer's display-currency preference.
 */

import { NextRequest } from "next/server";

const invoiceAggregateMock = jest.fn();
const commissionAggregateMock = jest.fn();

jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined),
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function) => handler,
}));

jest.mock("@/models/Invoice", () => ({
  __esModule: true,
  default: { aggregate: invoiceAggregateMock },
}));

jest.mock("@/models/Commission", () => ({
  __esModule: true,
  default: { aggregate: commissionAggregateMock },
}));

jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));

jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));

type Pipeline = Array<{ $match?: Record<string, unknown>; $group?: { _id?: unknown } }>;

const NON_REVENUE = ["void", "cancelled", "refunded", "credit_note"];

/** Pipelines that read money out of the Invoice collection, keyed by what they group on. */
function pipelinesGroupedBy(id: unknown): Pipeline[] {
  return invoiceAggregateMock.mock.calls
    .map(([pipeline]) => pipeline as Pipeline)
    .filter((pipeline) => {
      const group = pipeline.find((stage) => stage.$group);
      return JSON.stringify(group?.$group?._id) === JSON.stringify(id);
    });
}

describe("Invoice analytics API", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    invoiceAggregateMock.mockImplementation((pipeline: Pipeline) => {
      const group = pipeline.find((stage) => stage.$group);
      // The currency-discovery pass runs first and decides which currency the
      // rest of the payload is denominated in.
      if (JSON.stringify(group?.$group?._id) === JSON.stringify({ $ifNull: ["$currency", "AED"] })) {
        return Promise.resolve([
          { _id: "AED", total: 25322, count: 3 },
          { _id: "INR", total: 900, count: 1 },
        ]);
      }
      if (group?.$group?._id === "$status") {
        return Promise.resolve([
          { _id: "issued", count: 1, totalAmount: 322, paidAmount: 0, balanceDue: 322, taxAmount: 0, refundedAmount: 0 },
        ]);
      }
      return Promise.resolve([]);
    });

    commissionAggregateMock.mockResolvedValue([]);
  });

  async function callRoute(url = "http://localhost/api/invoices/analytics?period=30d") {
    const { GET } = await import("@/app/api/invoices/analytics/route");
    const response = await (GET as Function)(new NextRequest(url), {
      userId: "admin_001",
      role: "admin",
      locale: "en",
    });
    return response.json();
  }

  it("reports the currency its figures are actually in, plus the alternatives", async () => {
    const data = await callRoute();

    expect(data.currency).toBe("AED");
    expect(data.currencies).toEqual(["AED", "INR"]);
  });

  it("honours an explicitly requested currency", async () => {
    const data = await callRoute("http://localhost/api/invoices/analytics?period=30d&currency=INR");

    expect(data.currency).toBe("INR");
    for (const [pipeline] of invoiceAggregateMock.mock.calls.slice(1)) {
      const match = (pipeline as Pipeline).find((stage) => stage.$match)?.$match;
      expect(match?.currency).toBe("INR");
    }
  });

  it("falls back to the default currency when the requested one has no invoices", async () => {
    const data = await callRoute("http://localhost/api/invoices/analytics?period=30d&currency=GBP");

    expect(data.currency).toBe("AED");
  });

  it("scopes every money aggregation to a single currency", async () => {
    await callRoute();

    // Call 0 is the currency discovery pass itself; everything after it must be scoped.
    for (const [pipeline] of invoiceAggregateMock.mock.calls.slice(1)) {
      const match = (pipeline as Pipeline).find((stage) => stage.$match)?.$match;
      expect(match).toHaveProperty("currency");
    }
  });

  it("excludes voided invoices from the monthly trend, not just the KPI tiles", async () => {
    await callRoute();

    const monthly = pipelinesGroupedBy({ year: { $year: "$createdAt" }, month: { $month: "$createdAt" } });
    expect(monthly).toHaveLength(1);
    expect(monthly[0].find((stage) => stage.$match)?.$match).toMatchObject({
      status: { $nin: NON_REVENUE },
    });
  });

  it("excludes voided invoices from the category breakdown", async () => {
    await callRoute();

    const byCategory = pipelinesGroupedBy("$category");
    expect(byCategory).toHaveLength(1);
    expect(byCategory[0].find((stage) => stage.$match)?.$match).toMatchObject({
      status: { $nin: NON_REVENUE },
    });
  });

  it("keeps voided invoices out of the KPI totals", async () => {
    const data = await callRoute();

    const byStatus = pipelinesGroupedBy("$status");
    expect(byStatus[0].find((stage) => stage.$match)?.$match).toMatchObject({
      status: { $nin: NON_REVENUE },
    });
    expect(data.kpi.totalRevenue).toBe(322);
  });

  it("counts only invoices that still owe money as overdue or ageing", async () => {
    await callRoute();

    const overdue = pipelinesGroupedBy(null);
    expect(overdue).toHaveLength(1);
    expect(overdue[0].find((stage) => stage.$match)?.$match).toMatchObject({ balanceDue: { $gt: 0 } });

    const aging = invoiceAggregateMock.mock.calls
      .map(([pipeline]) => pipeline as Array<Record<string, unknown>>)
      .filter((pipeline) => pipeline.some((stage) => "$bucket" in stage));
    expect(aging).toHaveLength(1);
    expect(aging[0][0].$match).toMatchObject({ balanceDue: { $gt: 0 } });
  });

  it("matches a customer's own invoices by ObjectId, since aggregate() does not cast", async () => {
    const { Types } = await import("mongoose");
    const employerUserId = "6a0000000000000000000001";
    const { GET } = await import("@/app/api/invoices/analytics/route");
    await (GET as Function)(new NextRequest("http://localhost/api/invoices/analytics"), {
      userId: employerUserId,
      role: "employer",
      locale: "en",
    });

    expect(invoiceAggregateMock).toHaveBeenCalled();
    for (const [pipeline] of invoiceAggregateMock.mock.calls) {
      const match = (pipeline as Pipeline).find((stage) => stage.$match)?.$match;
      expect(match?.userId).toBeInstanceOf(Types.ObjectId);
      expect(String(match?.userId)).toBe(employerUserId);
      // Drafts and invoices awaiting approval stay out of a customer's figures.
      expect(match?.$and).toEqual([{ status: { $nin: ["draft", "pending_approval"] } }]);
    }
  });
});
