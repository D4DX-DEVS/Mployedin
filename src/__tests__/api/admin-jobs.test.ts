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

const chainable = {
  sort: jest.fn(),
  skip: jest.fn(),
  limit: jest.fn(),
  populate: jest.fn(),
  lean: jest.fn(),
};

Object.values(chainable).forEach((fn) => (fn as jest.Mock).mockReturnThis());
(chainable.lean as jest.Mock).mockResolvedValue([
  {
    _id: "job_active_001",
    title: "Active placement role",
    status: "active",
    applicantIds: [],
  },
  {
    _id: "job_closed_001",
    title: "Closed placement role",
    status: "closed",
    applicantIds: [],
  },
]);

jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: {
    find: jest.fn().mockReturnValue(chainable),
    countDocuments: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock("@/models/Employer", () => ({
  __esModule: true,
  default: {
    exists: jest.fn(),
    findOne: jest.fn(),
  },
}));

jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(),
  },
}));

function makeRequest(url: string): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`);
}

describe("Admin Jobs API", () => {
  const Job = require("@/models/Job").default;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("GET /api/admin/jobs keeps invoice lookup open to non-active jobs when status is omitted", async () => {
    const { GET } = await import("@/app/api/admin/jobs/route");
    const req = makeRequest("/api/admin/jobs?limit=25&page=1");

    const res = await GET(req, { params: Promise.resolve({}) });

    expect(res.status).toBe(200);
    const query = Job.find.mock.calls[0][0];
    expect(query.status).toBeUndefined();

    const payload = await res.json();
    // Approval queue retired: no per-job approvalStatus flag and no approvalCounts tiles.
    expect(payload).not.toHaveProperty("approvalCounts");
    expect(payload.jobs.every((j: Record<string, unknown>) => !("approvalStatus" in j))).toBe(true);
    expect(payload.jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ _id: "job_active_001", status: "active" }),
        expect.objectContaining({ _id: "job_closed_001", status: "closed" }),
      ]),
    );
  });

  it("GET /api/admin/jobs?expiring=7d lists active jobs closing within a week, as the dashboard counts them", async () => {
    const { GET } = await import("@/app/api/admin/jobs/route");
    const before = Date.now();

    const res = await GET(makeRequest("/api/admin/jobs?expiring=7d"), { params: Promise.resolve({}) });

    expect(res.status).toBe(200);
    const query = Job.find.mock.calls[0][0];
    expect(query.status).toBe("active");
    expect(query.deletedAt).toBeNull();
    const window = query.expiresAt.$lte.getTime() - query.expiresAt.$gte.getTime();
    expect(window).toBe(7 * 24 * 60 * 60 * 1000);
    expect(query.expiresAt.$gte.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("GET /api/admin/jobs ignores an unknown expiring window", async () => {
    const { GET } = await import("@/app/api/admin/jobs/route");

    await GET(makeRequest("/api/admin/jobs?expiring=365d"), { params: Promise.resolve({}) });

    expect(Job.find.mock.calls[0][0].expiresAt).toBeUndefined();
  });
});