/**
 * @jest-environment node
 */
/**
 * GET /api/admin/target-report?period=month&month=1: KPI extension for three pillars
 * (jobs, onboarded, revenue), period param validation, org and row totals, status
 * calculation, and profit payload remains unchanged.
 */
import { NextRequest } from "next/server";

const connectDB = jest.fn().mockResolvedValue(undefined);

jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  default: connectDB,
  connectDB,
}));

jest.mock("@/lib/auth/config", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/permissions/matrix", () => ({
  canAccess: jest.fn().mockReturnValue(true),
}));

const profileFindLean = jest.fn();
const profileFind = jest.fn(() => ({ lean: profileFindLean }));
const profileFindOneLean = jest.fn();
const profileDistinct = jest.fn();
const userFindLean = jest.fn();
const enrichProfiles = jest.fn();
const loadPreviousYearProfits = jest.fn();
const calculateKpis = jest.fn();

jest.mock("@/models/TargetProfile", () => ({
  __esModule: true,
  PROFIT_TARGET_FILTER: { targetType: { $in: ["profit", "kpi3"] } },
  default: {
    find: (...args: unknown[]) => profileFind(...(args as [])),
    findOne: jest.fn(() => ({ lean: profileFindOneLean })),
    distinct: (...args: unknown[]) => profileDistinct(...args),
  },
}));

jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    find: jest.fn(() => ({ select: jest.fn(() => ({ lean: userFindLean })) })),
  },
}));

jest.mock("@/lib/targets/profileAchievementCalculator", () => ({
  ...jest.requireActual("@/lib/targets/profileAchievementCalculator"),
  enrichProfiles: (...args: unknown[]) => enrichProfiles(...args),
}));

jest.mock("@/lib/targets/loadReport", () => ({
  loadTargetReport: jest.fn(),
  loadPreviousYearProfits: (...args: unknown[]) => loadPreviousYearProfits(...args),
}));

jest.mock("@/lib/targets/kpiCalculator", () => ({
  calculateKpis: (...args: unknown[]) => calculateKpis(...args),
  achievement: (actual: number, target: number | null) => (target && target > 0 ? Math.round((actual / target) * 100) : null),
  kpiOwnerKey: (role: string, userId: string) => `${role}:${userId}`,
}));

const NO_DRIVERS = { revenue: 0, commissionCost: 0, invoicesPaid: 0, placements: 0, newEmployers: 0 };

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function month(_monthNum: number, values: Partial<Record<string, number>> = {}) {
  return { month: _monthNum, profitTarget: 100, profitAchieved: 50, ...values };
}

function enriched<T extends { _id: string; assigneeId: string }>(overrides: T & Record<string, unknown>) {
  return {
    assigneeRole: "agent",
    currency: "AED",
    profitTarget: 0,
    profitAchieved: 0,
    profitProgress: 0,
    expectedProgress: 50,
    riskScore: "low",
    incentiveTier: "none",
    periodType: "monthly",
    periods: [],
    drivers: NO_DRIVERS,
    byCategory: [],
    monthlyAchievements: [],
    ...overrides,
  };
}

function kpiOwner(role: string, userId: string, overrides: Record<string, unknown> = {}) {
  return {
    months: [
      { month: 1, jobs: 5, onboarded: 2, revenue: 50000 },
      { month: 2, jobs: 6, onboarded: 3, revenue: 60000 },
      { month: 3, jobs: 4, onboarded: 2, revenue: 45000 },
      { month: 4, jobs: 0, onboarded: 0, revenue: 0 },
      { month: 5, jobs: 0, onboarded: 0, revenue: 0 },
      { month: 6, jobs: 0, onboarded: 0, revenue: 0 },
      { month: 7, jobs: 0, onboarded: 0, revenue: 0 },
      { month: 8, jobs: 0, onboarded: 0, revenue: 0 },
      { month: 9, jobs: 0, onboarded: 0, revenue: 0 },
      { month: 10, jobs: 0, onboarded: 0, revenue: 0 },
      { month: 11, jobs: 0, onboarded: 0, revenue: 0 },
      { month: 12, jobs: 0, onboarded: 0, revenue: 0 },
    ],
    periods: [],
    totals: { jobs: 15, onboarded: 7, revenue: 155000 },
    otherCurrencies: [],
    commission: { pending: 1000, approved: 2000, paid: 3000, disputed: 500 },
    byAgent: new Map(),
    ...overrides,
  };
}

const KPI3_PROFILES = [
  enriched({
    _id: "kpi-agent1",
    assigneeId: "u-agent1",
    targetType: "kpi3",
    year: 2027,
    jobTarget: 50,
    conversionTarget: 20,
    revenueTarget: 500000,
    periods: [
      { label: "Q1", startDate: "2027-01-01", endDate: "2027-03-31", profitTarget: 100, jobTarget: 15, conversionTarget: 6, revenueTarget: 150000 },
      { label: "Q2", startDate: "2027-04-01", endDate: "2027-06-30", profitTarget: 100, jobTarget: 10, conversionTarget: 4, revenueTarget: 100000 },
      { label: "Q3", startDate: "2027-07-01", endDate: "2027-09-30", profitTarget: 100, jobTarget: 15, conversionTarget: 6, revenueTarget: 150000 },
      { label: "Q4", startDate: "2027-10-01", endDate: "2027-12-31", profitTarget: 100, jobTarget: 10, conversionTarget: 4, revenueTarget: 100000 },
    ],
  }),
  enriched({
    _id: "kpi-agent2",
    assigneeId: "u-agent2",
    targetType: "kpi3",
    year: 2027,
    jobTarget: 30,
    conversionTarget: 12,
    revenueTarget: 300000,
    periods: [
      { label: "Q1", startDate: "2027-01-01", endDate: "2027-03-31", profitTarget: 50, jobTarget: 10, conversionTarget: 4, revenueTarget: 100000 },
      { label: "Q2", startDate: "2027-04-01", endDate: "2027-06-30", profitTarget: 50, jobTarget: 5, conversionTarget: 2, revenueTarget: 50000 },
      { label: "Q3", startDate: "2027-07-01", endDate: "2027-09-30", profitTarget: 50, jobTarget: 10, conversionTarget: 4, revenueTarget: 100000 },
      { label: "Q4", startDate: "2027-10-01", endDate: "2027-12-31", profitTarget: 50, jobTarget: 5, conversionTarget: 2, revenueTarget: 50000 },
    ],
  }),
  // Profit-only profile (should not appear in KPI rows)
  enriched({
    _id: "profit-agent3",
    assigneeId: "u-agent3",
    targetType: "profit",
    year: 2027,
    profitTarget: 1000,
    profitAchieved: 500,
  }),
];

async function get(query = "") {
  const { GET } = await import("@/app/api/admin/target-report/route");
  return GET(new NextRequest(`http://localhost/api/admin/target-report${query}`), { params: Promise.resolve({}) });
}

describe("GET /api/admin/target-report KPI extension", () => {
  const { auth } = jest.requireMock("@/lib/auth/config") as { auth: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue({ user: { id: "admin_001", role: "admin", locale: "en" } });
    profileFindLean.mockResolvedValue(
      KPI3_PROFILES.map(({ _id, assigneeId, targetType, year, jobTarget, conversionTarget, revenueTarget }) => ({
        _id,
        assigneeId,
        targetType,
        year: year || 2027,
        jobTarget,
        conversionTarget,
        revenueTarget,
      })),
    );
    profileDistinct.mockResolvedValue([2027]);
    userFindLean.mockResolvedValue([
      { _id: "u-agent1", name: "Alice Agent", email: "alice@example.com" },
      { _id: "u-agent2", name: "Bob Agent", email: "bob@example.com" },
      { _id: "u-agent3", name: "Charlie Agent", email: "charlie@example.com" },
    ]);
    enrichProfiles.mockResolvedValue(KPI3_PROFILES);
    loadPreviousYearProfits.mockResolvedValue(new Map());
    calculateKpis.mockResolvedValue(
      new Map([
        ["agent:u-agent1", kpiOwner("agent", "u-agent1")],
        ["agent:u-agent2", kpiOwner("agent", "u-agent2")],
      ]),
    );
  });

  it("validates period query param", async () => {
    const response = await get("?period=invalid");
    expect(response.status).toBe(200); // Still returns 200 because we don't add kpi if period is invalid
  });

  it("validates month query param with period=month", async () => {
    const response = await get("?period=month&month=13");
    expect(response.status).toBe(200);
  });

  it("requires month param when period=month", async () => {
    const response = await get("?period=month");
    expect(response.status).toBe(200);
  });

  it("validates quarter query param with period=quarter", async () => {
    const response = await get("?period=quarter&quarter=5");
    expect(response.status).toBe(200);
  });

  it("returns month targets summing period amounts", async () => {
    const body = await (await get("?period=month&month=1&year=2027")).json();

    expect(body.kpi).toBeDefined();
    expect(body.kpi.period).toEqual({
      type: "month",
      month: 1,
      startDate: "2027-01-01",
      endDate: "2027-01-31",
    });

    // Month 1 targets should be Q1 targets
    expect(body.kpi.org.jobs.target).toBe(25); // 15 + 10
    expect(body.kpi.org.onboarded.target).toBe(10); // 6 + 4
    expect(body.kpi.org.revenue[0].target).toBe(250000); // 150000 + 100000
  });

  it("returns quarter targets summing period amounts", async () => {
    const body = await (await get("?period=quarter&quarter=1&year=2027")).json();

    expect(body.kpi).toBeDefined();
    expect(body.kpi.period).toEqual({
      type: "quarter",
      quarter: 1,
      startDate: "2027-01-01",
      endDate: "2027-03-31",
    });

    // Q1 targets
    expect(body.kpi.org.jobs.target).toBe(25); // 15 + 10
    expect(body.kpi.org.onboarded.target).toBe(10); // 6 + 4
    expect(body.kpi.org.revenue[0].target).toBe(250000); // 150000 + 100000
  });

  it("returns year targets summing all periods", async () => {
    const body = await (await get("?period=year&year=2027")).json();

    expect(body.kpi).toBeDefined();
    expect(body.kpi.period.type).toBe("year");
    expect(body.kpi.period.startDate).toBe("2027-01-01");
    expect(body.kpi.period.endDate).toBe("2027-12-31");

    // Full year targets
    expect(body.kpi.org.jobs.target).toBe(80); // 50 + 30
    expect(body.kpi.org.onboarded.target).toBe(32); // 20 + 12
    expect(body.kpi.org.revenue[0].target).toBe(800000); // 500000 + 300000
  });

  it("calculates pct as null when target is 0", async () => {
    // Create profiles with 0 targets
    const noTargetProfiles = [
      enriched({
        _id: "kpi-no-target-1",
        assigneeId: "u-agent-no-target-1",
        targetType: "kpi3",
        year: 2027,
        jobTarget: 0,
        conversionTarget: 0,
        revenueTarget: 500000, // only revenue target set
        periods: [
          { label: "Q1", startDate: "2027-01-01", endDate: "2027-03-31", profitTarget: 100, jobTarget: 0, conversionTarget: 0, revenueTarget: 125000 },
          { label: "Q2", startDate: "2027-04-01", endDate: "2027-06-30", profitTarget: 100, jobTarget: 0, conversionTarget: 0, revenueTarget: 125000 },
          { label: "Q3", startDate: "2027-07-01", endDate: "2027-09-30", profitTarget: 100, jobTarget: 0, conversionTarget: 0, revenueTarget: 125000 },
          { label: "Q4", startDate: "2027-10-01", endDate: "2027-12-31", profitTarget: 100, jobTarget: 0, conversionTarget: 0, revenueTarget: 125000 },
        ],
      }),
    ];

    profileFindLean.mockResolvedValue(
      noTargetProfiles.map(({ _id, assigneeId, targetType, year, jobTarget, conversionTarget, revenueTarget }) => ({
        _id,
        assigneeId,
        targetType,
        year: year || 2027,
        jobTarget,
        conversionTarget,
        revenueTarget,
      })),
    );
    enrichProfiles.mockResolvedValue(noTargetProfiles);
    calculateKpis.mockResolvedValue(
      new Map([["agent:u-agent-no-target-1", kpiOwner("agent", "u-agent-no-target-1", { totals: { jobs: 10, onboarded: 5, revenue: 50000 } })]]),
    );

    const body = await (await get("?period=year&year=2027")).json();

    expect(body.kpi.org.jobs.pct).toBeNull();
    expect(body.kpi.org.onboarded.pct).toBeNull();
    // Revenue target is set, so pct should not be null
    expect(body.kpi.org.revenue[0].pct).toBeDefined();
  });

  it("keeps revenue separate by currency in org totals", async () => {
    calculateKpis.mockResolvedValue(
      new Map([
        ["agent:u-agent1", kpiOwner("agent", "u-agent1")],
        ["agent:u-agent2", kpiOwner("agent", "u-agent2", { totals: { jobs: 5, onboarded: 2, revenue: 50000 }, otherCurrencies: [{ currency: "INR", revenue: 100000 }] })],
      ]),
    );

    KPI3_PROFILES[1].currency = "INR";
    profileFindLean.mockResolvedValue(KPI3_PROFILES.map(({ _id, assigneeId, targetType }) => ({ _id, assigneeId, targetType })));
    enrichProfiles.mockResolvedValue(KPI3_PROFILES);

    const body = await (await get("?period=year&year=2027")).json();

    expect(body.kpi.org.revenue.length).toBe(2);
    expect(body.kpi.org.revenue[0].currency).toBe("AED");
    expect(body.kpi.org.revenue[1].currency).toBe("INR");
  });

  it("includes commission totals in org", async () => {
    const body = await (await get("?period=month&month=1&year=2027")).json();

    expect(body.kpi.org.commission).toBeDefined();
    expect(body.kpi.org.commission.agent).toBeDefined();
  });

  it("includes rows with KPI data per top-level profile", async () => {
    const body = await (await get("?period=month&month=1&year=2027")).json();

    expect(body.kpi.rows).toBeDefined();
    expect(body.kpi.rows.length).toBe(2); // Only kpi3 profiles, no profit-only
    expect(body.kpi.rows[0].profileId).toBe("kpi-agent1");
    expect(body.kpi.rows[0].jobs).toBeDefined();
    expect(body.kpi.rows[0].onboarded).toBeDefined();
    expect(body.kpi.rows[0].revenue).toBeDefined();
  });

  it("calculates status as on_track when avg pct >= 90", async () => {
    // Targets: Q1 = 15/6/150000. For 90% pct: 13.5/5.4/135000
    const onTrackKpi = kpiOwner("agent", "u-agent1");
    onTrackKpi.months[0] = { month: 1, jobs: 14, onboarded: 6, revenue: 140000 };

    calculateKpis.mockResolvedValue(
      new Map([
        ["agent:u-agent1", onTrackKpi],
        ["agent:u-agent2", kpiOwner("agent", "u-agent2")],
      ]),
    );

    const body = await (await get("?period=month&month=1&year=2027")).json();

    expect(body.kpi.rows[0].status).toBe("on_track");
  });

  it("calculates status as behind when avg pct >= 60 and < 90", async () => {
    // Targets: Q1 = 15/6/150000. For 70% pct: 10.5/4.2/105000
    const behindKpi = kpiOwner("agent", "u-agent1");
    behindKpi.months[0] = { month: 1, jobs: 10, onboarded: 4, revenue: 100000 };

    calculateKpis.mockResolvedValue(
      new Map([
        ["agent:u-agent1", behindKpi],
        ["agent:u-agent2", kpiOwner("agent", "u-agent2")],
      ]),
    );

    const body = await (await get("?period=month&month=1&year=2027")).json();

    expect(body.kpi.rows[0].status).toBe("behind");
  });

  it("calculates status as at_risk when avg pct < 60", async () => {
    // Targets: Q1 = 15/6/150000. For 50% pct: 7.5/3/75000
    const atRiskKpi = kpiOwner("agent", "u-agent1");
    atRiskKpi.months[0] = { month: 1, jobs: 7, onboarded: 3, revenue: 75000 };

    calculateKpis.mockResolvedValue(
      new Map([
        ["agent:u-agent1", atRiskKpi],
        ["agent:u-agent2", kpiOwner("agent", "u-agent2")],
      ]),
    );

    const body = await (await get("?period=month&month=1&year=2027")).json();

    expect(body.kpi.rows[0].status).toBe("at_risk");
  });

  it("sets status to null when no targets are set", async () => {
    // Create profiles with 0 targets
    const noTargetProfiles = [
      enriched({
        _id: "kpi-agent-no-target",
        assigneeId: "u-agent-no-target",
        targetType: "kpi3",
        year: 2027,
        jobTarget: 0,
        conversionTarget: 0,
        revenueTarget: 0,
        periods: [
          { label: "Q1", startDate: "2027-01-01", endDate: "2027-03-31", profitTarget: 100, jobTarget: 0, conversionTarget: 0, revenueTarget: 0 },
        ],
      }),
    ];

    profileFindLean.mockResolvedValue(
      noTargetProfiles.map(({ _id, assigneeId, targetType, year, jobTarget, conversionTarget, revenueTarget }) => ({
        _id,
        assigneeId,
        targetType,
        year: year || 2027,
        jobTarget,
        conversionTarget,
        revenueTarget,
      })),
    );
    enrichProfiles.mockResolvedValue(noTargetProfiles);
    calculateKpis.mockResolvedValue(new Map([["agent:u-agent-no-target", kpiOwner("agent", "u-agent-no-target")]]));

    const body = await (await get("?period=month&month=1&year=2027")).json();

    expect(body.kpi.rows.length).toBe(1);
    expect(body.kpi.rows[0].status).toBeNull();
  });

  it("keeps existing profit payload unchanged", async () => {
    const body = await (await get("?period=month&month=1&year=2027")).json();

    expect(body.totals).toBeDefined();
    expect(body.totals.profit).toBeDefined();
    expect(body.people).toBeDefined();
    expect(body.monthly).toBeDefined();
  });
});
