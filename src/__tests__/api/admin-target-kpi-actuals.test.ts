/**
 * @jest-environment node
 */
/**
 * KPI3 target profiles include calculated actuals: jobs acquired, hires onboarded,
 * and revenue invoiced per month, matched against targets from the period schedule.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, default: jest.fn(), connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/config", () => ({ auth: jest.fn() }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function) => async (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => {
    const params = await ctx.params;
    return handler(req, { userId: "admin_1", role: "admin", locale: "en" }, params);
  },
}));
jest.mock("@/lib/permissions/matrix", () => ({ canAccess: jest.fn().mockReturnValue(true) }));
jest.mock("@/lib/targets/profileAchievementCalculator", () => ({ enrichProfile: jest.fn(), enrichProfiles: jest.fn() }));
jest.mock("@/lib/targets/kpiCalculator", () => ({
  calculateKpis: jest.fn(),
  kpiOwnerKey: (role: string, userId: string) => `${role}:${userId}`,
}));

const findOneLean = jest.fn();
const findOne = jest.fn((..._args: unknown[]) => ({ lean: findOneLean }));
const userFindByIdLean = jest.fn();

jest.mock("@/models/TargetProfile", () => ({
  __esModule: true,
  PROFIT_TARGET_FILTER: { targetType: { $in: ["profit", "kpi3"] } },
  default: {
    findOne: (...a: unknown[]) => findOne(...a),
  },
}));
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { findById: jest.fn(() => ({ select: jest.fn(() => ({ lean: userFindByIdLean })) })) },
}));

const { calculateKpis } = jest.requireMock("@/lib/targets/kpiCalculator") as { calculateKpis: jest.Mock };
const { enrichProfile } = jest.requireMock("@/lib/targets/profileAchievementCalculator") as { enrichProfile: jest.Mock };

const ID = "507f1f77bcf86cd799439011";

const KPI3_PROFILE = {
  _id: ID,
  targetType: "kpi3",
  assigneeId: "u-agent-1",
  assigneeRole: "agent",
  year: 2026,
  currency: "AED",
  status: "active",
  jobTarget: 12,
  conversionTarget: 24,
  revenueTarget: 100000,
  distributionStrategy: "equal",
  periodType: "monthly",
  periods: Array.from({ length: 12 }, (_, i) => ({
    startDate: new Date(2026, i, 1),
    endDate: new Date(2026, i + 1, 0),
    jobTarget: 1,
    conversionTarget: 2,
    revenueTarget: 8333.33,
    profitTarget: 0,
  })),
};

const MOCK_KPI_DATA = {
  months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, jobs: 1, onboarded: 2, revenue: 8333.33 })),
  totals: { jobs: 12, onboarded: 24, revenue: 100000 },
  otherCurrencies: [] as any[],
  commission: { pending: 0, approved: 0, paid: 0, disputed: 0 },
  byAgent: new Map(),
};

function get() {
  return new NextRequest(`http://localhost/api/admin/target-profiles/${ID}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
}

async function run() {
  const { GET } = await import("@/app/api/admin/target-profiles/[id]/route");
  return GET(get(), { params: Promise.resolve({ id: ID }) });
}

beforeEach(() => {
  jest.clearAllMocks();
  enrichProfile.mockResolvedValue(KPI3_PROFILE);
  userFindByIdLean.mockResolvedValue({ _id: "u-agent-1", name: "Test Agent", email: "agent@test.com" });
  findOneLean.mockResolvedValue(KPI3_PROFILE);
  calculateKpis.mockResolvedValue(new Map([["agent:u-agent-1", MOCK_KPI_DATA]]));
});

describe("GET /api/admin/target-profiles/[id] with KPI3", () => {
  it("includes kpi actuals when targetType is kpi3", async () => {
    const res = await run();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.kpi).toBeDefined();
    expect(data.kpi.months).toHaveLength(12);
    expect(data.kpi.totals).toEqual({ jobs: 12, onboarded: 24, revenue: 100000 });
  });

  it("includes month data with jobs, onboarded, revenue", async () => {
    const res = await run();
    const data = await res.json();

    const month1 = data.kpi.months[0];
    expect(month1).toEqual({
      month: 1,
      jobs: 1,
      onboarded: 2,
      revenue: 8333.33,
    });
  });

  it("calls calculateKpis with userId, role, currency and periods", async () => {
    await run();

    expect(calculateKpis).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          userId: "u-agent-1",
          role: "agent",
          currency: "AED",
          periods: expect.any(Array),
        }),
      ]),
      2026
    );
  });

  it("omits kpi when targetType is profit", async () => {
    const profitProfile = { ...KPI3_PROFILE, targetType: "profit" };
    findOneLean.mockResolvedValueOnce(profitProfile);
    enrichProfile.mockResolvedValueOnce(profitProfile);

    const res = await run();
    const data = await res.json();

    expect(data.kpi).toBeUndefined();
    expect(calculateKpis).not.toHaveBeenCalled();
  });

  it("includes commission breakdown by status", async () => {
    const res = await run();
    const data = await res.json();

    expect(data.kpi.commission).toEqual({
      pending: 0,
      approved: 0,
      paid: 0,
      disputed: 0,
    });
  });

  it("converts byAgent Map to array", async () => {
    const kpiDataWithAgents = {
      ...MOCK_KPI_DATA,
      byAgent: new Map([
        ["agent-1", { jobs: 2, onboarded: 4, revenue: 15000 }],
        ["agent-2", { jobs: 3, onboarded: 5, revenue: 20000 }],
      ]),
    };
    jest.clearAllMocks();
    enrichProfile.mockResolvedValue(KPI3_PROFILE);
    userFindByIdLean.mockResolvedValue({ _id: "u-agent-1", name: "Test Agent", email: "agent@test.com" });
    findOneLean.mockResolvedValue(KPI3_PROFILE);
    calculateKpis.mockResolvedValue(new Map([["agent:u-agent-1", kpiDataWithAgents]]));

    const res = await run();
    const data = await res.json();

    expect(data.kpi.byAgent).toEqual([
      { agentId: "agent-1", jobs: 2, onboarded: 4, revenue: 15000 },
      { agentId: "agent-2", jobs: 3, onboarded: 5, revenue: 20000 },
    ]);
  });
});
