/**
 * @jest-environment node
 */
import { NextRequest, NextResponse } from "next/server";
import { withSubscription } from "@/lib/subscription/withSubscription";
import Subscription from "@/models/Subscription";
import connectDB from "@/lib/db/mongoose";

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock("@/lib/db/mongoose", () => jest.fn().mockResolvedValue(undefined));

jest.mock("@/models/Subscription", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  },
}));

// Mock grace period — defaults to NOT in grace period (so existing tests keep 403 behavior)
jest.mock("@/lib/subscription/gracePeriod", () => ({
  isInGracePeriod: jest.fn().mockResolvedValue(false),
  getGracePeriodEmployerLimits: jest.fn(),
  getGracePeriodJobSeekerLimits: jest.fn(),
}));

const mockFindOne = Subscription.findOne as jest.Mock;
const mockFindByIdAndUpdate = Subscription.findByIdAndUpdate as jest.Mock;

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(url = "http://localhost/api/test"): NextRequest {
  return new NextRequest(new URL(url));
}

const mockHandler = jest.fn().mockResolvedValue(NextResponse.json({ ok: true }));

const employerCtx = { userId: "u1", role: "employer" as const, locale: "en" };
const adminCtx = { userId: "u2", role: "admin" as const, locale: "en" };
const agentCtx = { userId: "u3", role: "agent" as const, locale: "en" };
const jobSeekerCtx = { userId: "u4", role: "job_seeker" as const, locale: "en" };

const activeSub = {
  _id: "sub1",
  userId: "u1",
  status: "active",
  planSnapshot: {
    employerLimits: {
      maxActiveJobs: 5,
      maxApplicationsViewPerMonth: 50,
      maxTeamMembers: 3,
      aiFeatures: [
        { feature: "ai_chat", enabled: true, monthlyLimit: 20 },
        { feature: "ai_cv_extraction", enabled: true, monthlyLimit: 0 },
        { feature: "ai_voice_input", enabled: false, monthlyLimit: 10 },
      ],
      dataExport: true,
      commTemplates: false,
    },
  },
  usage: {
    activeJobs: 3,
    applicationsViewed: 10,
    aiUsage: { ai_chat: 5 },
  },
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("withSubscription", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Bypass roles ─────────────────────────────────────────────────────────

  describe("bypass roles", () => {
    test("admin bypasses all gates", async () => {
      const wrapped = withSubscription(mockHandler, { type: "ai", feature: "ai_chat" });
      const req = makeReq();
      await wrapped(req, adminCtx);
      expect(mockHandler).toHaveBeenCalledWith(req, adminCtx, undefined);
      expect(connectDB).not.toHaveBeenCalled();
    });

    test("agent bypasses all gates", async () => {
      const wrapped = withSubscription(mockHandler, { type: "limit", feature: "activeJobs" });
      const req = makeReq();
      await wrapped(req, agentCtx);
      expect(mockHandler).toHaveBeenCalledWith(req, agentCtx, undefined);
    });

    test("super_agent bypasses all gates", async () => {
      const saCtx = { userId: "sa1", role: "super_agent" as const, locale: "en" };
      const wrapped = withSubscription(mockHandler, { type: "toggle", feature: "dataExport" });
      const req = makeReq();
      await wrapped(req, saCtx);
      expect(mockHandler).toHaveBeenCalledWith(req, saCtx, undefined);
    });
  });

  // ── No subscription ──────────────────────────────────────────────────────

  describe("no subscription", () => {
    test("returns 403 SUBSCRIPTION_REQUIRED when not in grace period", async () => {
      mockFindOne.mockResolvedValue(null);
      const wrapped = withSubscription(mockHandler, { type: "ai", feature: "ai_chat" });
      const res = await wrapped(makeReq(), employerCtx);
      const body = await res.json();
      expect(res.status).toBe(403);
      expect(body.error).toBe("SUBSCRIPTION_REQUIRED");
      expect(mockHandler).not.toHaveBeenCalled();
    });

    test("allows access during grace period when no subscription", async () => {
      mockFindOne.mockResolvedValue(null);
      // Override the grace period mock for this test
      const { isInGracePeriod } = require("@/lib/subscription/gracePeriod");
      (isInGracePeriod as jest.Mock).mockResolvedValueOnce(true);

      const wrapped = withSubscription(mockHandler, { type: "ai", feature: "ai_chat" });
      const res = await wrapped(makeReq(), employerCtx);
      expect(mockHandler).toHaveBeenCalled();
      const body = await res.json();
      expect(body.ok).toBe(true);
    });
  });

  // ── AI feature checks ───────────────────────────────────────────────────

  describe("AI feature checks", () => {
    test("allows enabled feature within limit and increments usage", async () => {
      mockFindOne.mockResolvedValue(activeSub);
      mockFindByIdAndUpdate.mockResolvedValue(null);
      const wrapped = withSubscription(mockHandler, { type: "ai", feature: "ai_chat" });
      const res = await wrapped(makeReq(), employerCtx);
      expect(mockHandler).toHaveBeenCalled();
      expect(mockFindByIdAndUpdate).toHaveBeenCalledWith("sub1", {
        $inc: { "usage.aiUsage.ai_chat": 1 },
      });
    });

    test("allows unlimited AI feature (monthlyLimit=0)", async () => {
      mockFindOne.mockResolvedValue(activeSub);
      mockFindByIdAndUpdate.mockResolvedValue(null);
      const wrapped = withSubscription(mockHandler, { type: "ai", feature: "ai_cv_extraction" });
      await wrapped(makeReq(), employerCtx);
      expect(mockHandler).toHaveBeenCalled();
    });

    test("blocks disabled AI feature with 403", async () => {
      mockFindOne.mockResolvedValue(activeSub);
      const wrapped = withSubscription(mockHandler, { type: "ai", feature: "ai_voice_input" });
      const res = await wrapped(makeReq(), employerCtx);
      const body = await res.json();
      expect(res.status).toBe(403);
      expect(body.error).toBe("FEATURE_DISABLED");
      expect(mockHandler).not.toHaveBeenCalled();
    });

    test("blocks when limit exceeded with 429", async () => {
      const subAtLimit = {
        ...activeSub,
        usage: { ...activeSub.usage, aiUsage: { ai_chat: 20 } },
      };
      mockFindOne.mockResolvedValue(subAtLimit);
      const wrapped = withSubscription(mockHandler, { type: "ai", feature: "ai_chat" });
      const res = await wrapped(makeReq(), employerCtx);
      const body = await res.json();
      expect(res.status).toBe(429);
      expect(body.error).toBe("LIMIT_EXCEEDED");
      expect(body.limit).toBe(20);
      expect(body.used).toBe(20);
    });
  });

  // ── Numeric limit checks ────────────────────────────────────────────────

  describe("numeric limit checks", () => {
    test("allows when under limit", async () => {
      mockFindOne.mockResolvedValue(activeSub);
      const wrapped = withSubscription(mockHandler, { type: "limit", feature: "activeJobs" });
      await wrapped(makeReq(), employerCtx);
      expect(mockHandler).toHaveBeenCalled();
    });

    test("blocks when at limit with 429", async () => {
      const subAtLimit = { ...activeSub, usage: { ...activeSub.usage, activeJobs: 5 } };
      mockFindOne.mockResolvedValue(subAtLimit);
      const wrapped = withSubscription(mockHandler, { type: "limit", feature: "activeJobs" });
      const res = await wrapped(makeReq(), employerCtx);
      const body = await res.json();
      expect(res.status).toBe(429);
      expect(body.error).toBe("LIMIT_EXCEEDED");
    });

    test("allows unlimited (-1)", async () => {
      const unlimitedSub = {
        ...activeSub,
        planSnapshot: {
          employerLimits: { ...activeSub.planSnapshot.employerLimits, maxActiveJobs: -1 },
        },
      };
      mockFindOne.mockResolvedValue(unlimitedSub);
      const wrapped = withSubscription(mockHandler, { type: "limit", feature: "activeJobs" });
      await wrapped(makeReq(), employerCtx);
      expect(mockHandler).toHaveBeenCalled();
    });

    test("passes through for unknown limit feature", async () => {
      mockFindOne.mockResolvedValue(activeSub);
      const wrapped = withSubscription(mockHandler, { type: "limit", feature: "unknownFeature" as never });
      await wrapped(makeReq(), employerCtx);
      expect(mockHandler).toHaveBeenCalled();
    });
  });

  // ── Toggle checks ────────────────────────────────────────────────────────

  describe("toggle checks", () => {
    test("allows enabled toggle", async () => {
      mockFindOne.mockResolvedValue(activeSub);
      const wrapped = withSubscription(mockHandler, { type: "toggle", feature: "dataExport" });
      await wrapped(makeReq(), employerCtx);
      expect(mockHandler).toHaveBeenCalled();
    });

    test("blocks disabled toggle with 403", async () => {
      mockFindOne.mockResolvedValue(activeSub);
      const wrapped = withSubscription(mockHandler, { type: "toggle", feature: "commTemplates" });
      const res = await wrapped(makeReq(), employerCtx);
      const body = await res.json();
      expect(res.status).toBe(403);
      expect(body.error).toBe("FEATURE_DISABLED");
    });
  });

  // ── Job seeker role mapping ──────────────────────────────────────────────

  describe("role mapping", () => {
    test("job_seeker maps to job_seeker targetRole", async () => {
      mockFindOne.mockResolvedValue(null);
      const wrapped = withSubscription(mockHandler, { type: "ai", feature: "ai_chat" });
      await wrapped(makeReq(), jobSeekerCtx);
      expect(mockFindOne).toHaveBeenCalledWith({
        userId: "u4",
        targetRole: "job_seeker",
        status: "active",
      });
    });
  });
});
