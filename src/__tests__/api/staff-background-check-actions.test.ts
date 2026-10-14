/**
 * @jest-environment node
 *
 * GET/PATCH /api/background-checks/[id] — agents run the background checks of
 * employers they work with (owner decision 2026-10-14). Only agents act; super
 * agents and admins read. A check outside the caller's scope answers 404, the
 * employer's internal notes never reach staff, and the action is credited to
 * the agent from the session — never to an id the client sends.
 */
import { NextRequest } from "next/server";

const CHECK = "651000000000000000000c01";
const EMP_A = "651000000000000000000a01";
let mockCtx = { userId: "651000000000000000000009", role: "agent", locale: "en" };
const mockScope = jest.fn();
const mockRun = jest.fn();
const mockLoad = jest.fn();
const mockRecord = jest.fn();
const mockNotifyCompleted = jest.fn();

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown, params: unknown) => Promise<Response>) =>
    (req: NextRequest, routeCtx: { params: Record<string, string> }) => handler(req, mockCtx, routeCtx.params),
}));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/backgroundChecks/scope", () => ({
  staffCheckFilter: (...a: unknown[]) => mockScope(...a),
  staffActor: (ctx: { userId: string; role: string }) => ({
    userId: ctx.userId,
    side: "staff",
    canManage: false,
    canPerform: ctx.role === "agent",
  }),
}));
jest.mock("@/lib/backgroundChecks/workflow", () => ({ runCheckAction: (...a: unknown[]) => mockRun(...a) }));
jest.mock("@/lib/backgroundChecks/detail", () => ({ loadCheckDetail: (...a: unknown[]) => mockLoad(...a) }));
jest.mock("@/lib/backgroundChecks/history", () => ({ recordCheckEvent: (...a: unknown[]) => mockRecord(...a) }));
jest.mock("@/lib/backgroundChecks/people", () => ({ notifyCompleted: (...a: unknown[]) => mockNotifyCompleted(...a) }));
jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: (ctx: { userId: string; role: string }) => ({ actorId: ctx.userId, actorRole: ctx.role }),
}));
jest.mock("@/models/Employer", () => ({
  Employer: { findById: jest.fn(() => ({ select: () => ({ lean: async () => ({ userId: "owner1" }) }) })) },
}));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn() } }));

const detail = { check: { _id: CHECK, employerId: { _id: EMP_A, companyName: "Acme" }, jobId: { title: "Driver" } }, history: [] };

async function call(method: "GET" | "PATCH", body?: unknown, id = CHECK) {
  const route = await import("@/app/api/background-checks/[id]/route");
  const req = new NextRequest(`http://localhost/api/background-checks/${id}`, {
    method,
    ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const handler = method === "GET" ? route.GET : route.PATCH;
  try {
    return await handler(req, { params: { id } } as never);
  } catch (thrown) {
    // validateBody throws its 400 response; withAuth would return it.
    return thrown as Response;
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCtx = { userId: "651000000000000000000009", role: "agent", locale: "en" };
  mockScope.mockResolvedValue({ employerId: { $in: [EMP_A] } });
  mockRun.mockResolvedValue({ ok: true, event: { action: "background_check.start", meta: {} } });
  mockLoad.mockResolvedValue(detail);
});

it("reads one check within scope, without the employer's notes", async () => {
  const res = await call("GET");
  expect(res.status).toBe(200);
  expect(mockLoad).toHaveBeenCalledWith(
    expect.objectContaining({ filter: { _id: CHECK, employerId: { $in: [EMP_A] } }, includeNotes: false })
  );
});

it("answers 404 for a check outside the caller's scope", async () => {
  mockLoad.mockResolvedValue(null);
  expect((await call("GET")).status).toBe(404);
  mockScope.mockResolvedValue("none");
  expect((await call("GET")).status).toBe(404);
  expect((await call("PATCH", { action: "start" })).status).toBe(404);
  expect(mockRun).not.toHaveBeenCalled();
});

it("is closed to employers and job seekers", async () => {
  for (const role of ["employer", "job_seeker"]) {
    mockCtx = { ...mockCtx, role };
    expect((await call("GET")).status).toBe(403);
    expect((await call("PATCH", { action: "start" })).status).toBe(403);
  }
});

it("lets super agents read but not act", async () => {
  mockCtx = { ...mockCtx, role: "super_agent" };
  expect((await call("GET")).status).toBe(200);
  expect((await call("PATCH", { action: "start" })).status).toBe(403);
  expect(mockRun).not.toHaveBeenCalled();
});

it("starts a check as the agent in the session, inside their scope, and records it", async () => {
  const res = await call("PATCH", { action: "start", userId: "someone-else" });
  expect(res.status).toBe(200);
  expect(mockRun).toHaveBeenCalledWith(
    expect.objectContaining({
      checkId: CHECK,
      scope: { employerId: { $in: [EMP_A] } },
      actor: expect.objectContaining({ userId: mockCtx.userId, side: "staff", canPerform: true }),
      body: { action: "start" },
    })
  );
  expect(mockRecord).toHaveBeenCalledWith(
    expect.objectContaining({ checkId: CHECK, actor: { actorId: mockCtx.userId, actorRole: "agent" } })
  );
});

it("refuses employer-only actions from an agent", async () => {
  for (const body of [{ action: "assign", assignedTo: null }, { action: "cancel" }, { action: "notes", backgroundNotes: "x" }]) {
    expect({ body, status: (await call("PATCH", body)).status }).toEqual({ body, status: 400 });
  }
  expect(mockRun).not.toHaveBeenCalled();
});

it("passes a refusal through with its code", async () => {
  mockRun.mockResolvedValue({ ok: false, status: 409, code: "held_by_other", error: "Someone else is handling this check." });
  const res = await call("PATCH", { action: "start" });
  expect(res.status).toBe(409);
  expect(await res.json()).toEqual({ code: "held_by_other", error: "Someone else is handling this check." });
  expect(mockRecord).not.toHaveBeenCalled();
});

it("tells the employer when the agent completes the check", async () => {
  mockRun.mockResolvedValue({ ok: true, event: { action: "background_check.complete", meta: { outcome: "clear" } } });
  mockNotifyCompleted.mockResolvedValue(undefined);
  const res = await call("PATCH", { action: "complete", outcome: "clear", backgroundResults: "All good" });
  expect(res.status).toBe(200);
  expect(mockNotifyCompleted).toHaveBeenCalledWith(["owner1", undefined], expect.objectContaining({ checkId: CHECK }));
});
