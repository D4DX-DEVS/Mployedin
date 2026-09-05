/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 1000 }),
  RATE_LIMIT_CONFIGS: {},
}));
jest.mock("@/lib/security/clientIp", () => ({ getClientIp: jest.fn(() => "10.0.0.1") }));

const referralFindOne = jest.fn();
jest.mock("@/models/ReferralLink", () => ({
  __esModule: true,
  default: { findOne: (...a: unknown[]) => referralFindOne(...a) },
}));
const agentFindOne = jest.fn();
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findOne: (...a: unknown[]) => agentFindOne(...a) } }));
jest.mock("@/models/SuperAgent", () => ({ __esModule: true, default: { findOne: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(null) })) } }));
jest.mock("@/models/User", () => ({ __esModule: true, default: {} }));

const lean = (v: unknown) => ({ lean: jest.fn().mockResolvedValue(v) });

describe("GET /api/referral/validate — public oracle exposes validity only", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns only { valid: true } for a live referral link (no creator role)", async () => {
    referralFindOne.mockReturnValue(lean({ code: "MPL-ABCD1234", isActive: true, maxUses: 0, usedCount: 3, creatorRole: "agent" }));
    const { GET } = await import("@/app/api/referral/validate/route");

    const res = await GET(new NextRequest("http://localhost:3000/api/referral/validate?code=MPL-ABCD1234"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ valid: true });
  });

  it("reports an exhausted link as invalid with a reason and nothing else", async () => {
    referralFindOne.mockReturnValue(lean({ code: "MPL-FULL0000", isActive: true, maxUses: 2, usedCount: 2, creatorRole: "super_agent" }));
    const { GET } = await import("@/app/api/referral/validate/route");

    const res = await GET(new NextRequest("http://localhost:3000/api/referral/validate?code=MPL-FULL0000"));
    expect(await res.json()).toEqual({ valid: false, reason: "max_reached" });
  });

  it("returns only { valid: true } for a legacy agent code", async () => {
    referralFindOne.mockReturnValue(lean(null));
    agentFindOne.mockReturnValue(lean({ _id: "agent_1", referralCode: "LEGACY1" }));
    const { GET } = await import("@/app/api/referral/validate/route");

    const res = await GET(new NextRequest("http://localhost:3000/api/referral/validate?code=LEGACY1"));
    expect(await res.json()).toEqual({ valid: true });
  });
});
