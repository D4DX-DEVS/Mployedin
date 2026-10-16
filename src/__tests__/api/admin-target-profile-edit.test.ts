/**
 * @jest-environment node
 */
/**
 * Editing, cancelling and reassigning a profit target keeps the chain whole:
 * months always add up to the year, a super agent's target never drops under
 * what their agents were given, and a team never ends up under the wrong plan.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, default: jest.fn(), connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/config", () => ({ auth: jest.fn() }));
jest.mock("@/lib/permissions/matrix", () => ({ canAccess: jest.fn().mockReturnValue(true) }));
jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ userId: ctx.userId, role: ctx.role })),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/notifications/trigger", () => ({
  notifyTargetUpdated: jest.fn().mockResolvedValue(undefined),
  notifyTargetAssigned: jest.fn().mockResolvedValue(undefined),
}));

const findOneLean = jest.fn();
const findOne = jest.fn((..._args: unknown[]) => ({ lean: findOneLean }));
const findOneAndUpdateLean = jest.fn();
const findOneAndUpdate = jest.fn((..._args: unknown[]) => ({ lean: findOneAndUpdateLean }));
const updateMany = jest.fn().mockResolvedValue({});
const exists = jest.fn();
const allocatedProfitCents = jest.fn();
const userFindOneLean = jest.fn();

jest.mock("@/models/TargetProfile", () => ({
  __esModule: true,
  PROFIT_TARGET_FILTER: { targetType: "profit" },
  default: {
    findOne: (...a: unknown[]) => findOne(...a),
    findOneAndUpdate: (...a: unknown[]) => findOneAndUpdate(...a),
    updateMany: (...a: unknown[]) => updateMany(...a),
    exists: (...a: unknown[]) => exists(...a),
  },
}));
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { findOne: jest.fn(() => ({ select: jest.fn(() => ({ lean: userFindOneLean })) })) },
}));
jest.mock("@/lib/targets/budget", () => ({
  ...jest.requireActual("@/lib/targets/budget"),
  allocatedProfitCents: (...a: unknown[]) => allocatedProfitCents(...a),
}));
jest.mock("@/lib/targets/profileAchievementCalculator", () => ({ enrichProfile: jest.fn(), enrichProfiles: jest.fn() }));

const { auth } = jest.requireMock("@/lib/auth/config") as { auth: jest.Mock };
const ID = "507f1f77bcf86cd799439011";
const NEW_ASSIGNEE = "507f1f77bcf86cd799439022";

const SA_PROFILE = {
  _id: ID, assigneeId: "u-sa", assigneeRole: "super_agent", year: 2027, currency: "AED", status: "active",
  profitTarget: 1200, distributionStrategy: "equal", periodType: "monthly",
};

function patch(body: unknown) {
  return new NextRequest(`http://localhost/api/admin/target-profiles/${ID}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

async function run(body: unknown) {
  const { PATCH } = await import("@/app/api/admin/target-profiles/[id]/route");
  return PATCH(patch(body), { params: Promise.resolve({ id: ID }) });
}

beforeEach(() => {
  jest.clearAllMocks();
  auth.mockResolvedValue({ user: { id: "admin_1", role: "admin", locale: "en" } });
  findOneLean.mockResolvedValue(SA_PROFILE);
  findOneAndUpdateLean.mockResolvedValue({ ...SA_PROFILE, assigneeId: "u-sa" });
  allocatedProfitCents.mockResolvedValue(0);
  exists.mockResolvedValue(null);
});

describe("PATCH /api/admin/target-profiles/[id]", () => {
  type SetCall = { $set: { profitTarget: number; periodType: string; periods: { profitTarget: number; startDate: Date }[] } };
  const lastSet = () => findOneAndUpdate.mock.calls[0][1] as SetCall;
  const periodSum = (set: SetCall) => set.$set.periods.reduce((sum, p) => sum + Math.round(p.profitTarget * 100), 0);

  it("re-cuts the periods when the amount changes, so they still add up to the year", async () => {
    const res = await run({ profitTarget: 2400 });
    const set = lastSet();

    expect(res.status).toBe(200);
    expect(set.$set.periods).toHaveLength(12);
    expect(periodSum(set)).toBe(240000);
  });

  it.each([
    ["annual", 1],
    ["quarterly", 4],
    ["weekly", 53],
  ] as const)("switches a monthly target to %s: %i periods, same total", async (periodType, count) => {
    const res = await run({ periodType });
    const set = lastSet();

    expect(res.status).toBe(200);
    expect(set.$set.periodType).toBe(periodType);
    expect(set.$set.periods).toHaveLength(count);
    expect(periodSum(set)).toBe(120000);
    // Periods are stored as dates, one UTC midnight per bound.
    expect(set.$set.periods[0].startDate).toEqual(new Date("2027-01-01T00:00:00.000Z"));
  });

  it("switches to custom periods the caller spells out", async () => {
    const periods = [
      { label: "Campaign", startDate: "2027-03-01", endDate: "2027-04-30", profitTarget: 700 },
      { startDate: "2027-09-01", endDate: "2027-09-30", profitTarget: 500 },
    ];
    const res = await run({ periodType: "custom", distributionStrategy: "custom", periods });

    expect(res.status).toBe(200);
    expect(lastSet().$set.periods).toHaveLength(2);
    expect(periodSum(lastSet())).toBe(120000);
  });

  it("will not switch to custom without periods, or accept periods outside the year", async () => {
    expect((await run({ periodType: "custom" })).status).toBe(400);
    expect((await run({
      periodType: "custom",
      periods: [{ startDate: "2026-12-01", endDate: "2027-12-31", profitTarget: 1200 }],
    })).status).toBe(400);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("does not touch the schedule when only the notes change", async () => {
    await run({ notes: "Reviewed in Q3" });

    expect((lastSet().$set as Record<string, unknown>).periods).toBeUndefined();
  });

  it("will not guess a custom split for a new amount", async () => {
    findOneLean.mockResolvedValue({ ...SA_PROFILE, distributionStrategy: "custom" });

    const res = await run({ profitTarget: 2400 });

    expect(res.status).toBe(400);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("rejects periods that do not add up to the amount", async () => {
    const months = Array.from({ length: 12 }, (_, i) => {
      const month = String(i + 1).padStart(2, "0");
      return { startDate: `2027-${month}-01`, endDate: `2027-${month}-${new Date(Date.UTC(2027, i + 1, 0)).getUTCDate()}`, profitTarget: 1 };
    });

    expect((await run({ profitTarget: 1200, periodType: "monthly", distributionStrategy: "custom", periods: months })).status).toBe(400);
  });

  it("will not drop a super agent's target under what their agents were given", async () => {
    allocatedProfitCents.mockResolvedValue(90000); // 900 given away

    const res = await run({ profitTarget: 800 });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.allocated).toBe(900);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("allows lowering it to exactly what the agents hold", async () => {
    allocatedProfitCents.mockResolvedValue(90000);

    expect((await run({ profitTarget: 900 })).status).toBe(200);
  });

  it("will not raise an agent's target past what their super agent's target can fund", async () => {
    findOneLean
      .mockResolvedValueOnce({ ...SA_PROFILE, assigneeRole: "agent", parentProfileId: "parent", profitTarget: 300 })
      .mockResolvedValueOnce({ _id: "parent", profitTarget: 1000 });
    allocatedProfitCents.mockResolvedValue(70000); // siblings hold 700

    const res = await run({ profitTarget: 400 });

    expect(res.status).toBe(409);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("will not change the currency of a target that belongs to a team", async () => {
    exists.mockResolvedValue({ _id: "child" });

    expect((await run({ currency: "INR" })).status).toBe(409);
  });

  it("only edits active targets", async () => {
    findOneLean.mockResolvedValue({ ...SA_PROFILE, status: "completed" });

    expect((await run({ profitTarget: 1500 })).status).toBe(409);
  });

  it("ends the agent targets funded from a target that is cancelled", async () => {
    const res = await run({ status: "cancelled" });

    expect(res.status).toBe(200);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ parentProfileId: ID, status: "active" }),
      { $set: { status: "cancelled" } },
    );
  });

  it("does not revive agent targets when a target is reactivated", async () => {
    findOneLean.mockResolvedValue({ ...SA_PROFILE, status: "cancelled" });

    await run({ status: "active" });

    expect(updateMany).not.toHaveBeenCalled();
  });

  it("reports a clash with another active target as a conflict", async () => {
    findOneLean.mockResolvedValue({ ...SA_PROFILE, status: "cancelled" });
    findOneAndUpdate.mockImplementationOnce(() => { throw Object.assign(new Error("dup"), { code: 11000 }); });

    expect((await run({ status: "active" })).status).toBe(409);
  });

  it("is admin only", async () => {
    auth.mockResolvedValue({ user: { id: "sa_1", role: "super_agent", locale: "en" } });

    expect((await run({ profitTarget: 1 })).status).toBe(403);
  });
});

describe("PATCH /api/admin/target-profiles/[id]/reassign", () => {
  async function reassign() {
    const { PATCH } = await import("@/app/api/admin/target-profiles/[id]/reassign/route");
    return PATCH(
      new NextRequest(`http://localhost/api/admin/target-profiles/${ID}/reassign`, {
        method: "PATCH",
        body: JSON.stringify({ newAssigneeId: NEW_ASSIGNEE }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: ID }) },
    );
  }

  beforeEach(() => {
    userFindOneLean.mockResolvedValue({ _id: NEW_ASSIGNEE });
  });

  it("will not hand a super agent's target to someone else while their agents hold targets from it", async () => {
    findOneLean.mockResolvedValueOnce(SA_PROFILE).mockResolvedValue(null);
    exists.mockResolvedValue({ _id: "child" });

    const res = await reassign();

    expect(res.status).toBe(409);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("reassigns a super agent's target that funds nobody", async () => {
    findOneLean.mockResolvedValueOnce(SA_PROFILE).mockResolvedValue(null);

    const res = await reassign();

    expect(res.status).toBe(200);
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ targetType: "profit" }),
      { $set: { assigneeId: NEW_ASSIGNEE } },
      expect.anything(),
    );
  });
});
