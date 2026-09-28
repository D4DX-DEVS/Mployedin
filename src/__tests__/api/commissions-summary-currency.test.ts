/**
 * @jest-environment node
 *
 * GET /api/commissions summary: lines keep their invoice's currency and nothing
 * converts, so the totals come per currency (`byCurrency`, largest first). The
 * old single figures stay for the agent page.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/config", () => ({ auth: jest.fn() }));

const aggregate = jest.fn();
const chain = { populate: () => chain, sort: () => chain, skip: () => chain, limit: () => chain, lean: async () => [] };
jest.mock("@/models/Commission", () => ({
  __esModule: true,
  default: { find: () => chain, countDocuments: async () => 3, aggregate: (...a: unknown[]) => aggregate(...a) },
}));
jest.mock("@/models/SystemSettings", () => ({
  __esModule: true,
  default: { findOne: () => ({ lean: async () => ({ defaultCurrency: "AED" }) }) },
}));

describe("commissions summary per currency", () => {
  const { auth } = jest.requireMock("@/lib/auth/config") as { auth: jest.Mock };
  beforeEach(() => {
    auth.mockResolvedValue({ user: { id: "admin_001", role: "admin", locale: "en" } });
    aggregate.mockResolvedValue([
      { _id: { status: "pending", currency: "AED" }, total: 1200, count: 1 },
      { _id: { status: "pending", currency: "INR" }, total: 6000, count: 1 },
      { _id: { status: "paid", currency: "INR" }, total: 900, count: 1 },
    ]);
  });

  it("groups by status and currency and never adds AED to INR per currency", async () => {
    const { GET } = await import("@/app/api/commissions/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/commissions"), { params: Promise.resolve({}) });
    const { summary } = await res.json();

    expect(aggregate.mock.calls[0][0][1].$group._id).toEqual({ status: "$status", currency: "$currency" });
    expect(summary.byCurrency).toEqual([
      { currency: "INR", pending: 6000, approved: 0, paid: 900, disputed: 0, clawed_back: 0 },
      { currency: "AED", pending: 1200, approved: 0, paid: 0, disputed: 0, clawed_back: 0 },
    ]);
    expect(summary.counts).toEqual({ pending: 2, approved: 0, paid: 1, disputed: 0, clawed_back: 0 });
    // Kept for the agent page.
    expect(summary.pending).toBe(7200);
  });
});
