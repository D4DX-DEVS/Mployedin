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

type UnwindStage = { $unwind?: string | { path?: string; preserveNullAndEmptyArrays?: boolean } };

/** The participation pipeline unwinds an array field; every other pipeline here does not. */
function hasParticipationUnwind(pipeline: UnwindStage[]): boolean {
  return pipeline.some((stage) => {
    const unwind = stage.$unwind;
    if (typeof unwind === "string") return unwind === "$participationTypes";
    return unwind?.path === "$participationTypes";
  });
}

describe("Exhibitions Analytics API", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    aggregateMock.mockImplementation((pipeline: UnwindStage[]) => {
      if (hasParticipationUnwind(pipeline)) {
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
    expect(aggregateMock.mock.calls.some(([pipeline]) => hasParticipationUnwind(pipeline))).toBe(true);
  });

  it("keeps requests that selected no participation style instead of dropping them", async () => {
    const { GET } = await import("@/app/api/exhibitions/analytics/route");
    const request = new NextRequest("http://localhost/api/exhibitions/analytics?year=2026");

    await (GET as Function)(request, { userId: "admin_001", role: "admin" });

    const participationPipeline = aggregateMock.mock.calls
      .map(([pipeline]) => pipeline as UnwindStage[])
      .find((pipeline) => hasParticipationUnwind(pipeline));

    expect(participationPipeline).toBeDefined();
    const unwind = participationPipeline!.find((stage) => stage.$unwind)!.$unwind;
    expect(unwind).toEqual({ path: "$participationTypes", preserveNullAndEmptyArrays: true });
  });

  it("excludes soft-deleted requests from every aggregation", async () => {
    const { GET } = await import("@/app/api/exhibitions/analytics/route");
    const request = new NextRequest("http://localhost/api/exhibitions/analytics?year=2026");

    await (GET as Function)(request, { userId: "admin_001", role: "admin" });

    for (const [pipeline] of aggregateMock.mock.calls) {
      const match = (pipeline as Array<{ $match?: Record<string, unknown> }>).find((stage) => stage.$match);
      // The ExhibitionPerformance pipeline matches on joined fields, not the request itself.
      if (!match?.$match || "exhibition.createdAt" in match.$match) continue;
      expect(match.$match).toMatchObject({ isDeleted: { $ne: true } });
    }
    expect(countDocumentsMock).toHaveBeenCalledWith(expect.objectContaining({ isDeleted: { $ne: true } }));
  });

  it("reports pipeline buckets that partition the request total", async () => {
    aggregateMock.mockImplementation((pipeline: UnwindStage[]) => {
      if (hasParticipationUnwind(pipeline)) return Promise.resolve([]);
      const grouped = (pipeline as Array<{ $group?: { _id?: unknown } }>).find((stage) => stage.$group);
      if (grouped?.$group?._id === "$status") {
        return Promise.resolve([
          { _id: "draft", count: 4 },
          { _id: "submitted", count: 2 },
          { _id: "under_review", count: 1 },
          { _id: "approved", count: 2 },
          { _id: "completed", count: 1 },
          { _id: "rejected", count: 1 },
        ]);
      }
      return Promise.resolve([]);
    });
    countDocumentsMock.mockResolvedValue(11);

    const { GET } = await import("@/app/api/exhibitions/analytics/route");
    const request = new NextRequest("http://localhost/api/exhibitions/analytics?year=2026");
    const response = await (GET as Function)(request, { userId: "admin_001", role: "admin" });
    const { kpis } = await response.json();

    // approved (3) counts completed too, so the pipeline row uses approvedInProgress (2).
    expect(kpis.approved).toBe(3);
    expect(kpis.approvedInProgress).toBe(2);
    expect(kpis.other).toBe(4);
    expect(
      kpis.submitted + kpis.underReview + kpis.approvedInProgress + kpis.completed + kpis.rejected + kpis.other,
    ).toBe(kpis.totalRequests);
    // approved / (approved + rejected) — the decided denominator, not the total.
    expect(kpis.decided).toBe(4);
    expect(kpis.approvalRate).toBe(75);
  });
});