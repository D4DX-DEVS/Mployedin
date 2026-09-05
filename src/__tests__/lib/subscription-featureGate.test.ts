/**
 * @jest-environment node
 */
import { checkFeatureGate, getFeatureGateMap } from "@/lib/subscription/featureGate";
import Subscription from "@/models/Subscription";
import connectDB from "@/lib/db/mongoose";

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock("@/lib/db/mongoose", () => jest.fn().mockResolvedValue(undefined));

jest.mock("@/models/Subscription", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  },
}));

// Mock grace period — defaults to NOT in grace period (so no-sub tests still return SUBSCRIPTION_REQUIRED)
jest.mock("@/lib/subscription/gracePeriod", () => ({
  isInGracePeriod: jest.fn().mockResolvedValue(false),
  getGracePeriodEmployerLimits: jest.fn(),
  getGracePeriodJobSeekerLimits: jest.fn(),
}));

// Enforcement is ON for these tests so the gating logic actually runs.
// (In production it defaults to OFF — see enforcementFlag.ts.)
jest.mock("@/lib/subscription/enforcementFlag", () => ({
  isSubscriptionEnforcementEnabled: jest.fn().mockResolvedValue(true),
  clearSubscriptionEnforcementCache: jest.fn(),
}));

const mockFindOne = Subscription.findOne as jest.Mock;

// ── Fixtures ─────────────────────────────────────────────────────────────────

const baseSub = {
  userId: "user1",
  targetRole: "employer",
  status: "active",
  planSnapshot: {
    name: "Gold",
    tier: 2,
    employerLimits: {
      maxActiveJobs: 10,
      maxApplicationsViewPerMonth: 100,
      maxTeamMembers: 5,
      aiFeatures: [
        { feature: "ai_chat", enabled: true, monthlyLimit: 50 },
        { feature: "ai_cv_extraction", enabled: true, monthlyLimit: 0 }, // unlimited
        { feature: "ai_voice_input", enabled: false, monthlyLimit: 10 },
      ],
      analyticsLevel: "advanced",
      dataExport: true,
      commTemplates: true,
      scorecardEvaluations: false,
      matchingWeightCustomization: true,
      workflowCustomization: false,
    },
  },
  usage: {
    activeJobs: 5,
    applicationsViewed: 80,
    aiUsage: {
      ai_chat: 25,
      ai_cv_extraction: 100,
    },
  },
};

const jsSubFixture = {
  userId: "user2",
  targetRole: "job_seeker",
  status: "active",
  planSnapshot: {
    name: "Silver",
    tier: 1,
    jobSeekerLimits: {
      maxApplicationsPerMonth: 20,
      aiFeatures: [
        { feature: "ai_chat", enabled: true, monthlyLimit: 10 },
      ],
      profileVisibilityBoost: false,
      salaryInsights: true,
    },
  },
  usage: {
    applicationsSubmitted: 15,
    aiUsage: { ai_chat: 5 },
  },
};

// ── Tests: checkFeatureGate ──────────────────────────────────────────────────

describe("checkFeatureGate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("no subscription", () => {
    test("returns SUBSCRIPTION_REQUIRED when not in grace period", async () => {
      mockFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });
      const result = await checkFeatureGate("user1", { type: "ai", feature: "ai_chat" }, "employer");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("SUBSCRIPTION_REQUIRED");
    });

    test("allows access during grace period", async () => {
      mockFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });
      const { isInGracePeriod } = require("@/lib/subscription/gracePeriod");
      (isInGracePeriod as jest.Mock).mockResolvedValueOnce(true);

      const result = await checkFeatureGate("user1", { type: "ai", feature: "ai_chat" }, "employer");
      expect(result.allowed).toBe(true);
    });
  });

  describe("AI features", () => {
    test("allows enabled AI feature within limit", async () => {
      mockFindOne.mockReturnValue({ lean: () => Promise.resolve(baseSub) });
      const result = await checkFeatureGate("user1", { type: "ai", feature: "ai_chat" }, "employer");
      expect(result.allowed).toBe(true);
      expect(result.used).toBe(25);
      expect(result.remaining).toBe(25);
    });

    test("allows unlimited AI feature (monthlyLimit=0)", async () => {
      mockFindOne.mockReturnValue({ lean: () => Promise.resolve(baseSub) });
      const result = await checkFeatureGate("user1", { type: "ai", feature: "ai_cv_extraction" }, "employer");
      expect(result.allowed).toBe(true);
    });

    test("blocks disabled AI feature", async () => {
      mockFindOne.mockReturnValue({ lean: () => Promise.resolve(baseSub) });
      const result = await checkFeatureGate("user1", { type: "ai", feature: "ai_voice_input" }, "employer");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("FEATURE_DISABLED");
    });

    test("blocks AI feature not in plan", async () => {
      mockFindOne.mockReturnValue({ lean: () => Promise.resolve(baseSub) });
      const result = await checkFeatureGate("user1", { type: "ai", feature: "ai_salary_benchmark" }, "employer");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("FEATURE_DISABLED");
    });

    test("blocks AI feature when limit exceeded", async () => {
      const subAtLimit = {
        ...baseSub,
        usage: { ...baseSub.usage, aiUsage: { ai_chat: 50 } },
      };
      mockFindOne.mockReturnValue({ lean: () => Promise.resolve(subAtLimit) });
      const result = await checkFeatureGate("user1", { type: "ai", feature: "ai_chat" }, "employer");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("LIMIT_EXCEEDED");
      expect(result.limit).toBe(50);
      expect(result.used).toBe(50);
      expect(result.remaining).toBe(0);
    });
  });

  describe("numeric limits", () => {
    test("allows when under limit", async () => {
      mockFindOne.mockReturnValue({ lean: () => Promise.resolve(baseSub) });
      const result = await checkFeatureGate("user1", { type: "limit", feature: "activeJobs" }, "employer");
      expect(result.allowed).toBe(true);
      expect(result.used).toBe(5);
      expect(result.remaining).toBe(5);
    });

    test("blocks when at limit", async () => {
      const subAtLimit = { ...baseSub, usage: { ...baseSub.usage, activeJobs: 10 } };
      mockFindOne.mockReturnValue({ lean: () => Promise.resolve(subAtLimit) });
      const result = await checkFeatureGate("user1", { type: "limit", feature: "activeJobs" }, "employer");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("LIMIT_EXCEEDED");
    });

    test("allows unlimited (-1)", async () => {
      const unlimitedSub = {
        ...baseSub,
        planSnapshot: {
          ...baseSub.planSnapshot,
          employerLimits: { ...baseSub.planSnapshot.employerLimits, maxActiveJobs: -1 },
        },
      };
      mockFindOne.mockReturnValue({ lean: () => Promise.resolve(unlimitedSub) });
      const result = await checkFeatureGate("user1", { type: "limit", feature: "activeJobs" }, "employer");
      expect(result.allowed).toBe(true);
    });

    test("an employer-only limit is not applicable to a job seeker (no cap, no usage read)", async () => {
      mockFindOne.mockReturnValue({ lean: () => Promise.resolve(jsSubFixture) });
      const result = await checkFeatureGate("user2", { type: "limit", feature: "applicationsViewed" }, "job_seeker");
      expect(result).toEqual({ allowed: true });
    });

    test("a job-seeker-only limit is not applicable to an employer", async () => {
      mockFindOne.mockReturnValue({ lean: () => Promise.resolve(baseSub) });
      const result = await checkFeatureGate("user1", { type: "limit", feature: "applicationsSubmitted" }, "employer");
      expect(result).toEqual({ allowed: true });
    });

    test("handles applicationsSubmitted for job seekers", async () => {
      mockFindOne.mockReturnValue({ lean: () => Promise.resolve(jsSubFixture) });
      const result = await checkFeatureGate("user2", { type: "limit", feature: "applicationsSubmitted" }, "job_seeker");
      expect(result.allowed).toBe(true);
      expect(result.used).toBe(15);
      expect(result.remaining).toBe(5);
    });
  });

  describe("toggle features", () => {
    test("allows enabled toggle", async () => {
      mockFindOne.mockReturnValue({ lean: () => Promise.resolve(baseSub) });
      const result = await checkFeatureGate("user1", { type: "toggle", feature: "dataExport" }, "employer");
      expect(result.allowed).toBe(true);
    });

    test("blocks disabled toggle", async () => {
      mockFindOne.mockReturnValue({ lean: () => Promise.resolve(baseSub) });
      const result = await checkFeatureGate("user1", { type: "toggle", feature: "workflowCustomization" }, "employer");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("FEATURE_DISABLED");
    });

    test("allows a graded string toggle above the floor", async () => {
      mockFindOne.mockReturnValue({ lean: () => Promise.resolve(baseSub) });
      const result = await checkFeatureGate("user1", { type: "toggle", feature: "analyticsLevel" }, "employer");
      expect(result.allowed).toBe(true);
    });

    // analyticsLevel is a graded string, not a boolean. A plain truthiness test
    // treated "none" as enabled, so /api/employers/analytics passed on every plan.
    test('blocks analyticsLevel "none"', async () => {
      const noAnalyticsSub = {
        ...baseSub,
        planSnapshot: {
          ...baseSub.planSnapshot,
          employerLimits: { ...baseSub.planSnapshot.employerLimits, analyticsLevel: "none" },
        },
      };
      mockFindOne.mockReturnValue({ lean: () => Promise.resolve(noAnalyticsSub) });
      const result = await checkFeatureGate("user1", { type: "toggle", feature: "analyticsLevel" }, "employer");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("FEATURE_DISABLED");
    });
  });
});

// ── Tests: getFeatureGateMap ─────────────────────────────────────────────────

describe("getFeatureGateMap", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns empty object when no subscription", async () => {
    mockFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    const map = await getFeatureGateMap("user1", "employer");
    expect(map).toEqual({});
  });

  test("includes AI features with usage info", async () => {
    mockFindOne.mockReturnValue({ lean: () => Promise.resolve(baseSub) });
    const map = await getFeatureGateMap("user1", "employer");

    expect(map.ai_chat).toEqual({
      allowed: true,
      limit: 50,
      used: 25,
      remaining: 25,
    });
  });

  test("marks unlimited AI features correctly", async () => {
    mockFindOne.mockReturnValue({ lean: () => Promise.resolve(baseSub) });
    const map = await getFeatureGateMap("user1", "employer");

    expect(map.ai_cv_extraction).toEqual({
      allowed: true,
      limit: undefined,
      used: undefined,
      remaining: undefined,
    });
  });

  test("marks disabled AI features", async () => {
    mockFindOne.mockReturnValue({ lean: () => Promise.resolve(baseSub) });
    const map = await getFeatureGateMap("user1", "employer");

    expect(map.ai_voice_input.allowed).toBe(false);
  });

  test("includes numeric limits", async () => {
    mockFindOne.mockReturnValue({ lean: () => Promise.resolve(baseSub) });
    const map = await getFeatureGateMap("user1", "employer");

    expect(map.activeJobs).toEqual({
      allowed: true,
      limit: 10,
      used: 5,
      remaining: 5,
    });
  });

  test("includes boolean toggles", async () => {
    mockFindOne.mockReturnValue({ lean: () => Promise.resolve(baseSub) });
    const map = await getFeatureGateMap("user1", "employer");

    expect(map.dataExport).toEqual({ allowed: true });
    expect(map.commTemplates).toEqual({ allowed: true });
    expect(map.scorecardEvaluations).toEqual({ allowed: false });
    expect(map.workflowCustomization).toEqual({ allowed: false });
  });

  test("includes analyticsLevel", async () => {
    mockFindOne.mockReturnValue({ lean: () => Promise.resolve(baseSub) });
    const map = await getFeatureGateMap("user1", "employer");

    expect(map.analyticsLevel).toEqual({ allowed: true });
  });

  test("analyticsLevel 'none' is not allowed", async () => {
    const noAnalytics = {
      ...baseSub,
      planSnapshot: {
        ...baseSub.planSnapshot,
        employerLimits: { ...baseSub.planSnapshot.employerLimits, analyticsLevel: "none" },
      },
    };
    mockFindOne.mockReturnValue({ lean: () => Promise.resolve(noAnalytics) });
    const map = await getFeatureGateMap("user1", "employer");

    expect(map.analyticsLevel).toEqual({ allowed: false });
  });

  test("handles job_seeker role correctly", async () => {
    mockFindOne.mockReturnValue({ lean: () => Promise.resolve(jsSubFixture) });
    const map = await getFeatureGateMap("user2", "job_seeker");

    expect(map.applicationsSubmitted).toBeDefined();
    expect(map.applicationsSubmitted.allowed).toBe(true);
    expect(map.salaryInsights).toEqual({ allowed: true });
    expect(map.profileVisibilityBoost).toEqual({ allowed: false });
  });
});

// ── Tests: enforcement disabled (global toggle OFF) ──────────────────────────

describe("enforcement disabled", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("checkFeatureGate allows everything without a DB read", async () => {
    const { isSubscriptionEnforcementEnabled } = require("@/lib/subscription/enforcementFlag");
    (isSubscriptionEnforcementEnabled as jest.Mock).mockResolvedValueOnce(false);

    const result = await checkFeatureGate("user1", { type: "ai", feature: "ai_voice_input" }, "employer");
    expect(result.allowed).toBe(true);
    expect(mockFindOne).not.toHaveBeenCalled();
  });

  test("getFeatureGateMap returns a full-access map without a DB read", async () => {
    const { isSubscriptionEnforcementEnabled } = require("@/lib/subscription/enforcementFlag");
    (isSubscriptionEnforcementEnabled as jest.Mock).mockResolvedValueOnce(false);
    const { getGracePeriodEmployerLimits } = require("@/lib/subscription/gracePeriod");
    (getGracePeriodEmployerLimits as jest.Mock).mockReturnValueOnce(baseSub.planSnapshot.employerLimits);

    const map = await getFeatureGateMap("user1", "employer");
    expect(map.dataExport).toEqual({ allowed: true });
    expect(mockFindOne).not.toHaveBeenCalled();
  });
});
