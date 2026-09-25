/**
 * @jest-environment node
 */
/**
 * GET /api/employers (admin/employer branch):
 *  - `agentId=none|any|<id>` filters by the agent running the account, on its
 *    own (it used to apply only alongside industry/location/verified, so the
 *    admin invoice builder's "this agent's employers" list showed everyone);
 *  - each row carries its agent + super-agent;
 *  - an employer can never widen the query past its own account with a filter.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function) => async (req: NextRequest) =>
    handler(req, (req as unknown as { __ctx: unknown }).__ctx, {}),
}));
jest.mock("@/lib/audit/log", () => ({ actorFromCtx: jest.fn(), logActivity: jest.fn() }));
jest.mock("@/lib/communications/email", () => ({ sendEmail: jest.fn(), EmailTemplates: {} }));
jest.mock("@/lib/auth/agentRestrictions", () => ({ getSuperAgentScope: jest.fn() }));

const unassignedEmployerFilter = jest.fn();
const resolveEmployerAgents = jest.fn();
jest.mock("@/lib/agents/employerAssignment", () => ({
  unassignedEmployerFilter: (...a: unknown[]) => unassignedEmployerFilter(...a),
  resolveEmployerAgents: (...a: unknown[]) => resolveEmployerAgents(...a),
}));

function chain(result: unknown) {
  const node: Record<string, unknown> = {};
  for (const m of ["select", "sort", "skip", "limit", "populate"]) node[m] = jest.fn(() => node);
  node.lean = jest.fn(async () => result);
  return node;
}

const userFind = jest.fn();
const userCount = jest.fn();
const employerFind = jest.fn();
const employerFindOne = jest.fn();
const agentDistinct = jest.fn();
const agentFindById = jest.fn();

jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { find: (...a: unknown[]) => userFind(...a), countDocuments: (...a: unknown[]) => userCount(...a) },
}));
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  default: { find: (...a: unknown[]) => employerFind(...a), findOne: (...a: unknown[]) => employerFindOne(...a) },
}));
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: { distinct: (...a: unknown[]) => agentDistinct(...a), findById: (...a: unknown[]) => agentFindById(...a) },
}));
jest.mock("@/models/CompanyUser", () => ({ CompanyUser: {}, getDefaultPermissions: jest.fn() }));

import { GET } from "@/app/api/employers/route";

const U1 = { _id: "u1", name: "Acme HR", email: "hr@acme.test", isActive: true, createdAt: new Date() };
const E1 = { _id: "e1", userId: "u1", companyName: "Acme", agentId: "a1" };

function get(qs: string, ctx: Record<string, unknown> = { userId: "admin", role: "admin", locale: "en" }) {
  const req = new NextRequest(`http://localhost/api/employers?${qs}`);
  (req as unknown as { __ctx: unknown }).__ctx = ctx;
  return (GET as unknown as (r: NextRequest) => Promise<Response>)(req);
}

beforeEach(() => {
  jest.clearAllMocks();
  userFind.mockReturnValue(chain([U1]));
  userCount.mockResolvedValue(1);
  employerFind.mockImplementation(() => chain([E1]));
  unassignedEmployerFilter.mockResolvedValue({ UNASSIGNED: true });
  agentDistinct.mockResolvedValue(["e9"]);
  resolveEmployerAgents.mockResolvedValue(new Map([["e1", { id: "a1", name: "Agent", superAgentName: "Super Agent" }]]));
});

describe("GET /api/employers agent filter", () => {
  it("agentId=none narrows to employers no agent looks after — with no other filter set", async () => {
    await get("agentId=none&status=all");
    expect(employerFind).toHaveBeenCalledWith({ $and: [{ UNASSIGNED: true }] });
    expect(userFind.mock.calls[0][0]._id).toEqual({ $in: ["u1"] });
  });

  it("agentId=any matches either end of the link", async () => {
    await get("agentId=any");
    expect(employerFind).toHaveBeenCalledWith({
      $and: [{ $or: [{ agentId: { $ne: null } }, { _id: { $in: ["e9"] } }] }],
    });
  });

  it("agentId=<id> matches that agent's employers from both ends; an unknown id matches nothing", async () => {
    agentFindById.mockReturnValue(chain({ _id: "64b0000000000000000000a1", assignedEmployerIds: ["e2"] }));
    await get("agentId=64b0000000000000000000a1");
    expect(employerFind).toHaveBeenCalledWith({
      $and: [{ $or: [{ agentId: "64b0000000000000000000a1" }, { _id: { $in: ["e2"] } }] }],
    });

    employerFind.mockClear();
    await get("agentId=garbage");
    expect(employerFind).toHaveBeenCalledWith({ $and: [{ _id: null }] });
  });

  it("returns each employer's agent and super-agent", async () => {
    const body = await (await get("")).json();
    expect(body.employers[0].assignedAgent).toEqual({ id: "a1", name: "Agent", superAgentName: "Super Agent" });
  });

  it("keeps an employer pinned to its own account whatever filters it sends", async () => {
    employerFindOne.mockReturnValue(chain({ userId: "u_self" }));
    employerFind.mockImplementation(() => chain([E1, { _id: "e2", userId: "u_other" }]));

    await get("industry=IT&agentId=any", { userId: "u_self", role: "employer", locale: "en" });

    // The filter blocks assign query._id; the employer pin must win.
    expect(userFind.mock.calls[0][0]._id).toBe("u_self");
  });
});
