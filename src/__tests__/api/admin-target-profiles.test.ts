/**
 * @jest-environment node
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

jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ userId: ctx.userId, role: ctx.role })),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/notifications/trigger", () => ({
  notifyTargetAssigned: jest.fn().mockResolvedValue(undefined),
}));

const targetProfileFindOneLean = jest.fn();
const targetProfileCreate = jest.fn();
const userFindLean = jest.fn();

const targetProfileFindLean = jest.fn();
const superAgentFindLean = jest.fn();
const agentAggregate = jest.fn();
const enrichProfiles = jest.fn();

jest.mock("@/models/TargetProfile", () => ({
  __esModule: true,
  PROFIT_TARGET_FILTER: { targetType: "profit" },
  default: {
    findOne: jest.fn(() => ({ lean: targetProfileFindOneLean })),
    create: jest.fn((payload) => targetProfileCreate(payload)),
    find: jest.fn(() => ({ sort: jest.fn(() => ({ lean: targetProfileFindLean })) })),
    countDocuments: jest.fn(),
  },
}));

jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    find: jest.fn(() => ({ select: jest.fn(() => ({ lean: userFindLean })) })),
  },
}));

jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: {
    find: jest.fn(() => ({ select: jest.fn(() => ({ lean: superAgentFindLean })) })),
  },
}));

jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: { aggregate: (...args: unknown[]) => agentAggregate(...args) },
}));

jest.mock("@/lib/targets/profileAchievementCalculator", () => ({
  enrichProfiles: (profiles: unknown[]) => enrichProfiles(profiles),
}));

const ASSIGNEE_IDS = [
  "507f1f77bcf86cd799439011",
  "507f1f77bcf86cd799439012",
] as const;

function bulkRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/admin/target-profiles?action=bulk", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

/** Twelve calendar months of 2026 at 100 each: 1,200 over the year. */
function monthlyPeriods(overrides: Record<number, number> = {}) {
  return Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, "0");
    const last = new Date(Date.UTC(2026, index + 1, 0)).getUTCDate();
    return { startDate: `2026-${month}-01`, endDate: `2026-${month}-${last}`, profitTarget: overrides[index] ?? 100 };
  });
}

describe("Admin target profile API", () => {
  const { auth } = require("@/lib/auth/config");

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue({ user: { id: "admin_001", role: "admin", locale: "en" } });
    userFindLean.mockResolvedValue(ASSIGNEE_IDS.map((_id) => ({ _id })));
    targetProfileFindOneLean.mockResolvedValue(null);
    targetProfileCreate.mockImplementation(async (payload) => ({
      _id: `profile_${payload.assigneeId}`,
      ...payload,
    }));
  });

  it("persists the periods of a manual schedule for bulk supervisor rollout", async () => {
    const periods = monthlyPeriods();

    const { POST } = await import("@/app/api/admin/target-profiles/route");
    const res = await POST(bulkRequest({
      assigneeIds: [...ASSIGNEE_IDS],
      assigneeRole: "super_agent",
      year: 2026,
      profitTarget: 1200,
      currency: "AED",
      periodType: "monthly",
      distributionStrategy: "custom",
      periods,
    }), { params: Promise.resolve({}) });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.created).toBe(2);
    expect(targetProfileCreate).toHaveBeenCalledTimes(2);
    const stored = targetProfileCreate.mock.calls[0][0];
    expect(stored).toMatchObject({ assigneeId: ASSIGNEE_IDS[0], profitTarget: 1200, periodType: "monthly", distributionStrategy: "custom" });
    // Stored as UTC-midnight dates, ready to bucket payments by day.
    expect(stored.periods).toHaveLength(12);
    expect(stored.periods[0].startDate).toEqual(new Date("2026-01-01T00:00:00.000Z"));
    expect(stored.periods[1].endDate).toEqual(new Date("2026-02-28T00:00:00.000Z"));
  });

  it("rejects a manual split without the periods to hold it", async () => {
    const { POST } = await import("@/app/api/admin/target-profiles/route");
    const res = await POST(bulkRequest({
      assigneeIds: [...ASSIGNEE_IDS],
      assigneeRole: "super_agent",
      year: 2026,
      profitTarget: 1200,
      currency: "AED",
      periodType: "weekly",
      distributionStrategy: "custom",
    }), { params: Promise.resolve({}) });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Validation failed");
    expect(targetProfileCreate).not.toHaveBeenCalled();
  });

  it("rejects a custom schedule that was not spelled out", async () => {
    const { POST } = await import("@/app/api/admin/target-profiles/route");
    const res = await POST(bulkRequest({
      assigneeIds: [...ASSIGNEE_IDS],
      assigneeRole: "super_agent",
      year: 2026,
      profitTarget: 1200,
      periodType: "custom",
    }), { params: Promise.resolve({}) });

    expect(res.status).toBe(400);
    expect(targetProfileCreate).not.toHaveBeenCalled();
  });

  it("rejects periods whose total does not match the annual target", async () => {
    const invalidPeriods = monthlyPeriods({ 0: 150 });

    const { POST } = await import("@/app/api/admin/target-profiles/route");
    const res = await POST(bulkRequest({
      assigneeIds: [...ASSIGNEE_IDS],
      assigneeRole: "super_agent",
      year: 2026,
      profitTarget: 1200,
      currency: "AED",
      periodType: "monthly",
      distributionStrategy: "custom",
      periods: invalidPeriods,
    }), { params: Promise.resolve({}) });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("The schedule must add up to the target");
    expect(json.details).toEqual(expect.arrayContaining([expect.stringContaining("must add up to the target")]));
    expect(targetProfileCreate).not.toHaveBeenCalled();
  });

  it("accepts a fractional profit target and splits it exactly", async () => {
    userFindLean.mockResolvedValue([{ _id: ASSIGNEE_IDS[0] }]);
    const { POST } = await import("@/app/api/admin/target-profiles/route");
    const res = await POST(bulkRequest({
      assigneeIds: [ASSIGNEE_IDS[0]],
      assigneeRole: "super_agent",
      year: 2026,
      profitTarget: 1000.5,
      currency: "AED",
      distributionStrategy: "equal",
    }), { params: Promise.resolve({}) });

    expect(res.status).toBe(201);
    const created = targetProfileCreate.mock.calls[0][0];
    const total = created.periods.reduce((sum: number, p: { profitTarget: number }) => sum + Math.round(p.profitTarget * 100), 0);
    expect(total).toBe(100050);
  });

  it.each([
    ["annual", 1],
    ["quarterly", 4],
    ["monthly", 12],
    ["weekly", 53],
  ] as const)("cuts a %s target into %i periods that add up to the year", async (periodType, count) => {
    userFindLean.mockResolvedValue([{ _id: ASSIGNEE_IDS[0] }]);
    const { POST } = await import("@/app/api/admin/target-profiles/route");
    const res = await POST(bulkRequest({
      assigneeIds: [ASSIGNEE_IDS[0]],
      assigneeRole: "super_agent",
      year: 2027,
      profitTarget: 53000,
      periodType,
      distributionStrategy: "seasonal",
    }), { params: Promise.resolve({}) });

    expect(res.status).toBe(201);
    const created = targetProfileCreate.mock.calls[0][0];
    expect(created.periodType).toBe(periodType);
    expect(created.periods).toHaveLength(count);
    expect(created.periods.reduce((sum: number, p: { profitTarget: number }) => sum + Math.round(p.profitTarget * 100), 0)).toBe(5300000);
  });

  it("stores a custom schedule with gaps between its periods", async () => {
    userFindLean.mockResolvedValue([{ _id: ASSIGNEE_IDS[0] }]);
    const { POST } = await import("@/app/api/admin/target-profiles/route");
    const res = await POST(bulkRequest({
      assigneeIds: [ASSIGNEE_IDS[0]],
      assigneeRole: "super_agent",
      year: 2027,
      profitTarget: 1000,
      periodType: "custom",
      distributionStrategy: "custom",
      periods: [
        { label: "Spring push", startDate: "2027-03-01", endDate: "2027-04-30", profitTarget: 400 },
        { startDate: "2027-09-01", endDate: "2027-09-30", profitTarget: 600 },
      ],
    }), { params: Promise.resolve({}) });

    expect(res.status).toBe(201);
    const created = targetProfileCreate.mock.calls[0][0];
    expect(created.periods.map((p: { label?: string }) => p.label)).toEqual(["Spring push", undefined]);
  });

  it("refuses overlapping custom periods", async () => {
    userFindLean.mockResolvedValue([{ _id: ASSIGNEE_IDS[0] }]);
    const { POST } = await import("@/app/api/admin/target-profiles/route");
    const res = await POST(bulkRequest({
      assigneeIds: [ASSIGNEE_IDS[0]],
      assigneeRole: "super_agent",
      year: 2027,
      profitTarget: 1000,
      periodType: "custom",
      periods: [
        { startDate: "2027-03-01", endDate: "2027-04-30", profitTarget: 500 },
        { startDate: "2027-04-30", endDate: "2027-06-30", profitTarget: 500 },
      ],
    }), { params: Promise.resolve({}) });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.details).toEqual(expect.arrayContaining([expect.stringContaining("overlaps")]));
    expect(targetProfileCreate).not.toHaveBeenCalled();
  });

  it("says which supervisor was skipped and why, instead of just creating none", async () => {
    userFindLean.mockResolvedValue([{ _id: ASSIGNEE_IDS[0] }]);
    targetProfileFindOneLean.mockResolvedValue({ _id: "existing" });
    const { POST } = await import("@/app/api/admin/target-profiles/route");
    const res = await POST(new NextRequest("http://localhost:3000/api/admin/target-profiles?action=bulk-tabular", {
      method: "POST",
      body: JSON.stringify({
        year: 2027,
        assigneeRole: "super_agent",
        targets: [{ assigneeId: ASSIGNEE_IDS[0], profitTarget: 1000, periodType: "annual" }],
      }),
      headers: { "Content-Type": "application/json" },
    }), { params: Promise.resolve({}) });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.created).toBe(0);
    expect(json.skippedDetails).toEqual([{ assigneeId: ASSIGNEE_IDS[0], reason: "active_profile_exists" }]);
  });

  it("only sets targets for super agents; agents are funded by their super agent", async () => {
    const { POST } = await import("@/app/api/admin/target-profiles/route");
    const res = await POST(bulkRequest({
      assigneeIds: [...ASSIGNEE_IDS],
      assigneeRole: "agent",
      year: 2026,
      profitTarget: 1200,
      currency: "AED",
    }), { params: Promise.resolve({}) });

    expect(res.status).toBe(400);
    expect(targetProfileCreate).not.toHaveBeenCalled();
  });

  it("refuses a request that is not from admin", async () => {
    auth.mockResolvedValue({ user: { id: "sa_001", role: "super_agent", locale: "en" } });
    const { POST } = await import("@/app/api/admin/target-profiles/route");
    const res = await POST(bulkRequest({}), { params: Promise.resolve({}) });

    expect(res.status).toBe(403);
  });

  describe("GET sorting", () => {
    // Listed in the DB's createdAt-desc order, which is the unsorted default.
    const ROWS = [
      { _id: "p1", assigneeId: "u1", name: "Charlie", region: "", profitProgress: 40, profitTarget: 100, profitAchieved: 40, riskScore: "medium", teamSize: 2 },
      { _id: "p2", assigneeId: "u2", name: "alpha", region: "Qatar", profitProgress: 90, profitTarget: 300, profitAchieved: 270, riskScore: "low", teamSize: 6 },
      { _id: "p3", assigneeId: "u3", name: "Bravo", region: "Bahrain", profitProgress: 10, profitTarget: 200, profitAchieved: 20, riskScore: "high", teamSize: 0 },
    ];

    beforeEach(() => {
      targetProfileFindLean.mockResolvedValue(ROWS.map((row) => ({ _id: row._id, assigneeId: row.assigneeId, assigneeRole: "super_agent" })));
      userFindLean.mockResolvedValue(ROWS.map((row) => ({ _id: row.assigneeId, name: row.name, email: `${row.assigneeId}@x.test` })));
      // Team size is how many agents point at the super agent's profile.
      superAgentFindLean.mockResolvedValue(ROWS.map((row) => ({ _id: `sa-${row.assigneeId}`, userId: row.assigneeId })));
      agentAggregate.mockResolvedValue(ROWS.filter((row) => row.teamSize > 0).map((row) => ({ _id: `sa-${row.assigneeId}`, count: row.teamSize })));
      enrichProfiles.mockImplementation(async () => ROWS.map((row) => ({
        _id: row._id,
        assigneeId: row.assigneeId,
        assigneeRole: "super_agent",
        region: row.region || undefined,
        currency: "AED",
        profitProgress: row.profitProgress,
        profitTarget: row.profitTarget,
        profitAchieved: row.profitAchieved,
        riskScore: row.riskScore,
      })));
    });

    async function list(query: string): Promise<string[]> {
      const { GET } = await import("@/app/api/admin/target-profiles/route");
      const res = await GET(new NextRequest(`http://localhost:3000/api/admin/target-profiles?year=2026&${query}`), { params: Promise.resolve({}) });
      expect(res.status).toBe(200);
      const json = await res.json();
      return json.profiles.map((profile: { _id: string }) => profile._id);
    }

    it("keeps the newest-first order when no sort is asked for", async () => {
      expect(await list("")).toEqual(["p1", "p2", "p3"]);
    });

    it("sorts by profit progress in both directions", async () => {
      expect(await list("sortBy=profitProgress&sortOrder=desc")).toEqual(["p2", "p1", "p3"]);
      expect(await list("sortBy=profitProgress&sortOrder=asc")).toEqual(["p3", "p1", "p2"]);
    });

    it("sorts by the profit target and the profit achieved", async () => {
      expect(await list("sortBy=profitTarget&sortOrder=desc")).toEqual(["p2", "p3", "p1"]);
      expect(await list("sortBy=profitAchieved&sortOrder=desc")).toEqual(["p2", "p1", "p3"]);
    });

    it("sorts names case-insensitively", async () => {
      expect(await list("sortBy=name&sortOrder=asc")).toEqual(["p2", "p3", "p1"]);
    });

    it("ranks risk by severity, not alphabetically", async () => {
      expect(await list("sortBy=risk&sortOrder=desc")).toEqual(["p3", "p1", "p2"]);
    });

    it("sorts by team size", async () => {
      expect(await list("sortBy=teamSize&sortOrder=desc")).toEqual(["p2", "p1", "p3"]);
    });

    it("sorts before it pages", async () => {
      expect(await list("sortBy=profitProgress&sortOrder=desc&page=2&limit=1")).toEqual(["p1"]);
    });

    it("ignores a sort field outside the whitelist", async () => {
      expect(await list("sortBy=assigneeEmail&sortOrder=asc")).toEqual(["p1", "p2", "p3"]);
      expect(await list("sortBy=constructor&sortOrder=asc")).toEqual(["p1", "p2", "p3"]);
      // Retired metrics are no longer sort columns.
      expect(await list("sortBy=financeProgress&sortOrder=asc")).toEqual(["p1", "p2", "p3"]);
    });

    it("lists by date added oldest first when only the order is given", async () => {
      expect(await list("sortOrder=asc")).toEqual(["p3", "p2", "p1"]);
      expect(await list("sortOrder=desc")).toEqual(["p1", "p2", "p3"]);
    });
  });
});
