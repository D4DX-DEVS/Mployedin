/**
 * @jest-environment node
 *
 * The bulk scheduler's collision guard queried by `employerId` alone, so it
 * only ever protected the booking company's own calendar. A candidate who
 * already had an interview with a *different* employer — the common case for
 * anyone actively job hunting, and the whole point of a multi-employer
 * platform — could be booked straight over it.
 *
 * Both calendars matter, and the guard slides the slot forward rather than
 * failing the row.
 */
import { NextRequest } from "next/server";

const createdInterviews: Record<string, unknown>[] = [];
/** Rows the collision probe finds. Keyed by nothing — the query shape is asserted separately. */
let nearbyRows: { scheduledAt: Date; duration?: number }[] = [];
let lastFindQuery: Record<string, unknown> | null = null;

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function) => async (req: NextRequest) =>
    handler(req, { userId: "user_001", role: "employer", locale: "en" }),
}));

jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimitDual: jest.fn(() => ({ allowed: true, remaining: 10, resetAt: Date.now() + 60000 })),
  RATE_LIMIT_CONFIGS: { bulk: { maxRequests: 10, windowMs: 60000 } },
}));

jest.mock("@/lib/audit/log", () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
  actorFromCtx: jest.fn(() => ({})),
}));

jest.mock("@/lib/notifications/trigger", () => ({
  notifyInterviewScheduled: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock("@/models/Interview", () => ({
  __esModule: true,
  default: {
    create: jest.fn(async (data: Record<string, unknown>) => {
      const doc = { ...data, _id: `iv_${createdInterviews.length + 1}` };
      createdInterviews.push(doc);
      return doc;
    }),
    findOne: jest.fn(() => ({ select: () => ({ lean: async () => null }) })),
    find: jest.fn((q: Record<string, unknown>) => {
      lastFindQuery = q;
      // Rows belong to the CANDIDATE, at another employer. A probe scoped to
      // this employer alone must therefore come back empty — that is what
      // makes the slide test prove the candidate path and not the old one.
      const scopedToCandidate = JSON.stringify(q).includes("jobSeekerId");
      return { select: () => ({ lean: async () => (scopedToCandidate ? nearbyRows : []) }) };
    }),
  },
}));

const mockApplication = {
  jobId: { _id: "job_001", title: "React Developer" },
  jobSeekerId: "64b000000000000000000040",
  employerId: "emp_001",
};

jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(() => ({
      select: () => ({
        populate: () => ({ lean: async () => mockApplication }),
        lean: async () => mockApplication,
      }),
    })),
    findByIdAndUpdate: jest.fn(async () => ({})),
  },
}));

jest.mock("@/models/Employer", () => ({
  Employer: {
    findOne: jest.fn(() => ({ select: () => ({ lean: async () => ({ _id: "emp_001" }) }) })),
    findById: jest.fn(() => ({ select: () => ({ lean: async () => ({ agentId: null }) }) })),
  },
}));

jest.mock("@/models/Agent", () => ({
  Agent: { findOne: jest.fn(() => ({ select: () => ({ lean: async () => null }) })) },
}));

jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(() => ({ select: () => ({ lean: async () => ({ userId: "user_seeker_001" }) }) })),
  },
}));

// Real implementation hits mongoose for the employer's own id.
jest.mock("@/lib/auth/agentRestrictions", () => ({
  getScopedEmployerIds: jest.fn(async () => [{ toString: () => "emp_001" }]),
}));

import { POST as _POST } from "@/app/api/interviews/bulk/route";

const POST = _POST as unknown as (req: NextRequest) => Promise<Response>;

/** 2026-10-05 is a Monday; 09:00 Dubai sits inside any sane working window. */
const START = "2026-10-05T05:00:00.000Z";
const APP_ID = "64b000000000000000000030";
const SEEKER_ID = "64b000000000000000000040";

function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/interviews/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("bulk scheduling respects the candidate's calendar", () => {
  beforeEach(() => {
    createdInterviews.length = 0;
    nearbyRows = [];
    lastFindQuery = null;
    jest.clearAllMocks();
  });

  it("looks for clashes on the candidate's calendar, not only the employer's", async () => {
    await POST(
      request({
        candidates: [{ jobSeekerId: SEEKER_ID, applicationId: APP_ID }],
        scheduledAt: START,
        duration: 30,
        type: "video",
      }),
    );

    expect(lastFindQuery).not.toBeNull();
    const q = JSON.stringify(lastFindQuery);
    expect(q).toContain("jobSeekerId");
  });

  it("slides the slot past an interview the candidate has elsewhere", async () => {
    // Candidate already booked across the requested 09:00 slot.
    nearbyRows = [{ scheduledAt: new Date(START), duration: 30 }];

    await POST(
      request({
        candidates: [{ jobSeekerId: SEEKER_ID, applicationId: APP_ID }],
        scheduledAt: START,
        duration: 30,
        type: "video",
      }),
    );

    expect(createdInterviews).toHaveLength(1);
    const booked = new Date(createdInterviews[0].scheduledAt as Date).getTime();
    expect(booked).toBeGreaterThanOrEqual(new Date(START).getTime() + 30 * 60_000);
  });
});
