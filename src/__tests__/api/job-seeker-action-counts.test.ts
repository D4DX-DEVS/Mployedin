/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

const SEEKER_USER = "64b000000000000000000001";
const SEEKER_ID = "64b000000000000000000002";
let role = "job_seeker";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) =>
    (req: NextRequest) => handler(req, { userId: SEEKER_USER, role, locale: "en" }),
}));
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: { findOne: jest.fn(() => ({ select: () => ({ lean: async () => ({ _id: SEEKER_ID }) }) })) },
}));

const offerCount = jest.fn(async (..._a: unknown[]) => 1);
const interviewCount = jest.fn(async (q: Record<string, unknown>) => (q.status === "confirmed" ? 3 : 2));
const applicationCount = jest.fn(async (q: Record<string, unknown>) => (q.status ? 8 : 27));

jest.mock("@/models/Offer", () => ({ __esModule: true, default: { countDocuments: (...a: unknown[]) => offerCount(...a) } }));
jest.mock("@/models/Interview", () => ({ __esModule: true, default: { countDocuments: (...a: unknown[]) => interviewCount(...(a as [Record<string, unknown>])) } }));
jest.mock("@/models/Application", () => ({ __esModule: true, default: { countDocuments: (...a: unknown[]) => applicationCount(...(a as [Record<string, unknown>])) } }));

async function call() {
  const { GET } = await import("@/app/api/job-seeker/action-counts/route");
  return GET(new NextRequest("http://localhost:3000/api/job-seeker/action-counts"), { params: Promise.resolve({}) } as never);
}

describe("GET /api/job-seeker/action-counts", () => {
  beforeEach(() => {
    role = "job_seeker";
    offerCount.mockClear();
    interviewCount.mockClear();
    applicationCount.mockClear();
  });

  it("returns account-wide application totals next to the existing counters", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      pendingOffers: 1,
      interviewsAwaitingResponse: 2,
      upcomingInterviews: 3,
      totalApplications: 27,
      activeApplications: 8,
    });
  });

  it("counts active applications as everything that is not hired, rejected or withdrawn", async () => {
    await call();
    expect(applicationCount).toHaveBeenCalledWith({ jobSeekerId: SEEKER_ID });
    expect(applicationCount).toHaveBeenCalledWith({
      jobSeekerId: SEEKER_ID,
      status: { $nin: ["hired", "rejected", "withdrawn"] },
    });
  });

  it("refuses every other role", async () => {
    role = "employer";
    const res = await call();
    expect(res.status).toBe(403);
    expect(applicationCount).not.toHaveBeenCalled();
  });
});
