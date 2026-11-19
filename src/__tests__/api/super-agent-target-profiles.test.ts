/**
 * @jest-environment node
 */
/**
 * POST /api/super-agent/target-profiles/create (docs/plans/2026-11-18-target-management-v2.md):
 * a super agent sets kpi3 targets for their own team only (404 otherwise),
 * revenue only when admin allowed it, never over an admin-set target, never a
 * profit figure, and every change is audited. Mocks only — no database.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function) => async (req: NextRequest) =>
    handler(req, { userId: "64b000000000000000000009", role: currentRole, locale: "en" }),
}));
const logActivity = jest.fn();
jest.mock("@/lib/audit/log", () => ({
  logActivity: (...a: unknown[]) => logActivity(...a),
  actorFromCtx: jest.fn((ctx: { userId: string; role: string }) => ({ actorId: ctx.userId, actorRole: ctx.role })),
}));

const AGENT_USER = "64b000000000000000000001";
const OTHER_AGENT = "64b000000000000000000002";
let currentRole = "super_agent";
let canSetRevenue = false;
let existing: Record<string, unknown> | null = null;

jest.mock("@/lib/auth/agentRestrictions", () => ({
  getSuperAgentTeam: jest.fn(async () => ({ saProfileId: "sa", agentIds: ["a1"], agentUserIds: [AGENT_USER] })),
}));
const lean = <T,>(v: T) => ({ select: () => ({ lean: async () => v }), lean: async () => v });
jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: { findOne: jest.fn(() => lean({ canSetRevenueTargets: canSetRevenue })) },
}));
const saved: Record<string, unknown>[] = [];
const findByIdAndUpdate = jest.fn(() => ({ lean: async () => ({ _id: "t1" }) }));
jest.mock("@/models/TargetProfile", () => {
  function TargetProfile(this: Record<string, unknown>, doc: Record<string, unknown>) {
    Object.assign(this, doc, { _id: "new1" });
    this.save = async () => { saved.push(doc); return this; };
  }
  TargetProfile.findOne = jest.fn(() => ({ lean: async () => existing }));
  TargetProfile.findByIdAndUpdate = (...a: unknown[]) => (findByIdAndUpdate as jest.Mock)(...a);
  return { __esModule: true, default: TargetProfile };
});

import { POST } from "@/app/api/super-agent/target-profiles/create/route";

function post(body: Record<string, unknown>) {
  const req = new NextRequest("http://localhost/api/super-agent/target-profiles/create", {
    method: "POST",
    body: JSON.stringify({ assigneeRole: "agent", year: 2026, currency: "AED", ...body }),
    headers: { "Content-Type": "application/json" },
  });
  return (POST as unknown as (r: NextRequest) => Promise<Response>)(req).catch((r: Response) => r);
}

beforeEach(() => {
  jest.clearAllMocks();
  saved.length = 0;
  currentRole = "super_agent";
  canSetRevenue = false;
  existing = null;
});

describe("super agent sets team targets", () => {
  it("creates a kpi3 target for a team agent, with no profit figure, and audits it", async () => {
    const res = await post({ assigneeId: AGENT_USER, jobTarget: 12, conversionTarget: 6, profitTarget: 99999 });
    expect(res.status).toBe(201);
    expect(saved[0]).toEqual(expect.objectContaining({ jobTarget: 12, targetType: "kpi3", setByRole: "super_agent", profitTarget: 0 }));
    // assignedBy is required by the model: without it every save failed with a 500.
    expect(saved[0].assignedBy).toBe("64b000000000000000000009");
    // The yearly totals are split over 12 months, not left as zero months.
    const periods = saved[0].periods as { jobTarget: number; conversionTarget: number }[];
    expect(periods).toHaveLength(12);
    expect(periods.reduce((s, p) => s + p.jobTarget, 0)).toBe(12);
    expect(periods.reduce((s, p) => s + p.conversionTarget, 0)).toBe(6);
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "target.create", resource: "targets" }));
  });

  it("returns 404 for an agent outside the team", async () => {
    const res = await post({ assigneeId: OTHER_AGENT, jobTarget: 5 });
    expect(res.status).toBe(404);
    expect(saved).toHaveLength(0);
  });

  it("refuses a revenue target unless admin allowed it", async () => {
    expect((await post({ assigneeId: AGENT_USER, revenueTarget: 5000 })).status).toBe(403);
    canSetRevenue = true;
    expect((await post({ assigneeId: AGENT_USER, revenueTarget: 5000 })).status).toBe(201);
  });

  it("cannot edit a target admin set or overrode", async () => {
    existing = { _id: "t1", setByRole: "admin", jobTarget: 10 };
    expect((await post({ assigneeId: AGENT_USER, jobTarget: 3 })).status).toBe(403);
    existing = { _id: "t1", setByRole: "super_agent", overriddenByAdmin: true };
    expect((await post({ assigneeId: AGENT_USER, jobTarget: 3 })).status).toBe(403);
    expect(findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("edits its own earlier target and audits before/after", async () => {
    existing = { _id: "t1", setByRole: "super_agent", jobTarget: 10, conversionTarget: 2, revenueTarget: 0 };
    const res = await post({ assigneeId: AGENT_USER, jobTarget: 14 });
    expect(res.status).toBe(200);
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({
      action: "target.update",
      changes: { before: expect.objectContaining({ jobTarget: 10 }), after: expect.objectContaining({ jobTarget: 14 }) },
    }));
  });

  it("is forbidden to other roles", async () => {
    currentRole = "agent";
    expect((await post({ assigneeId: AGENT_USER, jobTarget: 1 })).status).toBe(403);
  });
});
