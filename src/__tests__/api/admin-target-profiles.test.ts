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

jest.mock("@/models/TargetProfile", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({ lean: targetProfileFindOneLean })),
    create: jest.fn((payload) => targetProfileCreate(payload)),
    find: jest.fn(),
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
    find: jest.fn(),
  },
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
});