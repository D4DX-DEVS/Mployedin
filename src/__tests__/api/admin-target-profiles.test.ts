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
const enrichProfiles = jest.fn();

jest.mock("@/models/TargetProfile", () => ({
  __esModule: true,
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

function monthlyTargets() {
  return Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    employerTarget: 1,
    employeeTarget: 2,
    financeTarget: 100,
  }));
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

  it("persists custom monthly targets for bulk supervisor rollout", async () => {
    const customMonthlyTargets = monthlyTargets();

    const { POST } = await import("@/app/api/admin/target-profiles/route");
    const res = await POST(bulkRequest({
      assigneeIds: [...ASSIGNEE_IDS],
      assigneeRole: "super_agent",
      year: 2026,
      employerTarget: 12,
      employeeTarget: 24,
      financeTarget: 1200,
      currency: "AED",
      distributionStrategy: "custom",
      monthlyTargets: customMonthlyTargets,
    }), { params: Promise.resolve({}) });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.created).toBe(2);
    expect(targetProfileCreate).toHaveBeenCalledTimes(2);
    expect(targetProfileCreate).toHaveBeenNthCalledWith(1, expect.objectContaining({
      assigneeId: ASSIGNEE_IDS[0],
      distributionStrategy: "custom",
      monthlyTargets: customMonthlyTargets,
    }));
  });

  it("rejects custom bulk rollout without monthly targets", async () => {
    const { POST } = await import("@/app/api/admin/target-profiles/route");
    const res = await POST(bulkRequest({
      assigneeIds: [...ASSIGNEE_IDS],
      assigneeRole: "super_agent",
      year: 2026,
      employerTarget: 12,
      employeeTarget: 24,
      financeTarget: 1200,
      currency: "AED",
      distributionStrategy: "custom",
    }), { params: Promise.resolve({}) });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Validation failed");
    expect(targetProfileCreate).not.toHaveBeenCalled();
  });

  it("rejects bulk monthly targets whose totals do not match annual targets", async () => {
    const invalidMonthlyTargets = monthlyTargets().map((target, index) => (
      index === 0 ? { ...target, employerTarget: 2 } : target
    ));

    const { POST } = await import("@/app/api/admin/target-profiles/route");
    const res = await POST(bulkRequest({
      assigneeIds: [...ASSIGNEE_IDS],
      assigneeRole: "super_agent",
      year: 2026,
      employerTarget: 12,
      employeeTarget: 24,
      financeTarget: 1200,
      currency: "AED",
      distributionStrategy: "custom",
      monthlyTargets: invalidMonthlyTargets,
    }), { params: Promise.resolve({}) });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Monthly distribution must equal annual targets");
    expect(json.details).toEqual(expect.arrayContaining([expect.stringContaining("Employer monthly sum")]));
    expect(targetProfileCreate).not.toHaveBeenCalled();
  });

  describe("GET sorting", () => {
    // Listed in the DB's createdAt-desc order, which is the unsorted default.
    const ROWS = [
      { _id: "p1", assigneeId: "u1", name: "Charlie", region: "", overallProgress: 40, riskScore: "medium", teamSize: 2 },
      { _id: "p2", assigneeId: "u2", name: "alpha", region: "Qatar", overallProgress: 90, riskScore: "low", teamSize: 6 },
      { _id: "p3", assigneeId: "u3", name: "Bravo", region: "Bahrain", overallProgress: 10, riskScore: "high", teamSize: 0 },
    ];

    beforeEach(() => {
      targetProfileFindLean.mockResolvedValue(ROWS.map((row) => ({ _id: row._id, assigneeId: row.assigneeId, assigneeRole: "super_agent" })));
      userFindLean.mockResolvedValue(ROWS.map((row) => ({ _id: row.assigneeId, name: row.name, email: `${row.assigneeId}@x.test` })));
      superAgentFindLean.mockResolvedValue(ROWS.map((row) => ({ userId: row.assigneeId, agentIds: Array.from({ length: row.teamSize }, (_, i) => `a${i}`) })));
      enrichProfiles.mockImplementation(async () => ROWS.map((row) => ({
        _id: row._id,
        assigneeId: row.assigneeId,
        assigneeRole: "super_agent",
        region: row.region || undefined,
        overallProgress: row.overallProgress,
        riskScore: row.riskScore,
        employerTarget: 0, employerAchieved: 0,
        employeeTarget: 0, employeeAchieved: 0,
        financeTarget: 0, financeAchieved: 0,
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

    it("sorts by overall achievement in both directions", async () => {
      expect(await list("sortBy=overallProgress&sortOrder=desc")).toEqual(["p2", "p1", "p3"]);
      expect(await list("sortBy=overallProgress&sortOrder=asc")).toEqual(["p3", "p1", "p2"]);
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
      expect(await list("sortBy=overallProgress&sortOrder=desc&page=2&limit=1")).toEqual(["p1"]);
    });

    it("ignores a sort field outside the whitelist", async () => {
      expect(await list("sortBy=assigneeEmail&sortOrder=asc")).toEqual(["p1", "p2", "p3"]);
      expect(await list("sortBy=constructor&sortOrder=asc")).toEqual(["p1", "p2", "p3"]);
    });

    it("lists by date added oldest first when only the order is given", async () => {
      expect(await list("sortOrder=asc")).toEqual(["p3", "p2", "p1"]);
      expect(await list("sortOrder=desc")).toEqual(["p1", "p2", "p3"]);
    });
  });
});