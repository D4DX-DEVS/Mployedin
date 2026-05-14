/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";

const aggregateMock = jest.fn();
const countDocumentsMock = jest.fn();
const performanceAggregateMock = jest.fn();
const userLeanMock = jest.fn();
const userSelectMock = jest.fn(() => ({ lean: userLeanMock }));
const userFindMock = jest.fn(() => ({ select: userSelectMock }));

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function) => handler,
}));

jest.mock("@/models/ExhibitionRequest", () => ({
  __esModule: true,
  default: {
    aggregate: aggregateMock,
    countDocuments: countDocumentsMock,
  },
}));

jest.mock("@/models/ExhibitionPerformance", () => ({
  __esModule: true,
  default: {
    aggregate: performanceAggregateMock,
  },
}));

jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: {
    find: jest.fn(),
  },
}));

jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
  },
}));

jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    find: userFindMock,
  },
}));

describe("Exhibitions Analytics API", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    aggregateMock.mockImplementation((pipeline: Array<{ $unwind?: string }>) => {
      const hasParticipationUnwind = pipeline.some((stage) => stage.$unwind === "$participationTypes");

      if (hasParticipationUnwind) {
        return Promise.resolve([
          { _id: "stall", count: 2 },
          { _id: "sponsorship", count: 1 },
        ]);
      }

      return Promise.resolve([]);
    });

    countDocumentsMock.mockResolvedValue(3);
    performanceAggregateMock.mockResolvedValue([]);
    userLeanMock.mockResolvedValue([]);
  });

  it("returns 403 for unsupported roles", async () => {
    const { GET } = await import("@/app/api/exhibitions/analytics/route");
    const request = new NextRequest("http://localhost/api/exhibitions/analytics?year=2026");
    const context = { userId: "user_001", role: "job_seeker" };

    const response = await (GET as Function)(request, context);

    expect(response.status).toBe(403);
    expect(aggregateMock).not.toHaveBeenCalled();
  });

  it("unwinds participationTypes before aggregating participation breakdown", async () => {
    const { GET } = await import("@/app/api/exhibitions/analytics/route");
    const request = new NextRequest("http://localhost/api/exhibitions/analytics?year=2026");
    const context = { userId: "admin_001", role: "admin" };

    const response = await (GET as Function)(request, context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      year: 2026,
      kpis: expect.objectContaining({
        totalRequests: 3,
        submitted: 0,
        approved: 0,
        rejected: 0,
        completed: 0,
        approvalRate: 0,
      }),
      performance: expect.objectContaining({
        totalLeads: 0,
        totalEmployers: 0,
        totalCandidates: 0,
        totalHires: 0,
        totalRevenue: 0,
        totalCost: 0,
        roi: 0,
        eventsReported: 0,
      }),
      topAgents: [],
    });
    expect(data.monthly).toHaveLength(12);
    expect(data.monthly[0]).toMatchObject({ month: "Jan", total: 0 });
    expect(data.participation).toEqual([
      { type: "stall", count: 2 },
      { type: "sponsorship", count: 1 },
    ]);
    expect(
      aggregateMock.mock.calls.some(([pipeline]) =>
        pipeline.some((stage: { $unwind?: string }) => stage.$unwind === "$participationTypes"),
      ),
    ).toBe(true);
  });
});