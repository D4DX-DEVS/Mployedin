/**
 * @jest-environment node
 */
/**
 * JOBSEEKER-FIX-PLAN J3 — profile-boost must route through enforceFeatureGate
 * (so it auto-enforces once payment/subscription gating is switched on) and
 * grant atomically (no double-grant from concurrent POSTs).
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function) => async (req: NextRequest) =>
    handler(req, (req as unknown as { __ctx: unknown }).__ctx),
}));

const enforceFeatureGate = jest.fn(async (_userId: string, _role: string, _check: unknown) => null as unknown);
jest.mock("@/lib/subscription/featureGate", () => ({
  enforceFeatureGate: (userId: string, role: string, check: unknown) => enforceFeatureGate(userId, role, check),
}));

const findOneAndUpdate = jest.fn(async (_filter: unknown, _update: unknown) => ({ _id: "seeker_1" }) as { _id: string } | null);
const findOne = jest.fn(() => ({ select: () => ({ lean: async () => ({ profileBoostedUntil: null }) }) }));

jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    findOneAndUpdate: (filter: unknown, update: unknown) => findOneAndUpdate(filter, update),
    findOne: () => findOne(),
  },
}));

import { POST as _POST } from "@/app/api/job-seeker/profile-boost/route";

const POST = _POST as unknown as (req: NextRequest) => Promise<Response>;

function postReq() {
  const req = new NextRequest("http://localhost:3000/api/job-seeker/profile-boost", { method: "POST" });
  (req as unknown as { __ctx: unknown }).__ctx = { userId: "u1", role: "job_seeker", locale: "en" };
  return req;
}

describe("POST /api/job-seeker/profile-boost", () => {
  beforeEach(() => jest.clearAllMocks());

  it("checks enforceFeatureGate with the profileVisibilityBoost toggle before boosting", async () => {
    findOneAndUpdate.mockResolvedValueOnce({ _id: "seeker_1" });
    await POST(postReq());
    expect(enforceFeatureGate).toHaveBeenCalledWith("u1", "job_seeker", { type: "toggle", feature: "profileVisibilityBoost" });
  });

  it("403s (via gate) when the feature gate blocks the request", async () => {
    const { NextResponse } = require("next/server");
    enforceFeatureGate.mockResolvedValueOnce(NextResponse.json({ error: "Upgrade required" }, { status: 403 }));
    const res = await POST(postReq());
    expect(res.status).toBe(403);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("400s when the atomic grant finds no eligible document (already boosted)", async () => {
    findOneAndUpdate.mockResolvedValueOnce(null);
    const res = await POST(postReq());
    expect(res.status).toBe(400);
  });
});
