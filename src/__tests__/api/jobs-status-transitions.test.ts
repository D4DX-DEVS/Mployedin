/**
 * @jest-environment node
 */
/**
 * PATCH /api/jobs/[id] refuses status moves outside the five-status state
 * machine (workspace spec §3.12, decision 5: closed is final). The pure table
 * is tested on its own; the handler tests check the wire contract — 409 with
 * the attempted edge, and a normal save for every allowed one.
 */
import { NextRequest, NextResponse } from "next/server";
import { canTransitionJobStatus, expiryExtended, JOB_STATUS_TRANSITIONS } from "@/lib/jobs/statusTransitions";

const EMPLOYER = "651000000000000000000001";
const JOB_ID = "651000000000000000000003";

let mockJob: Record<string, unknown> = {};

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ actorId: ctx.userId, actorRole: ctx.role })),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/auth/agentRestrictions", () => ({ getScopedEmployerIds: jest.fn() }));
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: { findById: jest.fn(() => Promise.resolve(mockJob)) },
}));
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  Employer: {
    findOne: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: EMPLOYER }) }),
    }),
  },
}));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findOne: jest.fn() } }));

async function patch(from: string, body: Record<string, unknown>) {
  mockJob = { _id: JOB_ID, employerId: EMPLOYER, agentId: null, status: from, save: jest.fn().mockResolvedValue(undefined) };
  const { patchHandler } = await import("@/app/api/jobs/[id]/handlers");
  const req = new NextRequest(`http://localhost:3000/api/jobs/${JOB_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  try {
    return await patchHandler(req, { userId: "651000000000000000000009", role: "employer", locale: "en" }, { id: JOB_ID });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    throw err;
  }
}

const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

describe("job status transition table", () => {
  it("allows exactly the spec's edges and nothing out of closed", () => {
    expect(JOB_STATUS_TRANSITIONS.closed).toEqual([]);
    expect(canTransitionJobStatus("draft", "active")).toBe(true);
    expect(canTransitionJobStatus("active", "paused")).toBe(true);
    expect(canTransitionJobStatus("active", "closed")).toBe(true);
    expect(canTransitionJobStatus("paused", "active")).toBe(true);
    expect(canTransitionJobStatus("paused", "closed")).toBe(true);
    expect(canTransitionJobStatus("expired", "active")).toBe(true);
    expect(canTransitionJobStatus("closed", "active")).toBe(false);
    expect(canTransitionJobStatus("draft", "closed")).toBe(false);
    expect(canTransitionJobStatus("active", "draft")).toBe(false);
    expect(canTransitionJobStatus("active", "active")).toBe(true);
  });

  it("treats a cleared or future deadline as an extension", () => {
    expect(expiryExtended(null)).toBe(true);
    expect(expiryExtended(future)).toBe(true);
    expect(expiryExtended(past)).toBe(false);
    expect(expiryExtended(undefined)).toBe(false);
    expect(expiryExtended("not a date")).toBe(false);
  });
});

describe("PATCH /api/jobs/[id] — status guard", () => {
  it.each([
    ["draft", "active"],
    ["active", "paused"],
    ["active", "closed"],
    ["paused", "active"],
    ["paused", "closed"],
    ["active", "active"],
  ])("saves %s → %s", async (from, to) => {
    const res = await patch(from, { status: to });
    expect(res.status).toBe(200);
    expect((mockJob.save as jest.Mock)).toHaveBeenCalled();
    expect(mockJob.status).toBe(to);
  });

  it.each([
    ["closed", "active"],
    ["closed", "paused"],
    ["draft", "closed"],
    ["draft", "paused"],
    ["active", "draft"],
    ["paused", "draft"],
  ])("refuses %s → %s with 409 and the attempted edge", async (from, to) => {
    const res = await patch(from, { status: to });
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: "INVALID_STATUS_TRANSITION", from, to });
    expect((mockJob.save as jest.Mock)).not.toHaveBeenCalled();
  });

  it("reactivates an expired job only with a new or cleared deadline", async () => {
    const bare = await patch("expired", { status: "active" });
    expect(bare.status).toBe(409);
    await expect(bare.json()).resolves.toEqual({ error: "EXPIRES_AT_REQUIRED", from: "expired", to: "active" });

    const stale = await patch("expired", { status: "active", expiresAt: past });
    expect(stale.status).toBe(409);

    const extended = await patch("expired", { status: "active", expiresAt: future });
    expect(extended.status).toBe(200);
    expect(mockJob.expiresAt).toBe(future);

    const cleared = await patch("expired", { status: "active", expiresAt: null });
    expect(cleared.status).toBe(200);
  });

  it("leaves a write with no status alone", async () => {
    const res = await patch("closed", { title: "Renamed" });
    expect(res.status).toBe(200);
    expect(mockJob.status).toBe("closed");
    expect(mockJob.title).toBe("Renamed");
  });
});
