/**
 * @jest-environment node
 */
/**
 * Revenue permission grant/revoke for super agents:
 * - Admin only
 * - Audits the change
 * - 404 for unknown super agent
 * - Flips the flag on the SuperAgent profile
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, default: jest.fn(), connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/config", () => ({ auth: jest.fn() }));
jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ userId: ctx.userId, role: ctx.role })),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));

const save = jest.fn().mockResolvedValue(undefined);
const findOne = jest.fn();

jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: {
    findOne: (...a: unknown[]) => findOne(...a),
  },
}));

const { auth } = jest.requireMock("@/lib/auth/config") as { auth: jest.Mock };
const { logActivity } = jest.requireMock("@/lib/audit/log") as { logActivity: jest.Mock };

const SA_USER_ID = "user-sa-123";

function patch(body: unknown) {
  return new NextRequest(`http://localhost/api/admin/target-profiles/revenue-permission`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

async function run(body: unknown) {
  const { PATCH } = await import("@/app/api/admin/target-profiles/revenue-permission/route");
  return PATCH(patch(body), { params: Promise.resolve({}) });
}

beforeEach(() => {
  jest.clearAllMocks();
  auth.mockResolvedValue({ user: { id: "admin_1", role: "admin", locale: "en" } });
  findOne.mockResolvedValue(null);
  save.mockResolvedValue(undefined);
});

describe("PATCH /api/admin/target-profiles/revenue-permission", () => {
  it("requires admin role", async () => {
    auth.mockResolvedValue({ user: { id: "user_1", role: "agent", locale: "en" } });
    const res = await run({ superAgentUserId: SA_USER_ID, enabled: true });

    expect(res.status).toBe(403);
  });

  it("returns 404 for unknown super agent", async () => {
    findOne.mockResolvedValue(null);
    const res = await run({ superAgentUserId: "unknown-user-id", enabled: true });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Super agent not found" });
  });

  it("enables revenue targets for a super agent", async () => {
    const mockSuperAgent = {
      _id: "sa-id-123",
      userId: SA_USER_ID,
      canSetRevenueTargets: false,
      save,
    };
    findOne.mockResolvedValue(mockSuperAgent);

    const res = await run({ superAgentUserId: SA_USER_ID, enabled: true });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({
      superAgentId: "sa-id-123",
      userId: SA_USER_ID,
      canSetRevenueTargets: true,
    });
  });

  it("disables revenue targets for a super agent", async () => {
    const mockSuperAgent = {
      _id: "sa-id-123",
      userId: SA_USER_ID,
      canSetRevenueTargets: true,
      save,
    };
    findOne.mockResolvedValue(mockSuperAgent);

    const res = await run({ superAgentUserId: SA_USER_ID, enabled: false });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({
      superAgentId: "sa-id-123",
      userId: SA_USER_ID,
      canSetRevenueTargets: false,
    });
  });

  it("audits the revenue permission change", async () => {
    const mockSuperAgent = {
      _id: "sa-id-123",
      userId: SA_USER_ID,
      canSetRevenueTargets: false,
      save,
    };
    findOne.mockResolvedValue(mockSuperAgent);

    await run({ superAgentUserId: SA_USER_ID, enabled: true });

    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "admin_1",
        role: "admin",
        action: "super_agent.revenue_permission_update",
        resource: "targets",
        resourceId: "sa-id-123",
        meta: expect.objectContaining({
          superAgentUserId: SA_USER_ID,
          previous: false,
          enabled: true,
        }),
      })
    );
  });

  it("validates required fields", async () => {
    const res = await run({ superAgentUserId: "", enabled: true });

    expect(res.status).toBe(400);
  });
});
