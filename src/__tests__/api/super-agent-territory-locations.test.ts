/**
 * @jest-environment node
 */
/**
 * GET /api/super-agent/territory/locations
 *
 * The public /api/filters/locations feed lists every country. A super-agent
 * picking a region for a new agent must only be offered their own territory,
 * otherwise the POST rejects with "regions must be within your territory"
 * after the form is filled in. This endpoint narrows each cascade level to
 * the SA's assigned states plus the parent chain of their assigned cities.
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

/** Territory: whole state "st_full" + one city "c_tirur" inside state "st_kerala". */
let region: { assignedCityIds: string[]; assignedStateIds: string[] } | null = {
  assignedCityIds: ["c_tirur"],
  assignedStateIds: ["st_full"],
};

jest.mock("@/lib/auth/agentRestrictions", () => ({
  getSuperAgentOwnRegion: jest.fn(async () => region),
}));

const seen: { country: unknown[]; state: unknown[]; city: unknown[] } = { country: [], state: [], city: [] };

function chain(result: unknown) {
  const node: Record<string, unknown> = {};
  for (const method of ["sort", "select"]) node[method] = jest.fn(() => node);
  node.lean = jest.fn(async () => result);
  return node;
}

const CITIES = [
  { _id: "c_tirur", name: "Tirur", stateId: "st_kerala" },
  { _id: "c_kochi", name: "Kochi", stateId: "st_kerala" },
  { _id: "c_full_1", name: "Full One", stateId: "st_full" },
];
const STATES = [
  { _id: "st_kerala", name: "Kerala", countryId: "co_in" },
  { _id: "st_full", name: "Fullstate", countryId: "co_ae" },
  { _id: "st_other", name: "Other", countryId: "co_us" },
];
const COUNTRIES = [
  { _id: "co_in", name: "India" },
  { _id: "co_ae", name: "UAE" },
  { _id: "co_us", name: "USA" },
];

function inSet(filter: Record<string, unknown>, key: string, id: string) {
  const f = filter[key] as { $in?: string[] } | string | undefined;
  if (f === undefined) return true;
  if (typeof f === "string") return f === id;
  return (f.$in ?? []).map(String).includes(id);
}

jest.mock("@/models/City", () => ({
  __esModule: true,
  default: {
    find: jest.fn((filter: Record<string, unknown>) => {
      seen.city.push(filter);
      return chain(CITIES.filter((c) => inSet(filter, "_id", c._id) && inSet(filter, "stateId", c.stateId)));
    }),
  },
}));
jest.mock("@/models/State", () => ({
  __esModule: true,
  default: {
    find: jest.fn((filter: Record<string, unknown>) => {
      seen.state.push(filter);
      return chain(STATES.filter((s) => inSet(filter, "_id", s._id) && inSet(filter, "countryId", s.countryId)));
    }),
  },
}));
jest.mock("@/models/Country", () => ({
  __esModule: true,
  default: {
    find: jest.fn((filter: Record<string, unknown>) => {
      seen.country.push(filter);
      return chain(COUNTRIES.filter((c) => inSet(filter, "_id", c._id)));
    }),
  },
}));

import { GET } from "@/app/api/super-agent/territory/locations/route";

function call(query: string, role = "super_agent") {
  const req = new NextRequest(`http://localhost/api/super-agent/territory/locations?${query}`) as NextRequest & { __ctx: unknown };
  req.__ctx = { userId: "sa_user", role };
  return GET(req, { params: Promise.resolve({}) });
}

beforeEach(() => {
  region = { assignedCityIds: ["c_tirur"], assignedStateIds: ["st_full"] };
  seen.country = []; seen.state = []; seen.city = [];
});

describe("GET /api/super-agent/territory/locations", () => {
  it("rejects non super-agents", async () => {
    const res = await call("level=countries", "agent");
    expect(res.status).toBe(403);
  });

  it("countries: only those containing the territory", async () => {
    const res = await call("level=countries");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.countries.map((c: { _id: string }) => c._id).sort()).toEqual(["co_ae", "co_in"]);
  });

  it("states: only assigned states and parents of assigned cities", async () => {
    const res = await call("level=states&countryId=co_in");
    const body = await res.json();
    expect(body.states.map((s: { _id: string }) => s._id)).toEqual(["st_kerala"]);
    // State "Other" (co_us) must never leak even without the country filter.
    const all = await (await call("level=states&countryId=co_us")).json();
    expect(all.states).toEqual([]);
  });

  it("cities: whole assigned state exposes every city and is selectable as a state", async () => {
    const body = await (await call("level=cities&stateId=st_full")).json();
    expect(body.cities.map((c: { _id: string }) => c._id)).toEqual(["c_full_1"]);
    expect(body.stateFullyAssigned).toBe(true);
  });

  it("cities: partially assigned state exposes only the assigned cities and is NOT selectable as a state", async () => {
    const body = await (await call("level=cities&stateId=st_kerala")).json();
    expect(body.cities.map((c: { _id: string }) => c._id)).toEqual(["c_tirur"]);
    expect(body.stateFullyAssigned).toBe(false);
  });

  it("cities: a state outside the territory yields nothing", async () => {
    const body = await (await call("level=cities&stateId=st_other")).json();
    expect(body.cities).toEqual([]);
    expect(body.stateFullyAssigned).toBe(false);
  });

  it("empty territory yields empty lists, never the full catalogue", async () => {
    region = { assignedCityIds: [], assignedStateIds: [] };
    const body = await (await call("level=countries")).json();
    expect(body.countries).toEqual([]);
    expect(seen.country).toEqual([]);
  });

  it("missing profile fails closed", async () => {
    region = null;
    const body = await (await call("level=countries")).json();
    expect(body.countries).toEqual([]);
  });
});
