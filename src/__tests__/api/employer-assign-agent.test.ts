/**
 * @jest-environment node
 */
/**
 * /api/employers/[id]/agent — admin adds, changes or removes an employer's
 * agent. Admin only: agents and super-agents hold `employers:update` in the
 * permission matrix, and withAuth checks only resource/action, so the route
 * itself must deny them (see the RBAC fall-through class of bugs).
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));

// Like the real wrapper, a thrown Response (validateBody's 400) is returned.
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function) => async (req: NextRequest, context: { params: Promise<Record<string, string>> }) => {
    try {
      return await handler(req, (req as unknown as { __ctx: unknown }).__ctx, await context.params);
    } catch (err) {
      if (err instanceof Response) return err;
      throw err;
    }
  },
}));

const logActivity = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ userId: ctx.userId, role: ctx.role })),
  logActivity: (...a: unknown[]) => logActivity(...a),
}));

const notifyAgentEmployerAssigned = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/notifications/trigger", () => ({
  notifyAgentEmployerAssigned: (...a: unknown[]) => notifyAgentEmployerAssigned(...a),
}));

const assignEmployerAgent = jest.fn();
const listAssignableAgents = jest.fn();
const resolveEmployerAgents = jest.fn();
jest.mock("@/lib/agents/employerAssignment", () => ({
  assignEmployerAgent: (...a: unknown[]) => assignEmployerAgent(...a),
  listAssignableAgents: (...a: unknown[]) => listAssignableAgents(...a),
  resolveEmployerAgents: (...a: unknown[]) => resolveEmployerAgents(...a),
}));

function lean(result: unknown) {
  const node: Record<string, unknown> = {};
  node.select = jest.fn(() => node);
  node.lean = jest.fn(async () => result);
  return node;
}
const employerFindOne = jest.fn();
const agentFindById = jest.fn();
jest.mock("@/models/Employer", () => ({ __esModule: true, Employer: { findOne: (...a: unknown[]) => employerFindOne(...a) } }));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findById: (...a: unknown[]) => agentFindById(...a) } }));

import { GET, PATCH } from "@/app/api/employers/[id]/agent/route";

const EMP_USER = "64b0000000000000000000e1";
const EMP_DOC = "64b0000000000000000000d1";
const AGENT = "64b0000000000000000000a2";
const AGENT_SUMMARY = { id: AGENT, name: "Agent", superAgentName: "Super Agent" };

function call(method: "GET" | "PATCH", role: string, body?: unknown) {
  const req = new NextRequest(`http://localhost/api/employers/${EMP_USER}/agent`, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : {}),
  });
  (req as unknown as { __ctx: unknown }).__ctx = { userId: "u_actor", role, locale: "en" };
  const handler = method === "GET" ? GET : PATCH;
  return handler(req, { params: Promise.resolve({ id: EMP_USER }) });
}

beforeEach(() => {
  jest.clearAllMocks();
  employerFindOne.mockReturnValue(lean({ _id: EMP_DOC, agentId: null, companyName: "Acme" }));
  agentFindById.mockReturnValue(lean({ userId: "u_agent" }));
  resolveEmployerAgents.mockResolvedValue(new Map([[EMP_DOC, AGENT_SUMMARY]]));
  listAssignableAgents.mockResolvedValue([{ id: AGENT, name: "Agent", email: "agent@mployedin.com", superAgentName: "Super Agent" }]);
  assignEmployerAgent.mockResolvedValue({ ok: true, changed: true, previousAgentIds: [], agentId: AGENT, movedOpenJobs: 3 });
});

describe("/api/employers/[id]/agent", () => {
  it.each(["agent", "super_agent", "employer"])("denies %s on both GET and PATCH", async (role) => {
    expect((await call("GET", role)).status).toBe(403);
    expect((await call("PATCH", role, { agentId: AGENT })).status).toBe(403);
    expect(assignEmployerAgent).not.toHaveBeenCalled();
    expect(listAssignableAgents).not.toHaveBeenCalled();
  });

  it("GET gives the admin the current agent and the agents to choose from", async () => {
    const body = await (await call("GET", "admin")).json();
    expect(body.current).toEqual(AGENT_SUMMARY);
    expect(body.agents).toHaveLength(1);
  });

  it("PATCH assigns by the employer's profile id, audits the move and tells the new agent", async () => {
    const res = await call("PATCH", "admin", { agentId: AGENT });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(assignEmployerAgent).toHaveBeenCalledWith(EMP_DOC, AGENT);
    expect(body).toEqual({ changed: true, current: AGENT_SUMMARY, movedOpenJobs: 3 });
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({
      action: "employer.assign_agent",
      resourceId: EMP_USER,
      changes: { before: { agentIds: [] }, after: { agentId: AGENT, movedOpenJobs: 3 } },
    }));
    expect(notifyAgentEmployerAssigned).toHaveBeenCalledWith("u_agent", "Acme", EMP_DOC);
  });

  it("PATCH with null removes the agent and notifies nobody", async () => {
    assignEmployerAgent.mockResolvedValue({ ok: true, changed: true, previousAgentIds: [AGENT], agentId: null, movedOpenJobs: 0 });
    resolveEmployerAgents.mockResolvedValue(new Map());

    const body = await (await call("PATCH", "admin", { agentId: null })).json();
    expect(assignEmployerAgent).toHaveBeenCalledWith(EMP_DOC, null);
    expect(body.current).toBeNull();
    expect(notifyAgentEmployerAssigned).not.toHaveBeenCalled();
  });

  it("does not audit or notify a no-op, and passes the helper's refusal through", async () => {
    assignEmployerAgent.mockResolvedValueOnce({ ok: true, changed: false, previousAgentIds: [AGENT], agentId: AGENT, movedOpenJobs: 0 });
    await call("PATCH", "admin", { agentId: AGENT });
    expect(logActivity).not.toHaveBeenCalled();
    expect(notifyAgentEmployerAssigned).not.toHaveBeenCalled();

    assignEmployerAgent.mockResolvedValueOnce({ ok: false, status: 400, error: "That agent account is inactive" });
    const res = await call("PATCH", "admin", { agentId: AGENT });
    expect(res.status).toBe(400);
  });

  it("rejects a malformed agent id and an unknown employer", async () => {
    expect((await call("PATCH", "admin", { agentId: "not-an-id" })).status).toBe(400);
    expect((await call("PATCH", "admin", {})).status).toBe(400);

    employerFindOne.mockReturnValue(lean(null));
    expect((await call("PATCH", "admin", { agentId: AGENT })).status).toBe(404);
    expect(assignEmployerAgent).not.toHaveBeenCalled();
  });
});
