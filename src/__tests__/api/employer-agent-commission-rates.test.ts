/**
 * @jest-environment node
 */
/**
 * Agent commission rate per employer (docs/plans/2026-11-18-target-management-v2.md R5):
 * effective-dated and append-only; admin sets any; a super agent only their
 * team's and never over an admin rate in effect or still to come; an agent reads
 * only their own employers. Every change is audited.
 */
import { NextRequest } from "next/server";
import { employerRateView, isLockedByAdmin } from "@/lib/commissions/employerRateHistory";

jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, default: jest.fn(), connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/config", () => ({ auth: jest.fn() }));
jest.mock("@/lib/permissions/matrix", () => ({ canAccess: jest.fn().mockReturnValue(true) }));
const logActivity = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ actorId: ctx.userId, actorRole: ctx.role })),
  logActivity: (...a: unknown[]) => logActivity(...a),
}));

const EMPLOYER_USER = "507f1f77bcf86cd799439011";
const EMPLOYER_DOC = "507f1f77bcf86cd799439012";
const AGENT_DOC = "507f1f77bcf86cd799439021";
const SA_DOC = "507f1f77bcf86cd799439031";
const ADMIN = "507f1f77bcf86cd799439041";

let employer: Record<string, unknown> | null;
let agentInTeam = true;
const employerUpdateOne = jest.fn();

jest.mock("@/models/Employer", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({ select: () => ({ lean: async () => employer }) })),
    findById: jest.fn(() => ({ select: () => ({ lean: async () => employer }) })),
    updateOne: (...a: unknown[]) => employerUpdateOne(...a),
  },
}));
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: {
    exists: jest.fn(async () => (agentInTeam ? { _id: AGENT_DOC } : null)),
    findOne: jest.fn(() => ({ select: () => ({ lean: async () => ({ _id: AGENT_DOC }) }) })),
  },
}));
jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: { findOne: jest.fn(() => ({ select: () => ({ lean: async () => ({ _id: SA_DOC }) }) })) },
}));

const { auth } = jest.requireMock("@/lib/auth/config") as { auth: jest.Mock };
const as = (role: string, id = "507f1f77bcf86cd799439099") => auth.mockResolvedValue({ user: { id, role, locale: "en" } });

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const params = { params: Promise.resolve({ id: EMPLOYER_USER }) };
const req = (body?: unknown) =>
  new NextRequest(`http://localhost/api/x/employers/${EMPLOYER_USER}/agent-rate`, {
    method: body ? "POST" : "GET",
    ...(body ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}),
  });
const valid = { rate: 5, effectiveFrom: iso(day(1)), reason: "New contract" };

beforeEach(() => {
  jest.clearAllMocks();
  agentInTeam = true;
  employer = { _id: EMPLOYER_DOC, userId: EMPLOYER_USER, agentId: AGENT_DOC, agentCommissionRates: [] };
  employerUpdateOne.mockResolvedValue({ matchedCount: 1 });
});

describe("rate rules", () => {
  it("current rate is the one in effect today, not the newest entry", () => {
    const view = employerRateView([
      { rate: 4, effectiveFrom: day(-30), setByRole: "super_agent" },
      { rate: 6, effectiveFrom: day(10), setByRole: "super_agent" },
    ]);
    expect(view.current).toEqual(expect.objectContaining({ rate: 4, source: "employer_rate" }));
    expect(view.upcoming.map((u) => u.rate)).toEqual([6]);
  });

  it("locks super agents while an admin rate is in effect", () => {
    expect(isLockedByAdmin([{ rate: 6, effectiveFrom: day(-1), setByRole: "admin" }])).toBe(true);
  });

  it("locks super agents when an admin rate is still to come", () => {
    expect(isLockedByAdmin([
      { rate: 4, effectiveFrom: day(-30), setByRole: "super_agent" },
      { rate: 6, effectiveFrom: day(20), setByRole: "admin" },
    ])).toBe(true);
  });

  it("an admin rate replaced later by a super agent rate no longer locks", () => {
    expect(isLockedByAdmin([
      { rate: 6, effectiveFrom: day(-60), setByRole: "admin" },
      { rate: 5, effectiveFrom: day(-10), setByRole: "super_agent" },
    ])).toBe(false);
  });

  it("a super agent's own future change does not unlock a running admin rate", () => {
    expect(isLockedByAdmin([
      { rate: 6, effectiveFrom: day(-5), setByRole: "admin" },
      { rate: 3, effectiveFrom: day(30), setByRole: "super_agent" },
    ])).toBe(true);
  });
});

describe("admin endpoint", () => {
  it("appends with $push and audits", async () => {
    as("admin", ADMIN);
    const { POST } = await import("@/app/api/admin/employers/[id]/agent-rate/route");
    const res = await POST(req(valid), params);
    expect(res.status).toBe(201);
    const [filter, update] = employerUpdateOne.mock.calls[0];
    expect(filter).toEqual({ _id: EMPLOYER_DOC });
    expect(update.$push.agentCommissionRates).toEqual(expect.objectContaining({ rate: 5, setByRole: "admin", reason: "New contract" }));
    expect(update.$set).toBeUndefined();
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "commission_rate.employer_set" }));
  });

  it("rejects other roles, bad rates and a missing reason", async () => {
    const { POST } = await import("@/app/api/admin/employers/[id]/agent-rate/route");
    as("super_agent");
    expect((await POST(req(valid), params)).status).toBe(403);
    as("admin", ADMIN);
    expect((await POST(req({ ...valid, rate: 120 }), params)).status).toBe(400);
    expect((await POST(req({ ...valid, reason: "" }), params)).status).toBe(400);
    expect((await POST(req({ ...valid, effectiveFrom: "18/11/2026" }), params)).status).toBe(400);
    expect(employerUpdateOne).not.toHaveBeenCalled();
  });
});

describe("super agent endpoint", () => {
  it("sets a rate for a team employer", async () => {
    as("super_agent");
    const { POST } = await import("@/app/api/super-agent/employers/[id]/agent-rate/route");
    const res = await POST(req(valid), params);
    expect(res.status).toBe(201);
    expect(employerUpdateOne.mock.calls[0][1].$push.agentCommissionRates.setByRole).toBe("super_agent");
  });

  it("gets 404 for another team's employer, even by direct API call", async () => {
    as("super_agent");
    agentInTeam = false;
    const { GET, POST } = await import("@/app/api/super-agent/employers/[id]/agent-rate/route");
    expect((await GET(req(), params)).status).toBe(404);
    expect((await POST(req(valid), params)).status).toBe(404);
    expect(employerUpdateOne).not.toHaveBeenCalled();
  });

  it("is refused while an admin rate is in effect or still to come", async () => {
    as("super_agent");
    const { POST } = await import("@/app/api/super-agent/employers/[id]/agent-rate/route");
    employer!.agentCommissionRates = [{ rate: 6, effectiveFrom: day(15), setByRole: "admin" }];
    expect((await POST(req(valid), params)).status).toBe(403);
    employer!.agentCommissionRates = [{ rate: 6, effectiveFrom: day(-15), setByRole: "admin" }];
    expect((await POST(req(valid), params)).status).toBe(403);
    expect(employerUpdateOne).not.toHaveBeenCalled();
  });
});

describe("agent endpoint", () => {
  it("reads own employer's rate without who set it or why", async () => {
    as("agent");
    employer!.agentCommissionRates = [{ rate: 5, effectiveFrom: day(-3), setByRole: "admin", reason: "secret", setBy: ADMIN }];
    const { GET } = await import("@/app/api/agent/employers/[id]/agent-rate/route");
    const res = await GET(req(), params);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.current.rate).toBe(5);
    expect(json.history[0]).toEqual({ rate: 5, effectiveFrom: expect.any(String) });
  });

  it("gets 404 for someone else's employer", async () => {
    as("agent");
    employer!.agentId = "507f1f77bcf86cd799439029";
    const { GET } = await import("@/app/api/agent/employers/[id]/agent-rate/route");
    expect((await GET(req(), params)).status).toBe(404);
  });
});
