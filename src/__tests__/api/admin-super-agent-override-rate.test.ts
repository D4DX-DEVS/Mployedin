/**
 * @jest-environment node
 */
/**
 * PATCH /api/admin/super-agents — override commission rate with a start date.
 * Every change is appended to SuperAgent.overrideRateHistory and audited; the
 * stored `overrideRate` only moves once the change has started, so a future
 * date never changes today's invoices.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function) => async (req: NextRequest) => handler(req, { userId: "64b000000000000000000009", role: "admin", locale: "en" }),
}));
const logActivity = jest.fn();
jest.mock("@/lib/audit/log", () => ({ logActivity: (...a: unknown[]) => logActivity(...a), actorFromCtx: jest.fn(() => ({})) }));
jest.mock("@/lib/targets/profileAchievementCalculator", () => ({ enrichProfiles: jest.fn() }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
jest.mock("bcryptjs", () => ({ __esModule: true, default: { hash: jest.fn(async () => "hash") } }));
jest.mock("@/models/TargetProfile", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/City", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/State", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { updateMany: jest.fn(async () => ({})) } }));

function lean<T>(value: T) {
  const node: Record<string, unknown> = {};
  node.select = jest.fn(() => node);
  node.lean = jest.fn(async () => value);
  return node;
}

let currentRate = 1.5;
const findOneAndUpdate = jest.fn(async () => ({ _id: "sa_self" }));
jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => lean({ _id: "sa_self", overrideRate: currentRate })),
    findOneAndUpdate: (...a: unknown[]) => findOneAndUpdate(...(a as [])),
    updateMany: jest.fn(async () => ({})),
  },
}));
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    findByIdAndUpdate: jest.fn(async () => ({})),
    findById: jest.fn(() => ({ select: () => lean({ role: "super_agent" }) })),
  },
}));

import { PATCH } from "@/app/api/admin/super-agents/route";

const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
const USER = "64b000000000000000000001";

function patch(body: Record<string, unknown>) {
  const req = new NextRequest("http://localhost/api/admin/super-agents", {
    method: "PATCH",
    body: JSON.stringify({ userId: USER, ...body }),
    headers: { "Content-Type": "application/json" },
  });
  return PATCH(req as never, { params: Promise.resolve({}) } as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  currentRate = 1.5;
});

describe("super agent override rate with a start date", () => {
  it("a change starting today updates the rate and appends to history", async () => {
    const res = await patch({ overrideCommissionRate: 2, overrideRateReason: "Annual review" });
    expect(res.status).toBe(200);
    const [, update] = findOneAndUpdate.mock.calls[0] as unknown as [unknown, { $set: Record<string, unknown>; $push: { overrideRateHistory: Record<string, unknown> } }];
    expect(update.$set.overrideRate).toBe(2);
    expect(update.$push.overrideRateHistory).toEqual(expect.objectContaining({ rate: 2, setByRole: "admin", reason: "Annual review" }));
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "commission_rate.super_agent_set" }));
  });

  it("a future change is recorded but does not change today's rate", async () => {
    await patch({ overrideCommissionRate: 3, overrideRateEffectiveFrom: iso(30) });
    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [, update] = findOneAndUpdate.mock.calls[0] as unknown as [unknown, { $set: Record<string, unknown>; $push: { overrideRateHistory: { effectiveFrom: Date } } }];
    expect(update.$set.overrideRate).toBeUndefined();
    expect(update.$push.overrideRateHistory.effectiveFrom.toISOString().slice(0, 10)).toBe(iso(30));
  });

  it("saving the same rate with no date adds nothing", async () => {
    await patch({ overrideCommissionRate: 1.5, name: "Same" });
    const call = findOneAndUpdate.mock.calls[0] as unknown as [unknown, Record<string, unknown>] | undefined;
    expect(call?.[1]?.$push).toBeUndefined();
    expect(logActivity).not.toHaveBeenCalledWith(expect.objectContaining({ action: "commission_rate.super_agent_set" }));
  });

  it("rejects a malformed start date", async () => {
    // validateBody throws its 400 response; the real withAuth returns it.
    const res = await patch({ overrideCommissionRate: 2, overrideRateEffectiveFrom: "18/11/2026" }).catch((r: Response) => r);
    expect(res.status).toBe(400);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });
});
