/**
 * @jest-environment node
 */
/**
 * Seeing an employer is not owning it.
 *
 * Agents and super-agents see every employer registered in their region, but
 * posting jobs and entering the account still need the explicit assignment.
 *  - The list flags each row, so the pages offer those actions only where the
 *    server would allow them (agent: `assignedToMe`; super-agent:
 *    `canEnterAccount` — the employer's agent is on the SA's own team).
 *  - GET /api/employers/[id] reads what the list shows: an employer visible
 *    only through the region no longer 403s on click-through.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function) => async (req: NextRequest, params?: Record<string, string>) =>
    handler(req, (req as unknown as { __ctx: unknown }).__ctx, params ?? {}),
}));
jest.mock("@/lib/audit/log", () => ({ actorFromCtx: jest.fn(), logActivity: jest.fn() }));
jest.mock("@/lib/communications/email", () => ({ sendEmail: jest.fn(), EmailTemplates: {} }));
jest.mock("@/lib/employers/accountStatus", () => ({ deactivateEmployerAccount: jest.fn() }));

const getAgentEmployerIds = jest.fn();
const getSuperAgentBook = jest.fn();
const agentCanSeeEmployer = jest.fn();
jest.mock("@/lib/auth/agentRestrictions", () => ({
  getAgentEmployerIds: (...a: unknown[]) => getAgentEmployerIds(...a),
  getSuperAgentBook: (...a: unknown[]) => getSuperAgentBook(...a),
  agentCanSeeEmployer: (...a: unknown[]) => agentCanSeeEmployer(...a),
  getSuperAgentOwnRegion: jest.fn(),
  hasRegionAssigned: jest.fn(),
}));
jest.mock("@/lib/agents/employerAssignment", () => ({
  unassignedEmployerFilter: jest.fn(),
  resolveEmployerAgents: jest.fn(),
}));

function chain(result: unknown) {
  const node: Record<string, unknown> = {};
  for (const m of ["select", "sort", "skip", "limit", "populate"]) node[m] = jest.fn(() => node);
  node.lean = jest.fn(async () => result);
  return node;
}

const EMP_ASSIGNED = "64b0000000000000000000e1";
const EMP_REGION = "64b0000000000000000000e2";
const TEAM_AGENT = "64b0000000000000000000a1";
const OTHER_AGENT = "64b0000000000000000000a2";

const employerFind = jest.fn();
const employerCount = jest.fn();
const employerFindOne = jest.fn();
const employerAggregate = jest.fn();
const agentFindOne = jest.fn();
const userFind = jest.fn();
const userFindById = jest.fn();

jest.mock("@/models/Employer", () => {
  const model = {
    find: (...a: unknown[]) => employerFind(...a),
    findOne: (...a: unknown[]) => employerFindOne(...a),
    countDocuments: (...a: unknown[]) => employerCount(...a),
    aggregate: (...a: unknown[]) => employerAggregate(...a),
  };
  return { __esModule: true, default: model, Employer: model };
});
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: { findOne: (...a: unknown[]) => agentFindOne(...a) },
}));
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { find: (...a: unknown[]) => userFind(...a), findById: (...a: unknown[]) => userFindById(...a) },
}));
jest.mock("@/models/CompanyUser", () => ({ CompanyUser: {}, getDefaultPermissions: jest.fn() }));

import { GET as LIST_ROUTE } from "@/app/api/employers/route";
import { GET as DETAIL } from "@/app/api/employers/[id]/route";

const LIST = LIST_ROUTE as unknown as (r: NextRequest) => Promise<Response>;

function req(url: string, ctx: { userId: string; role: string }) {
  const r = new NextRequest(url);
  (r as unknown as { __ctx: unknown }).__ctx = { ...ctx, locale: "en" };
  return r;
}

const profile = (id: string, agent?: string) => ({
  _id: id,
  companyName: `Co ${id.slice(-2)}`,
  userId: { _id: `user-${id}`, name: "HR", email: "hr@co.test", isActive: true },
  agentId: agent ? { _id: agent, userId: `agent-user-${agent}` } : undefined,
});

beforeEach(() => {
  jest.clearAllMocks();
  employerCount.mockResolvedValue(2);
  employerAggregate.mockResolvedValue([]);
  userFind.mockReturnValue(chain([]));
});

describe("GET /api/employers — who may act on each row", () => {
  it("agent: only assigned rows are actionable; region rows are visible", async () => {
    agentFindOne.mockReturnValue(chain({ _id: TEAM_AGENT, assignedEmployerIds: [EMP_ASSIGNED] }));
    getAgentEmployerIds.mockResolvedValue([EMP_ASSIGNED, EMP_REGION]);
    employerFind.mockReturnValue(chain([profile(EMP_ASSIGNED), profile(EMP_REGION)]));

    const res = await LIST(req("http://t/api/employers", { userId: "agent-user", role: "agent" }));
    const body = await res.json();

    expect(body.employers.map((e: { _id: string; assignedToMe: boolean }) => [e._id, e.assignedToMe])).toEqual([
      [EMP_ASSIGNED, true],
      [EMP_REGION, false],
    ]);
  });

  it("super-agent: only rows whose agent is on the SA's team can be entered", async () => {
    getSuperAgentBook.mockResolvedValue({
      agentIds: [TEAM_AGENT, OTHER_AGENT],
      teamAgentIds: [TEAM_AGENT],
      employerIds: [EMP_ASSIGNED, EMP_REGION],
    });
    employerFind.mockReturnValue(chain([profile(EMP_ASSIGNED, TEAM_AGENT), profile(EMP_REGION)]));

    const res = await LIST(req("http://t/api/employers", { userId: "sa-user", role: "super_agent" }));
    const body = await res.json();

    expect(body.employers.map((e: { _id: string; canEnterAccount: boolean }) => [e._id, e.canEnterAccount])).toEqual([
      [EMP_ASSIGNED, true],
      [EMP_REGION, false],
    ]);
  });
});

describe("GET /api/employers/[id] — reads what the list shows", () => {
  const call = (role: string) =>
    (DETAIL as unknown as (r: NextRequest, p: Record<string, string>) => Promise<Response>)(
      req(`http://t/api/employers/${"64b00000000000000000001f"}`, { userId: `${role}-user`, role }),
      { id: "64b00000000000000000001f" },
    );

  beforeEach(() => {
    employerFindOne.mockReturnValue(chain({ _id: EMP_REGION }));
    userFindById.mockReturnValue(chain({ _id: "64b00000000000000000001f", name: "HR" }));
  });

  it("an agent who sees the employer through the region may read it", async () => {
    agentCanSeeEmployer.mockResolvedValue(true);
    const res = await call("agent");
    expect(res.status).toBe(200);
    expect(agentCanSeeEmployer).toHaveBeenCalledWith("agent-user", EMP_REGION);
  });

  it("an agent who cannot see it gets 403", async () => {
    agentCanSeeEmployer.mockResolvedValue(false);
    expect((await call("agent")).status).toBe(403);
  });

  it("a super-agent reads employers in the book, and only those", async () => {
    getSuperAgentBook.mockResolvedValue({ employerIds: [EMP_REGION] });
    expect((await call("super_agent")).status).toBe(200);

    getSuperAgentBook.mockResolvedValue({ employerIds: [EMP_ASSIGNED] });
    expect((await call("super_agent")).status).toBe(403);
  });

  it("an unknown employer is refused, not read", async () => {
    employerFindOne.mockReturnValue(chain(null));
    expect((await call("agent")).status).toBe(403);
    expect((await call("super_agent")).status).toBe(403);
    expect(userFindById).not.toHaveBeenCalled();
  });
});
