/**
 * @jest-environment node
 */
/**
 * GET /api/admin/target-report: totals count each team once (a super agent's
 * plan already covers its agents), finance never adds currencies together, and
 * the year is validated.
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
const profileDistinct = jest.fn();
const userFindLean = jest.fn();
const enrichProfiles = jest.fn();

jest.mock("@/models/TargetProfile", () => ({
  __esModule: true,
  default: {
    find: (...args: unknown[]) => profileFind(...(args as [])),
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

function month(month: number, values: Partial<Record<string, number>> = {}) {
  return {
    month,
    employerTarget: 1, employeeTarget: 2, financeTarget: 100,
    employerAchieved: 1, employeeAchieved: 1, financeAchieved: 50,
    ...values,
  };
}

function enriched<T extends { _id: string; assigneeId: string }>(overrides: T & Record<string, unknown>) {
  return {
    assigneeRole: "agent",
    currency: "AED",
    employerTarget: 0, employeeTarget: 0, financeTarget: 0,
    employerAchieved: 0, employeeAchieved: 0, financeAchieved: 0,
    overallProgress: 0,
    riskScore: "low",
    monthlyAchievements: [],
    ...overrides,
  };
}

const PROFILES = [
  // A super agent's team plan (AED) and one agent under it.
  enriched({
    _id: "sa1", assigneeId: "u-sa1", assigneeRole: "super_agent",
    employerTarget: 12, employerAchieved: 6, employeeTarget: 24, employeeAchieved: 6,
    financeTarget: 1200, financeAchieved: 600, overallProgress: 40, riskScore: "high",
    monthlyAchievements: [month(1)],
  }),
  enriched({
    _id: "a1", assigneeId: "u-a1", parentProfileId: "sa1",
    employerTarget: 6, employerAchieved: 6, employeeTarget: 12, employeeAchieved: 6,
    financeTarget: 600, financeAchieved: 600, overallProgress: 100, riskScore: "low",
    monthlyAchievements: [month(1)],
  }),
  // An agent whose parent plan is not active this year stands on its own (INR).
  enriched({
    _id: "a2", assigneeId: "u-a2", parentProfileId: "cancelled-parent", currency: "INR",
    employerTarget: 2, employerAchieved: 1, employeeTarget: 4, employeeAchieved: 2,
    financeTarget: 300, financeAchieved: 100, overallProgress: 70, riskScore: "low",
    monthlyAchievements: [month(1, { financeTarget: 30, financeAchieved: 10 })],
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
  });

  it("counts each team once: the super agent's plan and the orphaned agent, not the child", async () => {
    const body = await (await get("?year=2027")).json();

    expect(body.totals.employers).toEqual({ target: 14, achieved: 7 });
    expect(body.totals.employees).toEqual({ target: 28, achieved: 8 });
    // January: sa1 + a2, never a1 on top of its parent.
    expect(body.monthly[0].employers).toEqual({ target: 2, achieved: 2 });
    expect(body.monthly[0].month).toBe("2027-01");
    expect(body.monthly).toHaveLength(12);
  });

  it("keeps finance per currency: the largest target leads, the rest are listed", async () => {
    const body = await (await get("?year=2027")).json();

    expect(body.totals.finance).toEqual({
      currency: "AED",
      target: 1200,
      achieved: 600,
      others: [{ currency: "INR", target: 300, achieved: 100 }],
    });
    // The monthly finance line holds the main currency only.
    expect(body.monthly[0].finance).toEqual({ target: 100, achieved: 50 });
  });

  it("gives everyone the dashboard's pace and sorts by progress", async () => {
    const body = await (await get("?year=2027")).json();

    expect(body.people.map((row: { id: string; pace: string }) => `${row.id}:${row.pace}`)).toEqual([
      "a1:achieved", "a2:onPace", "sa1:behind",
    ]);
    expect(body.people[2]).toMatchObject({ name: "Sara Lead", role: "super_agent" });
    expect(body.totals.people).toEqual({ total: 3, achieved: 1, onPace: 1, behind: 1 });
  });

  it("falls back to the current year for a year outside the schema's range", async () => {
    const currentYear = new Date().getFullYear();
    const body = await (await get("?year=1999")).json();

    expect(body.year).toBe(currentYear);
    expect(profileFind).toHaveBeenCalledWith({ year: currentYear, status: "active" });
    expect(body.years).toEqual([...new Set([2027, currentYear])].sort((a, b) => b - a));
  });

  it("is admin only", async () => {
    auth.mockResolvedValue({ user: { id: "sa_001", role: "super_agent", locale: "en" } });

    expect((await get()).status).toBe(403);
  });
});
