/**
 * @jest-environment node
 */
/**
 * GET /api/admin/target-report: totals count each team once (a super agent's
 * profit already covers its agents), profit never adds currencies together, and
 * the year is validated. `?profileId=` hands back one person's full report.
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
const loadTargetReport = jest.fn();
const loadPreviousYearProfits = jest.fn();

jest.mock("@/models/TargetProfile", () => ({
  __esModule: true,
  PROFIT_TARGET_FILTER: { targetType: "profit" },
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
  loadTargetReport: (...args: unknown[]) => loadTargetReport(...args),
  loadPreviousYearProfits: (...args: unknown[]) => loadPreviousYearProfits(...args),
}));

const NO_DRIVERS = { revenue: 0, commissionCost: 0, invoicesPaid: 0, placements: 0, newEmployers: 0 };

function month(month: number, values: Partial<Record<string, number>> = {}) {
  return { month, profitTarget: 100, profitAchieved: 50, ...values };
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

const PROFILES = [
  // A super agent's plan (AED) and one agent under it.
  enriched({
    _id: "sa1", assigneeId: "u-sa1", assigneeRole: "super_agent",
    profitTarget: 1200, profitAchieved: 600, profitProgress: 50, riskScore: "high",
    drivers: { revenue: 800, commissionCost: 200, invoicesPaid: 5, placements: 3, newEmployers: 2 },
    byCategory: [{ category: "recruitment", profit: 500 }, { category: "subscription", profit: 100 }],
    monthlyAchievements: [month(1)],
  }),
  enriched({
    _id: "a1", assigneeId: "u-a1", parentProfileId: "sa1",
    profitTarget: 600, profitAchieved: 600, profitProgress: 100, riskScore: "low",
    drivers: { revenue: 800, commissionCost: 200, invoicesPaid: 5, placements: 3, newEmployers: 2 },
    byCategory: [{ category: "recruitment", profit: 600 }],
    monthlyAchievements: [month(1)],
  }),
  // An agent whose parent plan is not active this year stands on its own (INR).
  enriched({
    _id: "a2", assigneeId: "u-a2", parentProfileId: "cancelled-parent", currency: "INR",
    profitTarget: 300, profitAchieved: 100, profitProgress: 70, riskScore: "low",
    drivers: { revenue: 150, commissionCost: 50, invoicesPaid: 1, placements: 1, newEmployers: 0 },
    byCategory: [{ category: "recruitment", profit: 100 }],
    monthlyAchievements: [month(1, { profitTarget: 30, profitAchieved: 10 })],
  }),
];

async function get(query = "") {
  const { GET } = await import("@/app/api/admin/target-report/route");
  return GET(new NextRequest(`http://localhost/api/admin/target-report${query}`), { params: Promise.resolve({}) });
}

describe("GET /api/admin/target-report", () => {
  const { auth } = jest.requireMock("@/lib/auth/config") as { auth: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue({ user: { id: "admin_001", role: "admin", locale: "en" } });
    profileFindLean.mockResolvedValue(PROFILES.map(({ _id, assigneeId }) => ({ _id, assigneeId })));
    profileDistinct.mockResolvedValue([2027]);
    userFindLean.mockResolvedValue([
      { _id: "u-sa1", name: "Sara Lead", email: "sara@example.com" },
      { _id: "u-a1", name: "Adam Agent", email: "adam@example.com" },
      { _id: "u-a2", name: "Noor Solo", email: "noor@example.com" },
    ]);
    enrichProfiles.mockResolvedValue(PROFILES);
    loadPreviousYearProfits.mockResolvedValue(new Map([["sa1", 300], ["a1", 0]]));
  });

  it("counts each team once: the super agent's plan and the orphaned agent, not the child", async () => {
    const body = await (await get("?year=2027")).json();

    // AED roots: sa1 only (a1 is its child). INR: a2 stands alone, listed apart.
    expect(body.totals.profit).toEqual({
      currency: "AED",
      target: 1200,
      achieved: 600,
      others: [{ currency: "INR", target: 300, achieved: 100 }],
    });
    // January of the main currency: sa1, never a1 on top of its parent.
    expect(body.monthly[0]).toEqual({ month: "2027-01", target: 100, achieved: 50 });
    expect(body.monthly).toHaveLength(12);
  });

  it("sums the drivers and the income streams over the main currency's top-level plans", async () => {
    const body = await (await get("?year=2027")).json();

    expect(body.totals.drivers).toEqual({ revenue: 800, commissionCost: 200, invoicesPaid: 5, placements: 3, newEmployers: 2 });
    expect(body.byCategory).toEqual([
      { category: "recruitment", profit: 500, share: 83 },
      { category: "subscription", profit: 100, share: 17 },
    ]);
  });

  it("gives everyone the dashboard's pace and sorts by progress", async () => {
    const body = await (await get("?year=2027")).json();

    expect(body.people.map((row: { id: string; pace: string }) => `${row.id}:${row.pace}`)).toEqual([
      "a1:achieved", "a2:onPace", "sa1:behind",
    ]);
    expect(body.people[2]).toMatchObject({ name: "Sara Lead", role: "super_agent" });
    expect(body.people[0]).toMatchObject({ parentProfileId: "sa1" });
    expect(body.totals.people).toEqual({ total: 3, achieved: 1, onPace: 1, behind: 1, notStarted: 0 });
  });

  it("gives every target its completion status, growth against last year, forecast and schedule", async () => {
    const body = await (await get("?year=2027")).json();
    const sara = body.people.find((row: { id: string }) => row.id === "sa1");
    const adam = body.people.find((row: { id: string }) => row.id === "a1");

    expect(loadPreviousYearProfits).toHaveBeenCalledWith(PROFILES, 2027);
    expect(sara).toMatchObject({ expectedProgress: 50, periodType: "monthly", periods: [], incentiveTier: "none" });
    expect(sara.insights).toMatchObject({
      status: "behind",
      remaining: 600,
      // 600 made where half was expected: 1200 at this pace, the whole target.
      forecast: { profit: 1200, progress: 100 },
      yearOverYear: { previous: 300, pct: 100, trend: "up" },
    });
    expect(adam.insights).toMatchObject({ status: "achieved", yearOverYear: { previous: 0, pct: null, trend: "new" } });
  });

  it("counts a target whose schedule has not begun as not started, not as on pace", async () => {
    const future = new Date().getUTCFullYear() + 1;
    const periods = [{ startDate: `${future}-01-01`, endDate: `${future}-12-31`, profitTarget: 100, profitAchieved: 0, profitProgress: 0, status: "upcoming" }];
    enrichProfiles.mockResolvedValue([enriched({ _id: "f1", assigneeId: "u-f1", profitTarget: 100, expectedProgress: 0, periods })]);

    const body = await (await get(`?year=${future}`)).json();

    expect(body.totals.people).toEqual({ total: 1, achieved: 0, onPace: 0, behind: 0, notStarted: 1 });
    expect(body.people[0].insights).toMatchObject({ status: "notStarted", forecast: null });
    expect(body.people[0].insights.timeline.daysToStart).toBeGreaterThan(0);
  });

  it("opens on the year that has targets when none is asked for, so next year's targets are not hidden", async () => {
    const nextYear = new Date().getFullYear() + 1;
    profileDistinct.mockResolvedValue([nextYear]);

    const body = await (await get()).json();

    expect(body.year).toBe(nextYear);
    expect(profileFind).toHaveBeenCalledWith({ targetType: "profit", year: nextYear, status: "active" });
  });

  it("opens on the current year when it has targets, or when nothing does", async () => {
    const currentYear = new Date().getFullYear();
    profileDistinct.mockResolvedValue([currentYear + 1, currentYear]);
    expect((await (await get()).json()).year).toBe(currentYear);

    profileDistinct.mockResolvedValue([]);
    expect((await (await get()).json()).year).toBe(currentYear);
  });

  it("treats a year outside the schema's range as no year", async () => {
    const nextYear = new Date().getFullYear() + 1;
    profileDistinct.mockResolvedValue([nextYear]);

    const body = await (await get("?year=1999")).json();

    expect(body.year).toBe(nextYear);
    expect(body.years).toEqual([...new Set([nextYear, new Date().getFullYear()])].sort((a, b) => b - a));
  });

  it("is admin only", async () => {
    auth.mockResolvedValue({ user: { id: "sa_001", role: "super_agent", locale: "en" } });

    expect((await get()).status).toBe(403);
  });

  describe("?profileId=", () => {
    it("returns one person's full report, with their team for a super agent", async () => {
      profileFindOneLean.mockResolvedValue({ _id: "507f1f77bcf86cd799439011", assigneeId: "u-sa1", assigneeRole: "super_agent", year: 2027 });
      loadTargetReport.mockResolvedValue({ year: 2027, person: { name: "Sara Lead" } });

      const res = await get("?profileId=507f1f77bcf86cd799439011");

      expect(res.status).toBe(200);
      expect((await res.json()).report.person.name).toBe("Sara Lead");
      expect(loadTargetReport).toHaveBeenCalledWith(expect.objectContaining({ assigneeRole: "super_agent" }), { includeTeam: true });
    });

    it("404s for a profile that does not exist and 400s for a malformed id", async () => {
      profileFindOneLean.mockResolvedValue(null);

      expect((await get("?profileId=507f1f77bcf86cd799439011")).status).toBe(404);
      expect((await get("?profileId=not-an-id")).status).toBe(400);
      expect(loadTargetReport).not.toHaveBeenCalled();
    });
  });
});
