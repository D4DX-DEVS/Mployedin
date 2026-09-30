/**
 * @jest-environment node
 *
 * Client report 2026-09-30, #5: agents (and super-agents) see the job seekers
 * who live in their area — a seeker's area is the catalogue city they picked —
 * on top of the seekers they own. Hidden profiles stay hidden, and seeing is
 * not owning: area seekers can be opened, not edited or removed.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
let ctxRole = "agent";
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth:
    (handler: (...args: unknown[]) => unknown) =>
    async (req: NextRequest) =>
      handler(req, { userId: "staff_1", role: ctxRole, locale: "en" }),
}));
jest.mock("@/lib/referrals/summary", () => ({ decorateReferralSummaries: jest.fn(async (items: unknown[]) => items) }));
jest.mock("@/models/User", () => ({ __esModule: true, default: { collection: { name: "users" } } }));

const AGENT_DOC = "660000000000000000000001";
const SA_DOC = "660000000000000000000002";
const CITY = "550000000000000000000001";
const OTHER_CITY = "550000000000000000000002";
const STATE = "540000000000000000000001";
const OWN_SEEKER = "770000000000000000000001";
const AREA_SEEKER = "770000000000000000000002";

let agentDoc: Record<string, unknown> | null;
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: { findOne: jest.fn(() => ({ select: () => ({ lean: async () => agentDoc }) })) },
}));
jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: { findOne: jest.fn(() => ({ select: () => ({ lean: async () => ({ _id: SA_DOC }) }) })) },
}));

let territory: { assignedCityIds: string[]; assignedStateIds: string[] } | null;
jest.mock("@/lib/auth/agentRestrictions", () => {
  const actual = jest.requireActual("@/lib/auth/agentRestrictions");
  return {
    ...actual,
    getSuperAgentScope: async () => ({ effectiveAgentIds: [] }),
    getSuperAgentTerritory: async () => territory,
  };
});

const filters: Array<{ $and?: unknown[] }> = [];
let rows: Array<Record<string, unknown>> = [];
function chain(result: unknown) {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["populate", "sort", "skip", "limit", "select"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn(async () => result);
  return c;
}
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    find: jest.fn((f: { $and?: unknown[] }) => { filters.push(f); return chain(rows); }),
    countDocuments: jest.fn(async () => rows.length),
    aggregate: jest.fn(async () => [{ items: [], count: [] }]),
  },
}));

import { canStaffAccessSeeker } from "@/lib/jobSeeker/staffAccess";
import { seekerInRegion, seekerRegionMatch } from "@/lib/auth/agentRestrictions";

async function list(qs = "") {
  const { GET } = await import("@/app/api/job-seekers/route");
  const res = await GET(new NextRequest(`http://localhost:3888/api/job-seekers?${qs}`), { params: Promise.resolve({}) });
  return res.json();
}
const lastAnd = () => filters[filters.length - 1].$and ?? [];
const areaClause = (field: "regionCityId" | "regionStateId", id: string) => ({
  $or: [{ [field]: { $in: [id] } }],
  profileVisibility: { $ne: "hidden" },
});

beforeEach(() => {
  filters.length = 0;
  rows = [];
  ctxRole = "agent";
  agentDoc = { _id: AGENT_DOC, assignedJobSeekerIds: [], assignedCityIds: [CITY], assignedStateIds: [] };
  territory = { assignedCityIds: [], assignedStateIds: [STATE] };
});

describe("seekerRegionMatch / seekerInRegion", () => {
  it("matches the area's city or state, never a hidden profile", () => {
    expect(seekerRegionMatch({ assignedCityIds: [CITY] as never, assignedStateIds: [STATE] as never })).toEqual({
      $or: [{ regionCityId: { $in: [CITY] } }, { regionStateId: { $in: [STATE] } }],
      profileVisibility: { $ne: "hidden" },
    });
    const region = { assignedCityIds: [CITY] as never[], assignedStateIds: [STATE] as never[] };
    expect(seekerInRegion({ regionCityId: CITY }, region)).toBe(true);
    expect(seekerInRegion({ regionCityId: OTHER_CITY, regionStateId: STATE }, region)).toBe(true);
    expect(seekerInRegion({ regionCityId: CITY, profileVisibility: "hidden" }, region)).toBe(false);
    expect(seekerInRegion({ regionCityId: OTHER_CITY }, region)).toBe(false);
  });

  it("an empty territory matches nobody", () => {
    expect(seekerRegionMatch({ assignedCityIds: [], assignedStateIds: [] })).toBeNull();
    expect(seekerInRegion({ regionCityId: CITY }, { assignedCityIds: [], assignedStateIds: [] })).toBe(false);
    expect(seekerInRegion({ regionCityId: CITY }, null)).toBe(false);
  });
});

describe("GET /api/job-seekers — agent", () => {
  it("adds the visible seekers of the agent's area to what they own", async () => {
    await list();
    const scope = lastAnd().find((c) => (c as { $or?: unknown[] }).$or) as { $or: unknown[] };
    expect(scope.$or).toContainEqual({ agentId: AGENT_DOC });
    expect(scope.$or).toContainEqual(areaClause("regionCityId", CITY));
  });

  it("'In my area' narrows the list to the area", async () => {
    const body = await list("view=area");
    expect(lastAnd()).toContainEqual(areaClause("regionCityId", CITY));
    expect(body.areaAssigned).toBe(true);
  });

  it("'In my area' shows nobody, and says so, when the agent has no area", async () => {
    agentDoc = { _id: AGENT_DOC, assignedJobSeekerIds: [], assignedCityIds: [], assignedStateIds: [] };
    const body = await list("view=area");
    expect(lastAnd()).toContainEqual({ _id: { $in: [] } });
    expect(body.areaAssigned).toBe(false);
  });

  it("marks each row as the agent's own or only in their area", async () => {
    rows = [
      { _id: OWN_SEEKER, referral: { agentId: AGENT_DOC } },
      { _id: AREA_SEEKER, regionCityId: CITY },
    ];
    const body = await list();
    expect(body.items.map((r: { staffAccess: string }) => r.staffAccess)).toEqual(["own", "area"]);
  });
});

describe("GET /api/job-seekers — super-agent", () => {
  it("adds the visible seekers of the territory", async () => {
    ctxRole = "super_agent";
    await list();
    const scope = lastAnd().find((c) => (c as { $or?: unknown[] }).$or) as { $or: unknown[] };
    expect(scope.$or).toContainEqual(areaClause("regionStateId", STATE));
  });

  it("adds nothing for an empty territory", async () => {
    ctxRole = "super_agent";
    territory = { assignedCityIds: [], assignedStateIds: [] };
    await list();
    expect(JSON.stringify(filters[filters.length - 1])).not.toContain("regionCityId");
  });
});

describe("canStaffAccessSeeker — area seekers are view-only", () => {
  const areaSeeker = (extra: Record<string, unknown> = {}) => ({ _id: AREA_SEEKER, regionCityId: CITY, ...extra });

  it("agent may view, not manage, a seeker in their area", async () => {
    expect(await canStaffAccessSeeker(areaSeeker(), { userId: "u1", role: "agent" }, "view")).toBe(true);
    expect(await canStaffAccessSeeker(areaSeeker(), { userId: "u1", role: "agent" }, "manage")).toBe(false);
    expect(await canStaffAccessSeeker(areaSeeker(), { userId: "u1", role: "agent" })).toBe(false);
  });

  it("a hidden profile stays hidden from the area's agent", async () => {
    expect(await canStaffAccessSeeker(areaSeeker({ profileVisibility: "hidden" }), { userId: "u1", role: "agent" }, "view")).toBe(false);
  });

  it("a profile converted to another role is out of reach through the area", async () => {
    expect(await canStaffAccessSeeker(areaSeeker({ roleArchivedAt: new Date() }), { userId: "u1", role: "agent" }, "view")).toBe(false);
    expect(await canStaffAccessSeeker(areaSeeker({ regionStateId: STATE, roleArchivedAt: new Date() }), { userId: "u1", role: "super_agent" }, "view")).toBe(false);
  });

  it("a seeker outside the area stays out", async () => {
    expect(await canStaffAccessSeeker(areaSeeker({ regionCityId: OTHER_CITY }), { userId: "u1", role: "agent" }, "view")).toBe(false);
  });

  it("super-agent may view, not manage, a seeker in their territory", async () => {
    const seeker = areaSeeker({ regionCityId: OTHER_CITY, regionStateId: STATE });
    expect(await canStaffAccessSeeker(seeker, { userId: "u1", role: "super_agent" }, "view")).toBe(true);
    expect(await canStaffAccessSeeker(seeker, { userId: "u1", role: "super_agent" }, "manage")).toBe(false);
    expect(await canStaffAccessSeeker({ ...seeker, profileVisibility: "hidden" }, { userId: "u1", role: "super_agent" }, "view")).toBe(false);
  });
});
