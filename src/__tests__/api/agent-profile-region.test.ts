/**
 * @jest-environment node
 */
/**
 * GET /api/agent/profile and GET /api/super-agent/profile carry the region an
 * admin assigned (by name) so the profile can show it read-only; the agent's
 * also names the super-agent they report to.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function) => {
    return async (req: NextRequest) => handler(req, (req as unknown as { __ctx: unknown }).__ctx);
  },
}));

const resolveAssignedRegionsMock = jest.fn();
jest.mock("@/lib/agents/assignedRegion", () => ({
  __esModule: true,
  ...jest.requireActual("@/lib/agents/assignedRegion"),
  resolveAssignedRegions: (...args: unknown[]) => resolveAssignedRegionsMock(...args),
}));

function lean(result: unknown) {
  const node: Record<string, unknown> = {};
  node.select = jest.fn(() => node);
  node.lean = jest.fn(async () => result);
  return node;
}

const agentFindOne = jest.fn();
const saFindOne = jest.fn();
const saFindById = jest.fn();
const userFindById = jest.fn();

jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findOne: (...a: unknown[]) => agentFindOne(...a) } }));
jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: {
    findOne: (...a: unknown[]) => saFindOne(...a),
    findById: (...a: unknown[]) => saFindById(...a),
  },
}));
jest.mock("@/models/User", () => ({ __esModule: true, default: { findById: (...a: unknown[]) => userFindById(...a) } }));

// The City/State/Country models are behind the mocked resolver; stub them so
// the real module's imports do not pull in bson.
jest.mock("@/models/City", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/State", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/Country", () => ({ __esModule: true, default: {} }));

import { GET as agentRoute } from "@/app/api/agent/profile/route";
import { GET as saRoute } from "@/app/api/super-agent/profile/route";

const routeCtx = { params: Promise.resolve({}) };
const agentGET = (r: NextRequest) => agentRoute(r, routeCtx);
const saGET = (r: NextRequest) => saRoute(r, routeCtx);

const TIRUR = { id: "c_tirur", type: "city", name: "Tirur", parent: "Kerala, India" };

function req(url: string, ctx: Record<string, unknown>) {
  const r = new NextRequest(url);
  (r as unknown as { __ctx: unknown }).__ctx = ctx;
  return r;
}

beforeEach(() => {
  jest.clearAllMocks();
  resolveAssignedRegionsMock.mockResolvedValue([TIRUR]);
});

describe("GET /api/agent/profile", () => {
  const ctx = { userId: "u_agent", role: "agent", locale: "en" };

  beforeEach(() => {
    agentFindOne.mockReturnValue(lean({
      commissionRate: 5,
      currencyCode: "INR",
      assignedCityIds: ["c_tirur"],
      assignedStateIds: [],
      superAgentId: "sa_profile",
    }));
    saFindById.mockReturnValue(lean({ userId: "u_sa", roleArchivedAt: null }));
    userFindById.mockImplementation((id: string) =>
      lean(id === "u_sa" ? { name: "Super Agent", email: "superagent@mployedin.com" } : { name: "Agent", phone: "" }),
    );
  });

  it("returns the assigned region by name and the super-agent the agent reports to", async () => {
    const res = await agentGET(req("http://localhost/api/agent/profile?locale=ar", ctx));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.profile.assignedRegions).toEqual([TIRUR]);
    expect(body.profile.superAgent).toEqual({ name: "Super Agent", email: "superagent@mployedin.com" });
    // Named in the page's locale, not the saved preference.
    expect(resolveAssignedRegionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ assignedCityIds: ["c_tirur"] }),
      "ar",
    );
  });

  it("shows no super-agent when none is linked or the link points at an archived one", async () => {
    agentFindOne.mockReturnValue(lean({ assignedCityIds: [], assignedStateIds: [] }));
    let body = await (await agentGET(req("http://localhost/api/agent/profile", ctx))).json();
    expect(body.profile.superAgent).toBeNull();
    expect(saFindById).not.toHaveBeenCalled();
    expect(resolveAssignedRegionsMock).toHaveBeenLastCalledWith(expect.anything(), "en");

    agentFindOne.mockReturnValue(lean({ superAgentId: "sa_profile" }));
    saFindById.mockReturnValue(lean({ userId: "u_sa", roleArchivedAt: new Date() }));
    body = await (await agentGET(req("http://localhost/api/agent/profile", ctx))).json();
    expect(body.profile.superAgent).toBeNull();
  });

  it("stays forbidden to other roles", async () => {
    const res = await agentGET(req("http://localhost/api/agent/profile", { ...ctx, role: "employer" }));
    expect(res.status).toBe(403);
    expect(resolveAssignedRegionsMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/super-agent/profile", () => {
  const ctx = { userId: "u_sa", role: "super_agent", locale: "en" };

  it("returns the super-agent's own territory by name, without the raw ids", async () => {
    saFindOne.mockReturnValue(lean({
      overrideRate: 2,
      commissions: { total: 0, pending: 0, paid: 0 },
      currencyCode: "INR",
      country: "IN",
      assignedCityIds: ["c_tirur"],
      assignedStateIds: [],
    }));
    userFindById.mockReturnValue(lean({ name: "Super Agent", phone: "" }));

    const body = await (await saGET(req("http://localhost/api/super-agent/profile", ctx))).json();

    expect(body.profile.assignedRegions).toEqual([TIRUR]);
    expect(body.profile).not.toHaveProperty("assignedCityIds");
    expect(body.profile).not.toHaveProperty("assignedStateIds");
    expect(body.profile.overrideRate).toBe(2);
    expect(resolveAssignedRegionsMock).toHaveBeenCalledWith({ assignedCityIds: ["c_tirur"], assignedStateIds: [] }, "en");
  });

  it("returns an empty region list when the profile does not exist yet", async () => {
    saFindOne.mockReturnValue(lean(null));
    userFindById.mockReturnValue(lean({ name: "Super Agent", phone: "" }));

    const body = await (await saGET(req("http://localhost/api/super-agent/profile", ctx))).json();
    expect(body.profile.assignedRegions).toEqual([]);
  });
});
