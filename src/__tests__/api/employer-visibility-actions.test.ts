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
const countAccountActivity = jest.fn();
jest.mock("@/lib/agents/assignedAccounts", () => ({
  countAccountActivity: (...a: unknown[]) => countAccountActivity(...a),
  NO_ACTIVITY: { openJobs: 0, newApplicants: 0, upcomingInterviews: 0, hires: 0 },
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
jest.mock("@/models/Agent", () => {
  const model = { findOne: (...a: unknown[]) => agentFindOne(...a) };
  return { __esModule: true, default: model, Agent: model };
});
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { find: (...a: unknown[]) => userFind(...a), findById: (...a: unknown[]) => userFindById(...a) },
}));
jest.mock("@/models/CompanyUser", () => ({ CompanyUser: {}, getDefaultPermissions: jest.fn() }));

import { GET as LIST_ROUTE } from "@/app/api/employers/route";
import { GET as DETAIL, PATCH as DETAIL_PATCH } from "@/app/api/employers/[id]/route";

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
  countAccountActivity.mockResolvedValue(new Map());
});

describe("GET /api/employers — who may act on each row", () => {
  it("agent: only assigned rows are actionable; region rows are visible", async () => {
    agentFindOne.mockReturnValue(chain({ _id: TEAM_AGENT, assignedEmployerIds: [EMP_ASSIGNED] }));
    getAgentEmployerIds.mockResolvedValue([EMP_ASSIGNED, EMP_REGION]);
    employerAggregate.mockResolvedValue([{ _id: EMP_ASSIGNED }, { _id: EMP_REGION }]);
    employerFind.mockReturnValue(chain([profile(EMP_ASSIGNED), profile(EMP_REGION)]));

    const res = await LIST(req("http://t/api/employers", { userId: "agent-user", role: "agent" }));
    const body = await res.json();

    expect(body.employers.map((e: { _id: string; assignedToMe: boolean }) => [e._id, e.assignedToMe])).toEqual([
      [EMP_ASSIGNED, true],
      [EMP_REGION, false],
    ]);
    // Rows are keyed by the Employer profile id; editing and opening an account
    // go through /api/employers/[userId], so each row also carries the user id.
    expect(body.employers.map((e: { userId: string }) => e.userId)).toEqual([`user-${EMP_ASSIGNED}`, `user-${EMP_REGION}`]);
  });

  it("agent: assigned employers come first, then region ones, across pages", async () => {
    // Alphabetically the assigned one would be last ("Co e1" vs "Co e2" is
    // irrelevant here — the database decides the order, the route keeps it).
    agentFindOne.mockReturnValue(chain({ _id: TEAM_AGENT, assignedEmployerIds: [EMP_ASSIGNED] }));
    getAgentEmployerIds.mockResolvedValue([EMP_REGION, EMP_ASSIGNED]);
    employerAggregate.mockResolvedValue([{ _id: EMP_ASSIGNED }, { _id: EMP_REGION }]);
    // find() returns the page in its own order; the route must restore the sorted one.
    employerFind.mockReturnValue(chain([profile(EMP_REGION), profile(EMP_ASSIGNED)]));

    const res = await LIST(req("http://t/api/employers?page=2&limit=5", { userId: "agent-user", role: "agent" }));
    const body = await res.json();

    expect(body.employers.map((e: { _id: string }) => e._id)).toEqual([EMP_ASSIGNED, EMP_REGION]);
    const [pipeline] = employerAggregate.mock.calls[0] as [Record<string, unknown>[]];
    expect(pipeline).toEqual([
      { $match: { _id: { $in: [EMP_REGION, EMP_ASSIGNED] }, roleArchivedAt: null } },
      { $addFields: { assignedFirst: { $cond: [{ $in: ["$_id", [EMP_ASSIGNED]] }, 0, 1] } } },
      { $sort: { assignedFirst: 1, companyName: 1, _id: 1 } },
      { $skip: 5 },
      { $limit: 5 },
      { $project: { _id: 1 } },
    ]);
    expect(body.pagination).toEqual({ page: 2, limit: 5, total: 2, pages: 1 });
  });

  it("agent: ?view=assigned lists only the accounts assigned to them", async () => {
    // The dashboard's assigned-accounts card links here (client feedback 2026-10-12).
    agentFindOne.mockReturnValue(chain({ _id: TEAM_AGENT, assignedEmployerIds: [EMP_ASSIGNED] }));
    getAgentEmployerIds.mockResolvedValue([EMP_REGION, EMP_ASSIGNED]);
    employerCount.mockResolvedValue(1);
    employerAggregate.mockResolvedValue([{ _id: EMP_ASSIGNED }]);
    employerFind.mockReturnValue(chain([profile(EMP_ASSIGNED)]));

    const res = await LIST(req("http://t/api/employers?view=assigned", { userId: "agent-user", role: "agent" }));
    const body = await res.json();

    const [pipeline] = employerAggregate.mock.calls[0] as [Record<string, unknown>[]];
    expect(pipeline[0]).toEqual({ $match: { _id: { $in: [EMP_ASSIGNED] }, roleArchivedAt: null } });
    expect(employerCount).toHaveBeenCalledWith({ _id: { $in: [EMP_ASSIGNED] }, roleArchivedAt: null });
    expect(body.employers.map((e: { _id: string }) => e._id)).toEqual([EMP_ASSIGNED]);
    expect(body.pagination.total).toBe(1);
  });

  it("agent: each row carries the account's numbers, counted for that page only", async () => {
    agentFindOne.mockReturnValue(chain({ _id: TEAM_AGENT, assignedEmployerIds: [EMP_ASSIGNED] }));
    getAgentEmployerIds.mockResolvedValue([EMP_ASSIGNED, EMP_REGION]);
    employerAggregate.mockResolvedValue([{ _id: EMP_ASSIGNED }, { _id: EMP_REGION }]);
    employerFind.mockReturnValue(chain([profile(EMP_ASSIGNED), profile(EMP_REGION)]));
    const numbers = { openJobs: 4, newApplicants: 3, upcomingInterviews: 2, hires: 1 };
    countAccountActivity.mockResolvedValue(new Map([[EMP_ASSIGNED, numbers]]));

    const res = await LIST(req("http://t/api/employers", { userId: "agent-user", role: "agent" }));
    const body = await res.json();

    expect(countAccountActivity).toHaveBeenCalledWith([EMP_ASSIGNED, EMP_REGION]);
    expect(body.employers.map((e: { activity: unknown }) => e.activity)).toEqual([
      numbers,
      { openJobs: 0, newApplicants: 0, upcomingInterviews: 0, hires: 0 },
    ]);
  });

  it("agent: ?view=assigned&status=active drops deactivated logins — the 'Active employers' tile's list", async () => {
    const EMP_OFF = "64b0000000000000000000ff";
    agentFindOne.mockReturnValue(chain({ _id: TEAM_AGENT, assignedEmployerIds: [EMP_ASSIGNED, EMP_OFF] }));
    getAgentEmployerIds.mockResolvedValue([EMP_ASSIGNED, EMP_OFF, EMP_REGION]);
    employerFind.mockReturnValueOnce(chain([{ _id: EMP_ASSIGNED, userId: "u-on" }, { _id: EMP_OFF, userId: "u-off" }]));
    userFind.mockReturnValueOnce(chain([{ _id: "u-on" }]));
    employerCount.mockResolvedValue(1);
    employerAggregate.mockResolvedValue([{ _id: EMP_ASSIGNED }]);
    employerFind.mockReturnValue(chain([profile(EMP_ASSIGNED)]));

    await LIST(req("http://t/api/employers?view=assigned&status=active", { userId: "agent-user", role: "agent" }));

    expect(userFind).toHaveBeenCalledWith({ _id: { $in: ["u-on", "u-off"] }, isActive: true });
    expect(employerCount).toHaveBeenCalledWith({ _id: { $in: [EMP_ASSIGNED] }, roleArchivedAt: null });
  });

  it("agent: ?status=inactive lists only the deactivated ones", async () => {
    const EMP_OFF = "64b0000000000000000000ff";
    agentFindOne.mockReturnValue(chain({ _id: TEAM_AGENT, assignedEmployerIds: [EMP_ASSIGNED, EMP_OFF] }));
    getAgentEmployerIds.mockResolvedValue([EMP_ASSIGNED, EMP_OFF]);
    employerFind.mockReturnValueOnce(chain([{ _id: EMP_ASSIGNED, userId: "u-on" }, { _id: EMP_OFF, userId: "u-off" }]));
    userFind.mockReturnValueOnce(chain([{ _id: "u-on" }]));
    employerCount.mockResolvedValue(1);
    employerAggregate.mockResolvedValue([{ _id: EMP_OFF }]);
    employerFind.mockReturnValue(chain([profile(EMP_OFF)]));

    await LIST(req("http://t/api/employers?view=assigned&status=inactive", { userId: "agent-user", role: "agent" }));

    expect(employerCount).toHaveBeenCalledWith({ _id: { $in: [EMP_OFF] }, roleArchivedAt: null });
  });

  it("agent: ?view=assigned with nothing assigned is an empty list, not the region", async () => {
    agentFindOne.mockReturnValue(chain({ _id: TEAM_AGENT, assignedEmployerIds: [] }));
    getAgentEmployerIds.mockResolvedValue([EMP_REGION]);

    const res = await LIST(req("http://t/api/employers?view=assigned", { userId: "agent-user", role: "agent" }));
    const body = await res.json();

    expect(body.employers).toEqual([]);
    expect(body.pagination.total).toBe(0);
    expect(employerAggregate).not.toHaveBeenCalled();
  });

  it("super-agent: only rows whose agent is on the SA's team can be entered", async () => {
    getSuperAgentBook.mockResolvedValue({
      agentIds: [TEAM_AGENT, OTHER_AGENT],
      teamAgentIds: [TEAM_AGENT],
      employerIds: [EMP_ASSIGNED, EMP_REGION],
      territory: { assignedCityIds: [], assignedStateIds: [] },
    });
    employerFind.mockReturnValue(chain([profile(EMP_ASSIGNED, TEAM_AGENT), profile(EMP_REGION)]));

    const res = await LIST(req("http://t/api/employers", { userId: "sa-user", role: "super_agent" }));
    const body = await res.json();

    expect(body.employers.map((e: { _id: string; canEnterAccount: boolean }) => [e._id, e.canEnterAccount])).toEqual([
      [EMP_ASSIGNED, true],
      [EMP_REGION, false],
    ]);
  });

  // Like the agent's "In your region" (2026-10-13): each row says whether the
  // employer is registered in the SA's territory, and ?view=region keeps only those.
  describe("super-agent region marking", () => {
    const CITY = "64b0000000000000000000c1";
    const STATE = "64b0000000000000000000d1";
    const book = (territory: { assignedCityIds: string[]; assignedStateIds: string[] }) =>
      getSuperAgentBook.mockResolvedValue({ agentIds: [TEAM_AGENT], teamAgentIds: [TEAM_AGENT], employerIds: [EMP_ASSIGNED, EMP_REGION], territory });

    it("flags rows registered in a territory city or state", async () => {
      book({ assignedCityIds: [CITY], assignedStateIds: [STATE] });
      employerFind.mockReturnValue(chain([
        { ...profile(EMP_ASSIGNED, TEAM_AGENT) },
        { ...profile(EMP_REGION), regionCityId: CITY },
        { ...profile("64b0000000000000000000e3"), regionStateId: STATE },
      ]));
      const body = await (await LIST(req("http://t/api/employers", { userId: "sa-user", role: "super_agent" }))).json();
      expect(body.employers.map((e: { inRegion: boolean }) => e.inRegion)).toEqual([false, true, true]);
      expect(body.regionAssigned).toBe(true);
    });

    it("?view=region narrows the query to the territory", async () => {
      book({ assignedCityIds: [CITY], assignedStateIds: [] });
      employerFind.mockReturnValue(chain([]));
      await LIST(req("http://t/api/employers?view=region", { userId: "sa-user", role: "super_agent" }));
      expect(employerFind.mock.calls[0][0].$and).toEqual([{ $or: [{ regionCityId: { $in: [CITY] } }] }]);
    });

    it("?view=region with no territory matches nothing, never everyone", async () => {
      book({ assignedCityIds: [], assignedStateIds: [] });
      employerFind.mockReturnValue(chain([]));
      const body = await (await LIST(req("http://t/api/employers?view=region", { userId: "sa-user", role: "super_agent" }))).json();
      expect(employerFind.mock.calls[0][0].$and).toEqual([{ _id: { $in: [] } }]);
      expect(body.regionAssigned).toBe(false);
    });
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

/**
 * `params.id` is the employer's USER id; `assignedEmployerIds` holds Employer
 * PROFILE ids. Comparing the two directly 403'd every agent edit.
 */
describe("PATCH /api/employers/[id] — agents edit only employers assigned to them", () => {
  const EMP_USER = "64b00000000000000000001f";
  const userSave = jest.fn();
  const employerSave = jest.fn();

  const patch = (role: string) => {
    const r = new NextRequest(`http://t/api/employers/${EMP_USER}`, {
      method: "PATCH",
      body: JSON.stringify({ companyName: "Renamed Co" }),
      headers: { "content-type": "application/json" },
    });
    (r as unknown as { __ctx: unknown }).__ctx = { userId: `${role}-user`, role, locale: "en" };
    return (DETAIL_PATCH as unknown as (r: NextRequest, p: Record<string, string>) => Promise<Response>)(r, { id: EMP_USER });
  };

  beforeEach(() => {
    userFindById.mockResolvedValue({ _id: EMP_USER, save: userSave });
    // Lean profile lookup (ownership check) and the document fetched for the write.
    employerFindOne.mockImplementation(() => {
      const doc = { _id: EMP_ASSIGNED, userId: EMP_USER, save: employerSave };
      return Object.assign(Promise.resolve(doc), chain(doc));
    });
  });

  it("an agent assigned to the employer can edit it", async () => {
    agentFindOne.mockReturnValue(chain({ _id: TEAM_AGENT, assignedEmployerIds: [EMP_ASSIGNED] }));
    const res = await patch("agent");
    expect(res.status).toBe(200);
    expect(employerSave).toHaveBeenCalled();
  });

  it("an agent who only sees the employer through the region gets 403", async () => {
    agentFindOne.mockReturnValue(chain({ _id: TEAM_AGENT, assignedEmployerIds: [EMP_REGION] }));
    expect((await patch("agent")).status).toBe(403);
    expect(employerSave).not.toHaveBeenCalled();
  });

  // The agent form edits company name, industry and location. The login email
  // (and contact name) belong to the account holder: an agent able to repoint
  // the login email could take the account over through password reset.
  it("an assigned agent cannot change the login email or contact name", async () => {
    agentFindOne.mockReturnValue(chain({ _id: TEAM_AGENT, assignedEmployerIds: [EMP_ASSIGNED] }));
    const user: Record<string, unknown> = { _id: EMP_USER, email: "owner@co.test", name: "Owner", save: userSave };
    userFindById.mockResolvedValue(user);
    const employerDoc: Record<string, unknown> = { _id: EMP_ASSIGNED, userId: EMP_USER, companyEmail: "owner@co.test", save: employerSave };
    employerFindOne.mockImplementation(() => Object.assign(Promise.resolve(employerDoc), chain(employerDoc)));

    const r = new NextRequest(`http://t/api/employers/${EMP_USER}`, {
      method: "PATCH",
      body: JSON.stringify({ email: "agent@evil.test", name: "Someone Else", companyName: "Renamed Co" }),
      headers: { "content-type": "application/json" },
    });
    (r as unknown as { __ctx: unknown }).__ctx = { userId: "agent-user", role: "agent", locale: "en" };
    const res = await (DETAIL_PATCH as unknown as (r: NextRequest, p: Record<string, string>) => Promise<Response>)(r, { id: EMP_USER });

    expect(res.status).toBe(200);
    expect(user.email).toBe("owner@co.test");
    expect(user.name).toBe("Owner");
    expect(employerDoc.companyEmail).toBe("owner@co.test");
    expect(employerDoc.companyName).toBe("Renamed Co");
  });

  it("an agent is refused when the user has no employer profile", async () => {
    employerFindOne.mockImplementation(() => Object.assign(Promise.resolve(null), chain(null)));
    agentFindOne.mockReturnValue(chain({ _id: TEAM_AGENT, assignedEmployerIds: [EMP_ASSIGNED] }));
    expect((await patch("agent")).status).toBe(403);
  });
});
