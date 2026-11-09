/**
 * @jest-environment node
 *
 * /api/super-agent/employers/[id]/agent — a super agent hands an employer in
 * their book to one of their own agents; never to or from another team.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
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
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn() } }));
const logActivity = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ userId: ctx.userId, role: ctx.role })),
  logActivity: (...a: unknown[]) => logActivity(...a),
}));
const notifyEmployerAgentChange = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/notifications/employerCoverage", () => ({
  notifyEmployerAgentChange: (...a: unknown[]) => notifyEmployerAgentChange(...a),
}));
const getSuperAgentBook = jest.fn();
jest.mock("@/lib/auth/agentRestrictions", () => ({ getSuperAgentBook: (...a: unknown[]) => getSuperAgentBook(...a) }));
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
const agentFind = jest.fn();
jest.mock("@/models/Employer", () => ({ __esModule: true, Employer: { findOne: (...a: unknown[]) => employerFindOne(...a) } }));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { find: (...a: unknown[]) => agentFind(...a) } }));

import { GET, PATCH } from "@/app/api/super-agent/employers/[id]/agent/route";

const EMP_USER = "64b0000000000000000000e1";
const EMP_DOC = "64b0000000000000000000d1";
const MINE = "64b0000000000000000000a1";
const MINE_2 = "64b0000000000000000000a2";
const THEIRS = "64b0000000000000000000a9";

function call(method: "GET" | "PATCH", role: string, body?: unknown) {
  const req = new NextRequest(`http://localhost/api/super-agent/employers/${EMP_USER}/agent`, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : {}),
  });
  (req as unknown as { __ctx: unknown }).__ctx = { userId: "u_sa", role, locale: "en" };
  const handler = method === "GET" ? GET : PATCH;
  return handler(req, { params: Promise.resolve({ id: EMP_USER }) });
}

beforeEach(() => {
  jest.clearAllMocks();
  getSuperAgentBook.mockResolvedValue({ agentIds: [MINE, MINE_2], employerIds: [EMP_DOC] });
  employerFindOne.mockReturnValue(lean({ _id: EMP_DOC, agentId: MINE, companyName: "Acme" }));
  agentFind.mockReturnValue(lean([{ _id: MINE }]));
  resolveEmployerAgents.mockResolvedValue(new Map([[EMP_DOC, { id: MINE, name: "Mina", superAgentName: null }]]));
  listAssignableAgents.mockResolvedValue([
    { id: MINE, name: "Mina" }, { id: MINE_2, name: "Omar" }, { id: THEIRS, name: "Zed" },
  ]);
});

describe("super-agent employer assignment", () => {
  it("only lists the super agent's own agents", async () => {
    const body = await (await call("GET", "super_agent")).json();
    expect(body.agents.map((a: { id: string }) => a.id)).toEqual([MINE, MINE_2]);
  });

  it("moves an employer between team agents and tells both", async () => {
    assignEmployerAgent.mockResolvedValue({ ok: true, changed: true, previousAgentIds: [MINE], agentId: MINE_2, movedOpenJobs: 2 });
    const res = await call("PATCH", "super_agent", { agentId: MINE_2 });
    expect(res.status).toBe(200);
    expect(assignEmployerAgent).toHaveBeenCalledWith(EMP_DOC, MINE_2);
    expect(notifyEmployerAgentChange).toHaveBeenCalledWith({
      employerId: EMP_DOC, companyName: "Acme", newAgentId: MINE_2, previousAgentIds: [MINE], assignedBy: "super_agent",
    });
  });

  it("refuses an agent from another team", async () => {
    const res = await call("PATCH", "super_agent", { agentId: THEIRS });
    expect(res.status).toBe(400);
    expect(assignEmployerAgent).not.toHaveBeenCalled();
  });

  it("refuses to take an employer another team's agent looks after", async () => {
    employerFindOne.mockReturnValue(lean({ _id: EMP_DOC, agentId: THEIRS, companyName: "Acme" }));
    agentFind.mockReturnValue(lean([{ _id: THEIRS }]));
    expect((await call("PATCH", "super_agent", { agentId: MINE })).status).toBe(403);
    expect(assignEmployerAgent).not.toHaveBeenCalled();
  });

  it("hides employers outside the book and refuses other roles", async () => {
    getSuperAgentBook.mockResolvedValue({ agentIds: [MINE], employerIds: [] });
    expect((await call("PATCH", "super_agent", { agentId: MINE })).status).toBe(404);
    expect((await call("PATCH", "agent", { agentId: MINE })).status).toBe(403);
    expect(assignEmployerAgent).not.toHaveBeenCalled();
  });

  it("assigns an unassigned region employer", async () => {
    employerFindOne.mockReturnValue(lean({ _id: EMP_DOC, companyName: "Acme" }));
    agentFind.mockReturnValue(lean([]));
    assignEmployerAgent.mockResolvedValue({ ok: true, changed: true, previousAgentIds: [], agentId: MINE, movedOpenJobs: 0 });
    expect((await call("PATCH", "super_agent", { agentId: MINE })).status).toBe(200);
  });
});
