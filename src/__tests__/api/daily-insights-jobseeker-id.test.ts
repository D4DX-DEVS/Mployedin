/**
 * @jest-environment node
 */
/**
 * JOBSEEKER-FIX-PLAN J2 — ai/daily-insights must query Application by the
 * resolved JobSeeker profile _id, not ctx.userId (the User id). Previously
 * this always found 0 recent applications for every job seeker.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function) => async (req: NextRequest) =>
    handler(req, (req as unknown as { __ctx: unknown }).__ctx),
}));

jest.mock("@/lib/subscription/featureGate", () => ({
  enforceFeatureGate: jest.fn(async () => null),
}));

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimitDual: jest.fn(async () => ({ allowed: true, resetAt: Date.now() + 60000 })),
  RATE_LIMIT_CONFIGS: { ai: { limit: 10, windowSec: 60 } },
}));

jest.mock("@/lib/ai/router", () => ({
  routeGenerate: jest.fn(async () => "[]"),
}));

jest.mock("@/lib/ai/sanitize", () => ({
  redactPII: (t: string) => t,
}));

jest.mock("@/models/Job", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/Employer", () => ({ __esModule: true, Employer: { findOne: jest.fn() } }));

const SEEKER_PROFILE_ID = "seeker_profile_1";

jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: { findOne: jest.fn(() => ({ lean: async () => ({ _id: SEEKER_PROFILE_ID, skills: [] }) })) },
}));

const findSpy = jest.fn((_query: { jobSeekerId: string }) => ({
  lean: async () => [{ _id: "app1" }, { _id: "app2" }],
}));

jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: { find: (query: { jobSeekerId: string }) => findSpy(query), countDocuments: jest.fn() },
}));

import { GET as _GET } from "@/app/api/ai/daily-insights/route";

const GET = _GET as unknown as (req: NextRequest) => Promise<Response>;

function getReq() {
  const req = new NextRequest("http://localhost:3000/api/ai/daily-insights");
  (req as unknown as { __ctx: unknown }).__ctx = { userId: "user_1", role: "job_seeker", locale: "en" };
  return req;
}

describe("GET /api/ai/daily-insights — job seeker id resolution", () => {
  it("queries Application.find with the JobSeeker profile _id, not the User id", async () => {
    await GET(getReq());
    expect(findSpy).toHaveBeenCalledTimes(1);
    const query = findSpy.mock.calls[0][0];
    expect(query.jobSeekerId).toBe(SEEKER_PROFILE_ID);
    expect(query.jobSeekerId).not.toBe("user_1");
  });
});
