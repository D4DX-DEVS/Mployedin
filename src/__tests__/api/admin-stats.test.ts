/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: { userId: string; role: "admin"; locale: string }) => Promise<Response>) => {
    return (req: NextRequest) => handler(req, { userId: "admin_user_001", role: "admin", locale: "en" });
  },
}));

const jobCountMock = jest.fn().mockResolvedValue(3);

jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    countDocuments: jest.fn().mockResolvedValue(10),
    aggregate: jest.fn().mockResolvedValue([{ _id: "employer", count: 4 }]),
  },
}));
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: { countDocuments: (...args: unknown[]) => jobCountMock(...args) },
}));
jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: { countDocuments: jest.fn().mockResolvedValue(7) },
}));
jest.mock("@/models/Interview", () => ({
  __esModule: true,
  default: { countDocuments: jest.fn().mockResolvedValue(2) },
}));

describe("GET /api/admin/stats — job approval queue retired", () => {
  it("does not report a pendingApprovals metric and never queries poster.approvalStatus", async () => {
    const { GET } = await import("@/app/api/admin/stats/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/admin/stats"), { params: Promise.resolve({}) });
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.jobs).toEqual(expect.objectContaining({ total: expect.any(Number), active: expect.any(Number) }));
    expect(payload.jobs).not.toHaveProperty("pendingApprovals");

    const approvalQueries = jobCountMock.mock.calls.filter(
      ([filter]) => filter && Object.prototype.hasOwnProperty.call(filter as object, "poster.approvalStatus"),
    );
    expect(approvalQueries).toHaveLength(0);
  });
});
